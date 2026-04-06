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
- Table: `waves` (uuid PK, `from_user_id`, `to_user_id`, `status`, `sender_status_snapshot`, `recipient_status_snapshot`, `responded_at`, `created_at`)
- Indexes: `(from_user_id, status)`, `(to_user_id, status)`
- Statuses: `pending` (default), `accepted`, `declined`

```
A sends wave --> pending
  --> B accepts --> accepted --> conversation created
  --> B declines --> declined (24h cooldown starts)
  --> B ignores --> stays pending indefinitely
```

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

After validations pass, a serializable-isolation transaction checks for an existing pending wave A-->B and inserts the new wave. The serializable isolation level prevents two concurrent sends from both succeeding.

**Note on daily limit:** The count query uses `gte(createdAt, todayMidnight)` where `todayMidnight` is midnight UTC. This means the counter resets at midnight UTC, not local time. PRODUCT.md specifies 5/day (Basic) and 20/day (Premium) --- code currently only enforces the Basic limit (`DAILY_PING_LIMIT_BASIC = 5`). Premium tier not yet implemented.

**Note on PRODUCT.md discrepancy:** PRODUCT.md says "pings to friends don't count against daily limit." Code does not implement this exception yet.

## Status Snapshots

**What:** At send time, the sender's `currentStatus` is stored in `senderStatusSnapshot` on the wave row. At accept time, the responder's `currentStatus` is stored in `recipientStatusSnapshot`.

**Why:** These snapshots power the "first contact card" in chat. The card shows what each person's status was when they connected --- providing context for why they reached out. Statuses change frequently, so the snapshot preserves the moment of connection.

**Config:** Both fields are nullable `text` columns on the `waves` table. They flow into the `conversations.metadata` JSONB field as `senderStatus` and `recipientStatus` when the conversation is created.

## Mutual Ping Detection

**What:** If A sends a wave to B while B already has a pending wave to A created within the last 30 seconds, both waves are auto-accepted and a conversation opens immediately.

**Why:** PRODUCT.md specifies this as a special moment: "Pingowaliscie sie wzajemnie w tym samym momencie. To rzadkie. To zostaje." It removes the friction of waiting for acceptance when both people clearly want to connect.

**Config:** `MUTUAL_PING_WINDOW_SECONDS = 30`

**Detection timing:** The mutual check happens AFTER the new wave is inserted. The code queries for a pending wave `FROM toUserId TO ctx.userId` created within the window. If found, it enters the mutual-accept flow.

**Race condition guard:** Two concurrent sends (A-->B and B-->A arriving simultaneously) can both detect the reverse wave. The code handles this with a transaction that does `UPDATE ... WHERE id IN (wave.id, reverseWave.id) AND status = 'pending'`. The `RETURNING` clause checks if both rows were updated (`.length < 2` means the other process already handled it). The loser returns the wave as-is and relies on WebSocket events from the winner to update the client.

**Mutual ping notifications:** Both users receive push notifications with the message "Pingowaliscie sie wzajemnie --- to rzadkie!" and data type `chat` pointing to the new conversation. Two `waveResponded` WebSocket events are published --- one for each user's wave --- both with `accepted: true` and the shared `conversationId`.

**Conversation metadata for mutual pings** includes `isMutualPing: true`, both status snapshots (sender's current status as `senderStatus`, reverse wave's snapshot as `recipientStatus`), and `connectedAt`. No `connectedDistance` --- distance is only computed on manual accept path.

**Return value:** The send mutation returns the wave with `status: "accepted"`, `mutualPing: true`, and `conversationId`. The client can navigate directly to the chat.

## Responding to a Wave

**What:** Single endpoint `waves.respond` handles both accept and decline via a boolean `accept` field.

**Why:** One endpoint is simpler to rate-limit and audit than two.

### Accept Path

1. Fetch both profiles in parallel (responder for status snapshot + notification, sender for location)
2. Compute Haversine distance between sender and recipient at accept time (stored as `connectedDistance` in conversation metadata)
3. Transaction: UPDATE wave to `accepted` with `WHERE status = 'pending'` guard + INSERT conversation + INSERT two participants
4. The `WHERE status = 'pending'` guard is the atomic race-condition protection --- if two concurrent accepts arrive, only one succeeds (the other gets `Wave already responded to`)
5. Push notification to sender: "{name} --- ping przyjety!"
6. WebSocket `waveResponded` event with `accepted: true`, `conversationId`, and responder profile preview

### Decline Path

1. Single atomic UPDATE with `WHERE status = 'pending'` guard
2. No push notification to sender (PRODUCT.md: avoid rejection notifications)
3. WebSocket `waveResponded` event with `accepted: false`
4. Triggers 24h decline cooldown for re-pinging the same person

## Conversation Creation on Accept

**What:** When a wave is accepted (manually or via mutual ping), a new `conversations` row of type `dm` is created with both users as participants.

**Why:** The conversation is the payoff of the wave flow. PRODUCT.md principle #4 (progressive disclosure): accepting a wave unlocks full profile, social links, and direct chat.

**Conversation metadata (JSONB):**
- `senderStatus` --- sender's status at wave send time (from `senderStatusSnapshot`)
- `recipientStatus` --- recipient's status at accept time (from responder's `currentStatus`)
- `connectedAt` --- ISO timestamp of when the conversation was created
- `connectedDistance` --- Haversine distance in meters between both users at accept time (manual accept only, null for mutual ping)
- `isMutualPing` --- `true` only for mutual ping conversations

**Participants:** Two rows in `conversationParticipants` with role `member` (default).

**Note:** The current code always creates a new conversation. There is no check for an existing DM between the same two users. If both users ping each other in separate (non-mutual) flows, they could end up with multiple DM conversations.

## Blocking

**What:** `waves.block` creates a block record and atomically declines all pending waves from the blocked user. `waves.unblock` removes the block. `waves.getBlocked` lists blocked users with profile data.

**Why:** Blocking must immediately stop all pending interaction attempts. The atomic transaction ensures no race condition where a pending wave slips through during the block.

**Atomicity:** Block insert + pending wave decline happen in one transaction. Only waves FROM the blocked user TO the blocker are declined (not the reverse --- the blocker's own pending waves to the blocked user are not affected).

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
| `waves.send` | 30 requests | 4 hours |
| `waves.respond` | 60 requests | 1 hour |

These are abuse-prevention limits, separate from the business logic limits in `pingLimits.ts`. A normal user sending 5 pings/day will never hit the 30/4h rate limit.

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
| Rate limit (send) | 30 / 4h | `rateLimits["waves.send"]` |
| Rate limit (respond) | 60 / 1h | `rateLimits["waves.respond"]` |

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
