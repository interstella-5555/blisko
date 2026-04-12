# Waves (Pings) & Connections

> v1 --- AI-generated from source analysis, 2026-04-06.

## Terminology & Product Alignment

| PRODUCT.md term | Codebase term | Notes |
|---|---|---|
| Ping | Wave | PRODUCT.md says "ping" everywhere. Code uses "wave" in all tables, types, routes, and events. Legacy naming kept for backward compat. |
| Ping limit | `DAILY_PING_LIMIT_BASIC` | Config in `pingLimits.ts` |
| Mutual ping | Mutual wave / `reverseWave` | Auto-accept when both ping within 30s window |
| First contact card | Conversation `metadata` | Status snapshots stored as `senderStatus` / `recipientStatus` in conversation metadata |
| Cooldown 24h (after decline) | `DECLINE_COOLDOWN_HOURS` | PRODUCT.md says 24h, code confirms |
| Banska na mapie (bubble) | Profile on map | No "bubble" entity in code --- it's a client-side rendering of profile data |
| Accept / Decline | `respondToWaveSchema.accept` (boolean) | Single endpoint, branched by boolean |

## Wave Lifecycle

**What:** A wave is an irreversible connection request. No cancel, no undo --- by design, to prevent wave/unwave notification spam.

**Why:** Friction prevents spamming. If you could undo, users would wave/unwave repeatedly, causing notification noise.

**Config:**
- Table: `waves` (uuid PK, `from_user_id`, `to_user_id`, `status`, `sender_status_snapshot`, `recipient_status_snapshot`, `responded_at`, `created_at`, `pair_key`)
- `pair_key` is a STORED generated column: `md5(LEAST(from_user_id, to_user_id) || ':' || GREATEST(from_user_id, to_user_id))`. Direction-agnostic — `(A,B)` and `(B,A)` produce the same value. Postgres recomputes it on every UPDATE that touches the source columns; applications never write to it.
- Indexes: `(from_user_id, status)`, `(to_user_id, status)`, plus a partial unique index `waves_active_unique` on `pair_key WHERE status IN ('pending', 'accepted')`
- Statuses: `pending` (default), `accepted`, `declined`
- `accepted` is currently **terminal** — no code path transitions a wave out of `accepted`. There is no "unfriend" / reconnect flow yet.

```
A sends wave --> pending
  --> B accepts --> accepted (terminal) --> conversation created
  --> B declines --> declined (24h cooldown starts, eligible for re-wave after)
  --> B ignores --> stays pending indefinitely (no expiry job)
```

**Active-wave uniqueness:** At most one wave in an "active" status (`pending` or `accepted`) can exist per **pair** of users (direction does not matter — `(A,B)` and `(B,A)` produce the same `pair_key`). The single partial unique index `waves_active_unique` enforces three rules at once:

1. No duplicate pending in the same direction (race protection on `waves.send`).
2. No re-waving someone you are already connected with (any direction).
3. No two pending waves in opposite directions — see "Implicit Accept on Conflict" below.

Declined waves do not occupy a slot, so re-waving after decline is possible once the cooldown passes. See `rate-limiting.md` → "Wave send race condition" for the full rationale on hard vs soft invariants.

## Send Validations

**What:** Six sequential validation checks before a wave is inserted. Every check throws a TRPCError if it fails.

**Why:** Prevent abuse, spam, self-pings, and interactions with invisible/blocked/deleted users.

| # | Check | Error code | Error message | Config value |
|---|---|---|---|---|
| 1 | Target user exists and not soft-deleted | `NOT_FOUND` | `User not found` | INNER JOIN to `user` table, `deletedAt IS NULL` |
| 2 | No block in either direction (A blocked B or B blocked A) | `FORBIDDEN` | `Cannot send wave to this user` | Bidirectional check on `blocks` table |
| 3 | Sender is not in ninja mode | `FORBIDDEN` | `hidden_cannot_ping` | Checks `visibilityMode` on sender's profile |
| 4 | Daily ping limit not exceeded | `TOO_MANY_REQUESTS` | `daily_limit` | `DAILY_PING_LIMIT_BASIC = 5` per UTC day |
| 5 | Per-person cooldown not active | `TOO_MANY_REQUESTS` | `per_person:{hours}` | `PER_PERSON_COOLDOWN_HOURS = 24` |
| 6 | Decline cooldown not active | `TOO_MANY_REQUESTS` | `cooldown:{hours}` | `DECLINE_COOLDOWN_HOURS = 24` |

After validations pass, the insert is a single `INSERT ... ON CONFLICT (pair_key) WHERE status IN ('pending', 'accepted') DO NOTHING RETURNING ...`. The `waves_active_unique` partial unique index handles the hard correctness rules at the database layer. If `returning` comes back with the new wave we proceed normally; if it comes back empty `waves.send` runs one disambiguation SELECT (see "Implicit Accept on Conflict"). One query on the happy path, no transaction.

**Note on daily limit:** The count query uses `gte(createdAt, todayMidnight)` where `todayMidnight` is midnight UTC. This means the counter resets at midnight UTC, not local time. PRODUCT.md specifies 5/day (Basic) and 20/day (Premium) --- code currently only enforces the Basic limit (`DAILY_PING_LIMIT_BASIC = 5`). Premium tier not yet implemented.

**Note on PRODUCT.md discrepancy:** PRODUCT.md says "pings to friends don't count against daily limit." Code does not implement this exception yet.

## Status Snapshots

**What:** At send time, the sender's `currentStatus` is stored in `senderStatusSnapshot` on the wave row. At accept time, the responder's `currentStatus` is stored in `recipientStatusSnapshot`.

**Why:** These snapshots power the "first contact card" in chat. The card shows what each person's status was when they connected --- providing context for why they reached out. Statuses change frequently, so the snapshot preserves the moment of connection.

**Config:** Both fields are nullable `text` columns on the `waves` table. They flow into the `conversations.metadata` JSONB field as `senderStatus` and `recipientStatus` when the conversation is created.

## Implicit Accept on Conflict

**What:** When `waves.send` does its insert and the `waves_active_unique` index swallows it via `ON CONFLICT (pair_key) DO NOTHING`, `returning` comes back empty. The procedure does not surface that as an error directly. Instead it issues one disambiguation `SELECT` against the active set for the pair and chooses one of three responses:

| Existing row found | Response | Reason |
|---|---|---|
| `status = 'accepted'` (either direction) | `CONFLICT: already_connected` | Conversation already exists, this would be a ghost wave on top of it. |
| `status = 'pending'`, `from = current user` | `CONFLICT: already_waved` | We already pinged this person, they have not responded yet. |
| `status = 'pending'`, `from = the other user` | **Implicit accept** — call `acceptWaveCore` on the existing wave | They pinged us first; we just clicked ping (the WS update flipping the button to "accept" did not reach us yet — typical lag/race window). Both clearly want to connect, so we accept their pending wave on our behalf instead of failing. |

**Why this design:** The standard product flow is "one person pings, the other accepts/declines". The race window where both users could click ping is genuinely tiny (the receiving user's UI flips the wave button to an accept button via WebSocket within sub-100ms of the first ping landing on the server). When that race does fire, treating the second click as "they want to connect, accept my pending wave" is the intuitive product behaviour — it leads to an immediate connection rather than a confusing error.

This replaces the old explicit "mutual ping detection" mechanism that ran a 30-second post-insert lookup for a reverse wave. That code was effectively unreachable in normal use (the WS-driven UI update beat the user every time) and required two separate wave rows + window timing. The new design uses the same partial unique index that already enforces the active-pair invariant — one less moving part, less code, no window to tune.

**Implementation:**

- `pair_key` is a STORED generated column on `waves`: `md5(LEAST(from_user_id, to_user_id) || ':' || GREATEST(from_user_id, to_user_id))`. The `waves_active_unique` partial unique index is built on `pair_key`, so drizzle's `onConflictDoNothing({ target: schema.waves.pairKey, where: ... })` can reference it via the standard column API — no expression-based arbiter, no try/catch on error codes.
- `acceptWaveCore(wave, responderUserId, responderProfile, senderLocation)` is the shared accept helper used by both `waves.respond` (explicit accept path) and `waves.send` (implicit accept path). It runs the UPDATE → INSERT conversation → INSERT participants transaction, computes the Haversine distance for `connectedDistance` if both profiles have coordinates, sends the accept push to the original wave sender, and publishes the `waveResponded` WebSocket event.

**Return value:** `waves.send` always returns `{ wave, conversationId, autoAccepted }`:

- Normal insert path: `{ wave: newWave, conversationId: null, autoAccepted: false }`.
- Implicit accept path: `{ wave: existingWave, conversationId: createdConv.id, autoAccepted: true }` — the `wave` here is the OTHER user's now-accepted wave (not a new row), so the client checks `autoAccepted` to navigate straight to the chat instead of treating it as an outgoing pending.

## Responding to a Wave

**What:** Single endpoint `waves.respond` handles both accept and decline via a boolean `accept` field.

**Why:** One endpoint is simpler to rate-limit and audit than two.

### Accept Path

1. Fetch both profiles in parallel (responder for status snapshot + notification, sender for location)
2. Call `acceptWaveCore` which:
   - Computes Haversine distance between sender and recipient (stored as `connectedDistance` in conversation metadata)
   - Runs a transaction: UPDATE wave to `accepted` with `WHERE status = 'pending'` guard + INSERT conversation + INSERT two participants. The `WHERE status = 'pending'` guard is the atomic race-condition protection — if two concurrent accepts arrive (e.g. user double-taps the accept button), only one succeeds (the other gets `Wave already responded to`)
   - Sends push notification to original sender: `"{name} — ping przyjęty! Możecie teraz pisać."`
   - Publishes WebSocket `waveResponded` event with `accepted: true`, `conversationId`, and responder profile preview
3. Returns `{ wave: updatedWave, conversationId }` to the client

The same `acceptWaveCore` is reused by `waves.send` on the implicit-accept path (see "Implicit Accept on Conflict" above).

### Decline Path

1. Single atomic UPDATE with `WHERE status = 'pending'` guard
2. No push notification to sender (PRODUCT.md: avoid rejection notifications)
3. WebSocket `waveResponded` event with `accepted: false`
4. Triggers 24h decline cooldown for re-pinging the same person

## Conversation Creation on Accept

**What:** When a wave is accepted (explicitly via `waves.respond` or implicitly via `waves.send`'s conflict path), a new `conversations` row of type `dm` is created with both users as participants.

**Why:** The conversation is the payoff of the wave flow. PRODUCT.md principle #4 (progressive disclosure): accepting a wave unlocks full profile, social links, and direct chat.

**Conversation metadata (JSONB):**
- `senderStatus` — sender's status at wave send time (from `senderStatusSnapshot`)
- `recipientStatus` — recipient's status at accept time (from responder's `currentStatus`)
- `connectedAt` — ISO timestamp of when the conversation was created
- `connectedDistance` — Haversine distance in meters between both users at accept time (null when either profile lacks coordinates)

**Participants:** Two rows in `conversationParticipants` with role `member` (default).

**Note:** The `waves_active_unique` partial unique index now guarantees there is at most one `accepted` wave per pair of users. Combined with the index, the conversation creation path is unique per pair too — there is no way to end up with two DM conversations between the same two users via `waves.send` / `waves.respond`. (Direct `conversations` insertion paths bypass this guarantee — currently none exist for DMs.)

## Blocking

**What:** `waves.block` creates a block record and atomically declines **all** pending waves between the blocker and the blocked user — both incoming and outgoing. `waves.unblock` removes the block. `waves.getBlocked` lists blocked users with profile data.

**Why:** Blocking must immediately stop all pending interaction attempts in both directions. The block button is rendered on every user profile modal regardless of prior interaction (`apps/mobile/app/(modals)/user/[userId].tsx`), so a user can ping someone and then immediately block them; the bidirectional sweep ensures the outgoing pending wave does not silently stay alive and let the blocked user accept it later. Combined with the `waves_active_unique` partial unique index this also frees the `pair_key` slot, so an unblock + future re-wave between the same pair would not be permanently locked out by a zombie pending row.

**Atomicity:** Block insert + bidirectional pending wave decline happen in one transaction. The decline filter is `(from=blocked AND to=blocker) OR (from=blocker AND to=blocked) AND status='pending'` so both directions are covered in a single UPDATE.

**Unblock:** Simple DELETE from `blocks` table. No restoration of previously declined waves.

**getBlocked query:** Returns blocked users with `displayName`, `avatarUrl`, and `blockedAt`. Filters out soft-deleted users via INNER JOIN to `user` table.

## Query Patterns

**What:** Two read endpoints return wave history with profile data.

| Endpoint | Filters | Joins | Order |
|---|---|---|---|
| `waves.getReceived` | `toUserId = me`, status IN (`pending`, `accepted`), sender not soft-deleted | INNER JOIN `profiles` (sender), INNER JOIN `user` (soft-delete filter) | `createdAt DESC` |
| `waves.getSent` | `fromUserId = me`, recipient not soft-deleted | INNER JOIN `profiles` (recipient), INNER JOIN `user` (soft-delete filter) | `createdAt DESC` |

Both endpoints return sender/recipient `displayName`, `avatarUrl`, and `bio` alongside the wave data.

**Note on getReceived:** Only `pending` and `accepted` waves are returned. Declined waves are excluded --- the recipient doesn't need to see waves they already acted on. Sent waves (`getSent`) return all statuses so the sender can track outcomes.

## Side Effects on Send

After a wave is successfully inserted:

1. **AI analysis promotion:** `promotePairAnalysis(senderId, recipientId)` --- moves existing pair analysis job to highest priority or creates a new one. This ensures the "Co nas laczy" description is ready fast for when the recipient views the sender's profile.
2. **Push notification:** "Blisko" / "{name} --- nowy ping!" with `data: { type: 'wave', userId: senderId }`
3. **WebSocket event:** `newWave` to the recipient with wave data and sender profile preview (`displayName`, `avatarUrl`)

## Rate Limits

From `rateLimits.ts` (sliding window on Redis):

| Endpoint | Limit | Window |
|---|---|---|
| `waves.send` | 300 requests | 4 hours |
| `waves.respond` | 600 requests | 1 hour |

These are abuse-prevention limits, separate from the business logic limits in `pingLimits.ts`. A normal user sending 5 pings/day will never come close — the daily business cap in `pingLimits.ts` is the limit that shapes real usage.

> **Temporary values (BLI-189):** Both numbers above are currently inflated 10× as a mitigation for the map burning through `profiles.getNearby` buckets and cascading into the `global` catch-all. Long-term values (post-BLI-189): `waves.send` 30/4h, `waves.respond` 60/1h. See `rate-limiting.md` for the full BLI-189 note.

## Middleware Chain

Both `waves.send` and `waves.respond` pass through:
1. `protectedProcedure` --- authentication required (session token validated)
2. `featureGate("waves.send"` / `"waves.respond")` --- checks feature gate table (cached 60s), requires `isComplete` profile attribute. If the gate is disabled in the DB, it passes through. If enabled, incomplete profiles get `FORBIDDEN`.
3. `rateLimit("waves.send"` / `"waves.respond")` --- sliding window rate limit via custom Redis Lua scripts

The `block` and `unblock` mutations use only `protectedProcedure` --- no feature gate or rate limit. Blocking should always work regardless of profile completeness.

The `getReceived`, `getSent`, and `getBlocked` queries use only `protectedProcedure` --- read-only endpoints don't need rate limiting or feature gates.

## Concrete Limits Summary

| Limit | Value | Source |
|---|---|---|
| Daily pings (Basic) | 5 / UTC day | `DAILY_PING_LIMIT_BASIC` in `pingLimits.ts` |
| Daily pings (Premium) | 20 / day | PRODUCT.md (not yet in code) |
| Per-person cooldown | 24 hours | `PER_PERSON_COOLDOWN_HOURS` |
| Decline cooldown | 24 hours | `DECLINE_COOLDOWN_HOURS` |
| Mutual ping window | 30 seconds | `MUTUAL_PING_WINDOW_SECONDS` |
| Rate limit (send) | 300 / 4h (BLI-189 temp; long-term 30/4h) | `rateLimits["waves.send"]` |
| Rate limit (respond) | 600 / 1h (BLI-189 temp; long-term 60/1h) | `rateLimits["waves.respond"]` |

## Impact Map

If you change this system, also check:

- **`apps/api/src/config/pingLimits.ts`** --- all timing constants for wave logic
- **`apps/api/src/config/rateLimits.ts`** --- abuse-prevention rate limits
- **`apps/api/src/services/queue.ts`** (`promotePairAnalysis`) --- AI analysis priority boost on wave send
- **`apps/api/src/services/push.ts`** --- push notifications for wave events
- **`apps/api/src/ws/redis-bridge.ts`** --- WebSocket event publishing (`newWave`, `waveResponded`)
- **`packages/shared/src/validators.ts`** --- `sendWaveSchema`, `respondToWaveSchema`, `blockUserSchema`
- **`apps/mobile/`** --- wave list screens, notification handlers, cooldown UI
- **`apps/api/src/trpc/procedures/profiles.ts`** (`getNearbyUsersForMap`) --- decline cooldown filtering hides users you recently declined from the map
- **`apps/api/src/services/data-export.ts`** --- GDPR export includes wave history
- **`docs/architecture/status-matching.md`** --- status snapshots flow into matching context
- **`docs/architecture/messaging.md`** --- conversation creation on accept
