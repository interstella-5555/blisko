# Rate Limiting & Abuse Protection

> v1 — AI-generated from source analysis, 2026-04-06.

## Terminology & Product Alignment

| PRODUCT.md term | Code term | UI term (PL) |
|-----------------|-----------|--------------|
| Ping | Wave (`waves` table, `waves.send` procedure) | Ping / Zaczepka |
| Ping accept/decline | Wave respond (`waves.respond` procedure) | Akceptuj / Odrzuć |
| Mutual ping | Mutual wave (auto-accept within 30s window) | Wzajemny ping |
| Daily ping limit | `DAILY_PING_LIMIT_BASIC` (in `pingLimits.ts`) | "Wykorzystałeś limit pingów na dziś" |
| Status | `currentStatus` on profiles | Status |
| Grupa | Group conversation (`conversations.type = 'group'`) | Grupa |

## Algorithm: Sliding Window Counter

#### What

A hybrid of two fixed-window counters with weighted overlap. On each check the engine computes:

```
estimated_count = prev_window_count * (1 - elapsed/window) + curr_window_count
```

If `estimated_count >= limit`, the request is rejected with a `retryAfter` value. Otherwise the current window counter is incremented atomically.

#### How the Lua script works

1. Compute which fixed window we're in: `current_window = floor(now / window_size)`.
2. Derive the previous window: `prev_window = current_window - 1`.
3. Calculate how far into the current window we are: `elapsed = now - (current_window * window_size)`.
4. Weight: `weight = elapsed / window_size` (0.0 at window start, approaching 1.0 at window end).
5. Fetch both counters from Redis: `prev_count` and `curr_count`.
6. Estimate: `prev_count * (1 - weight) + curr_count`. This smoothly transitions from "mostly previous window" to "mostly current window".
7. If estimate >= limit: return `{1, ceil(window - elapsed)}` (limited, retry after N seconds).
8. Otherwise: `INCR` current window key, set `EXPIRE` to `2 * window`, return `{0, 0}`.

The entire script runs as a single `EVAL` — atomic execution, no race conditions between the read and the increment. Two Redis keys per limit: `rl:{name}:{id}:{windowNumber}` for the current window and the previous one.

#### Why

- **Not fixed window** — a fixed-window counter is vulnerable to the boundary burst exploit: a user sends `limit` requests at the end of one window and `limit` at the start of the next, effectively doubling throughput in a short span. The weighted overlap of the sliding window counter smooths this out — requests at the boundary are counted against both windows proportionally.
- **Not sliding window log** — a sliding log stores one timestamp per request in a sorted set, giving O(n) memory per user per window. The counter approach uses exactly 2 integer keys per limit regardless of request volume — constant memory.
- **Not token bucket** — token bucket is good for burst allowance but requires storing and maintaining a refill rate. Our use case is simpler: fixed limits per window, no burst credits.
- **Custom Redis Lua, no library** — zero external dependencies, full control over key format and behavior, works with Bun's built-in `RedisClient`. No `ioredis` required (BullMQ uses it internally, but our code uses Bun's native client). Libraries like `rate-limiter-flexible` or `@upstash/ratelimit` add unnecessary abstraction for a 20-line Lua script.

#### Config

- All Redis keys prefixed with `rl:` (e.g. `rl:waves.send:userId123:4872`).
- Window keys auto-expire at `2 * window` seconds (ensures the previous window is always available for the weighted calculation, then cleaned up).
- `retryAfter` returned to client = `ceil(window - elapsed)` (seconds until the current window resets).

## Code Structure

| File | Role |
|------|------|
| `apps/api/src/config/rateLimits.ts` | Central config — all limit values, window sizes, and per-context Polish error messages in one file. Exports `rateLimits` (config object), `rateLimitMessages` (Polish strings), `DEFAULT_RATE_LIMIT_MESSAGE` (catch-all). |
| `apps/api/src/config/pingLimits.ts` | Business-rule ping limits — daily cap, per-person cooldown, decline cooldown, mutual ping window. Separate from rate limits because these are product rules, not abuse protection. |
| `apps/api/src/services/rate-limiter.ts` | Engine — Redis Lua sliding window counter. Single export: `checkRateLimit(key, limit, window)` returning `{ limited, retryAfter }`. |
| `apps/api/src/middleware/rateLimit.ts` | Hono middleware factory — `honoRateLimit(name)` for pre-auth routes. Extracts client IP from `X-Forwarded-For` (first entry) or `X-Real-IP`, falls back to `"unknown"`. Returns HTTP 429 with JSON body + `Retry-After` header. |
| `apps/api/src/trpc/middleware/rateLimit.ts` | tRPC middleware factory — `rateLimit(name, keySuffix?)` for post-auth procedures. Keyed by `ctx.userId`. Optional `keySuffix` function derives per-resource keys from input (e.g. `conversationId` for per-chat message limits). Throws `TRPCError` with code `TOO_MANY_REQUESTS`. |
| `apps/api/src/ws/handler.ts` | WebSocket rate limiting — in-memory fixed-window counter per userId, no Redis. `checkWsRateLimit(userId, type, limit, windowMs)` returns boolean. Stale entries cleaned up every 5 minutes via `setInterval`. |

#### Why two separate middleware factories

Hono middleware (`honoRateLimit`) handles pre-auth HTTP routes where there's no authenticated user — only an IP address. tRPC middleware (`rateLimit`) handles post-auth procedures where `ctx.userId` is available. They share the same engine (`checkRateLimit`) but differ in key derivation and error format (HTTP 429 vs TRPCError).

## Rate Limits: Pre-Auth (keyed by IP)

| Config key | Limit | Window | Why |
|------------|-------|--------|-----|
| `auth.otpRequest` | 5 | 15 min | Normal user: 1-2 attempts. Protects Resend email costs (free tier: 3000/month). |
| `auth.otpVerify` | 8 | 5 min | 6-digit OTP = 1M combinations. 8 attempts prevents brute-force while allowing typos. |

#### Why no global pre-auth limit

Specific limits on OTP endpoints are sufficient. General pre-auth traffic is protected at L3/L4 by Railway/Fastly WAF (automatic since February 2026). Adding a blanket pre-auth limit would risk blocking legitimate health checks, webhook callbacks, and Prometheus scrapes. No CAPTCHA or device attestation is needed — the app is mobile-first with authentication, which inherently filters out most bot traffic.

#### Why IP-based only for pre-auth

Post-auth endpoints use `userId` as the key instead of IP. Keying on IP for authenticated requests would punish innocent users behind carrier-grade NAT (mobile networks often share a single public IP across thousands of users). A single Polish mobile carrier IP can represent hundreds of Blisko users in the same neighborhood — rate limiting by IP would effectively create a shared limit across unrelated people.

Pre-auth endpoints (OTP) must use IP because there is no user identity yet. The risk of false positives on shared IPs is accepted because OTP limits are generous (5 per 15 min) and the alternative (no pre-auth protection) leaves Resend email costs unprotected.

## Rate Limits: Post-Auth (keyed by userId)

| Config key | Limit | Window | Why |
|------------|-------|--------|-----|
| `waves.send` | 300 | 4 hours | **Temporarily inflated (BLI-189).** Will revert to 30/4h once map polling has proper debounce/dedup — see note below. The meaningful daily cap on real users is still the business limit in `pingLimits.ts` (5/day Basic). |
| `waves.respond` | 600 | 1 hour | **Temporarily inflated (BLI-189).** Will revert to 60/1h after BLI-189. |
| `messages.send` | 30 | 1 min | Per-conversation. Normal conversation: a few messages/min. 30 = clearly not spam. Uses `keySuffix` to append `conversationId`. |
| `messages.sendGlobal` | 500 | 1 hour | Safety net for cross-conversation spam (one person flooding multiple chats). |
| `profiles.update` | 10 | 1 hour | Normal use: 1-3 edits. Profile updates trigger AI re-analysis jobs, so rapid updates waste compute. |
| `uploads` | 10 | 1 hour | S3 write protection (avatar + photos). |
| `profiles.getNearby` | 600 | 1 min | **Temporarily inflated (BLI-189) — root cause.** The map screen burns through the bucket because `getNearbyUsersForMap` has no client-side debounce/dedup. Once BLI-189 fixes the polling pattern this should drop back to 30/min. |
| `dataExport` | 1 | 24 hours | Heavy aggregation query. GDPR export once per day is reasonable. |
| `metrics.summary` | 30 | 1 min | Prevents scraping of system health data. Applied via Hono middleware (IP-based). |
| `metrics.prometheus` | 30 | 1 min | Prevents Prometheus endpoint abuse. Applied via Hono middleware (IP-based). |
| `global` | 2000 | 1 min | **Temporarily inflated (BLI-189).** Was 200/min; raised so the inflated `profiles.getNearby` calls don't immediately hit the global cap. Will drop back to 200/min once BLI-189 lands. |

> **Note (BLI-189 mitigation):** Four limits above are currently set ~10× higher than their long-term values as a workaround for the map burning through buckets when there is no client-side debounce/dedup on `getNearbyUsersForMap`. The fix is tracked in [BLI-189](https://linear.app/blisko/issue/BLI-189) — once the map polling pattern is corrected, revert `waves.send` 300→30, `waves.respond` 600→60, `profiles.getNearby` 600→30, `global` 2000→200.
| `profiling.submitOnboarding` | 5 | 5 min | Onboarding submission. Makes an inline AI call (~2-3s) for follow-up generation. 5 per 5 min prevents repeated expensive calls. |
| `profiling.retryQuestion` | 10 | 1 hour | Self-healing re-enqueue after `questionFailed` WS event. Prevents retry-loop abuse. |
| `profiling.retryProfileGeneration` | 10 | 1 hour | Self-healing re-enqueue after `profilingFailed` WS event. |
| `profiles.retryProfileAI` | 10 | 1 hour | Self-healing re-enqueue after `profileFailed` WS event. |
| `profiles.retryStatusMatching` | 10 | 1 hour | Self-healing re-enqueue after `statusMatchingFailed` WS event. |

## Rate Limits: WebSocket (in-memory, keyed by userId)

| Event type | Limit | Window | Why |
|------------|-------|--------|-----|
| Typing indicator | 10 | 10 sec | Client-side debounce is the primary control; this is a server-side safety net. |
| Global WS messages | 30 | 1 min | Catch-all for all inbound WS messages. |

#### Implementation details

Unlike HTTP rate limits (sliding window counter in Redis), WS uses a simple fixed-window counter in a `Map<string, { count: number, resetAt: number }>`. The key is `{type}:{userId}` (e.g. `typing:abc123`). On each message:
1. Look up the key. If missing or expired (`now > resetAt`), create a new entry with `count: 1` and `resetAt: now + windowMs`.
2. If entry exists and not expired, increment `count`. If `count > limit`, the message is rate-limited.

Auth messages (`type: "auth"`) bypass rate limiting entirely — a user must be able to authenticate regardless of message volume.

**Cleanup:** A `setInterval` runs every 5 minutes and deletes all entries where `now > resetAt`. This prevents unbounded growth from disconnected users whose entries would otherwise persist.

#### Why in-memory (not Redis)

WebSocket connections are per-process and stateful. In-memory counters are sufficient since each WS connection is bound to a single server instance. No cross-process coordination needed. If the app scales to multiple WS server instances, each instance independently enforces limits for its own connections — this is acceptable because each user typically connects to one server at a time.

#### Why silent drop (no error)

Rate-limited WS messages are silently dropped with no response to the client. Unlike HTTP 429, there's no meaningful retry mechanism for real-time typing indicators. The client doesn't need to know — typing indicators are fire-and-forget by nature. Sending an error would add complexity to the mobile client for zero user benefit.

## Ping Business Limits

These are product rules from PRODUCT.md, not abuse protection. Defined in `apps/api/src/config/pingLimits.ts` and enforced in the `waves.send` procedure. They exist alongside the rate limits — a user can be blocked by business limits (daily cap) long before hitting the rate limit (30/4h).

| Constant | Value | Why |
|----------|-------|-----|
| `DAILY_PING_LIMIT_BASIC` | 5/day | PRODUCT.md: "5 pingow/dzien (Basic)". Resets at midnight UTC. Forces intentional pinging instead of mass-swiping. |
| `PER_PERSON_COOLDOWN_HOURS` | 24h | Cannot ping the same person again within 24h regardless of outcome (sent, declined, ignored). Prevents pestering. |
| `DECLINE_COOLDOWN_HOURS` | 24h | After a decline, extra cooldown before re-pinging the same person. PRODUCT.md: "Cooldown 24h." Combined with the generic per-person cooldown, this means you can never re-ping faster than 24h after any outcome. |
| `MUTUAL_PING_WINDOW_SECONDS` | 30s | If both users ping each other within 30s, both waves are auto-accepted and a chat opens immediately. PRODUCT.md: "odstep < 30 sekund". Special UX moment with custom copy. |

#### Enforcement order in `waves.send`

The procedure checks limits in this order (early exit on first failure):
1. **Daily limit** — count waves sent today (since midnight UTC). If >= `DAILY_PING_LIMIT_BASIC`, throw `daily_limit`.
2. **Per-person cooldown** — any wave to this person in the last 24h? If yes, throw `per_person:{hours_remaining}`.
3. **Decline cooldown** — was a wave to this person declined in the last 24h? If yes, throw `cooldown:{hours_remaining}`.
4. **Serializable transaction** — check for existing pending wave, then insert.
5. **Mutual ping detection** — after insert, check for reverse pending wave within 30s window.

#### Distinction from rate limits

Rate limits (`rateLimits.ts`) protect infrastructure: the current 300 pings per 4 hours (or the long-term 30/4h post-BLI-189) catches bots hammering the endpoint. Business limits (`pingLimits.ts`) shape the product experience: 5 pings per day forces intentional use. A bot would hit the rate limit; a real user hits the business limit first.

## Response Format

#### HTTP 429 response body

```json
{
  "error": "RATE_LIMITED",
  "context": "waves.send",
  "message": "Wysłałeś dużo pingów. Odpocznij chwilę i spróbuj później.",
  "retryAfter": 45
}
```

Header: `Retry-After: 45` (seconds).

#### Why no `RateLimit-Remaining` header

Silent limits by design. Limits are generous enough that normal users never hit them. Exposing remaining count would let attackers calibrate their abuse rate just below the threshold. Only abusers see 429 — and they get no hint of how close they were.

#### tRPC error format

tRPC wraps the same payload in a `TRPCError` with code `TOO_MANY_REQUESTS`. The `message` field is JSON-stringified with `error`, `context`, `message`, and `retryAfter`.

## Client-Side Handling

The mobile app maps `context` to a Polish user-facing message. Red toast, auto-dismiss 3s, zero auto-retry.

| Context | Message |
|---------|---------|
| `waves.send` | "Wysłałeś dużo pingów. Odpocznij chwilę i spróbuj później." |
| `messages.send` | "Za dużo wiadomości naraz. Zwolnij trochę." |
| `messages.sendGlobal` | "Za dużo wiadomości. Spróbuj ponownie za chwilę." |
| `profiles.update` | "Za dużo zmian w profilu. Spróbuj ponownie za chwilę." |
| `uploads` | "Za dużo przesłanych plików. Spróbuj ponownie za chwilę." |
| `dataExport` | "Eksport danych jest dostępny raz na 24 godziny." |
| `auth.otpRequest` | "Za dużo prób logowania. Spróbuj ponownie za kilka minut." |
| `auth.otpVerify` | "Za dużo prób logowania. Spróbuj ponownie za kilka minut." |
| WebSocket | Silent drop, no UI. |
| (catch-all) | "Zbyt wiele prób. Spróbuj ponownie za chwilę." |

Handled in two places:
- **Pre-auth (OTP):** Auth/login flow catches HTTP 429.
- **Post-auth (tRPC):** Global error handler catches `RATE_LIMITED` error code.

## Fail-Open on Redis Error

#### What

If Redis is unavailable, `checkRateLimit` catches the error and returns `{ limited: false, retryAfter: 0 }`. The request proceeds normally.

#### Why

Rate limiting is a protection layer, not a gating function. A Redis outage should not cascade into a full API outage. Letting requests through unmetered is better than rejecting all traffic because the rate limiter is down.

Message idempotency also fails open — if Redis can't be read/written for the idempotency key, the message proceeds without deduplication. Duplicate messages are a minor UX issue; blocked messaging is a major one.

## Deduplication

### Wave send race condition (TOCTOU)

The `waves.send` procedure checks `SELECT ... WHERE status='pending'` then `INSERT`. Between these two operations a duplicate request could slip through (time-of-check, time-of-use).

**Hard invariants (enforced at the database layer):**

The `waves` table has a stored generated column `pair_key text NOT NULL GENERATED ALWAYS AS (md5(LEAST(from_user_id, to_user_id) || ':' || GREATEST(from_user_id, to_user_id))) STORED`, plus a partial unique index `waves_active_unique ON waves (pair_key) WHERE status IN ('pending', 'accepted')`. The md5 of the canonicalised pair gives the same value for `(A, B)` and `(B, A)`, so the index is direction-agnostic — there can be at most one **active** wave per **pair** of users. Storage cost is fixed (md5 = 32 hex chars) regardless of source ID length. Postgres recomputes `pair_key` on every UPDATE that touches the source columns; applications never write to it.

1. **No duplicate pending waves** — a concurrent double-send from A to B cannot result in two `pending` rows.
2. **No re-waving an already-connected user** — once any wave between the pair is `accepted` (a conversation exists), a new wave from either direction is rejected. Status `accepted` is currently terminal, so this is the permanent guard against ghost waves on top of existing conversations.
3. **No two pending waves in opposite directions** — if A pings B and B pings A before B's UI has flipped to the accept button, the second insert is silently swallowed by `ON CONFLICT DO NOTHING`. `waves.send` notices the empty `returning` and treats it as an "implicit accept" of the existing pending wave (see `waves-connections.md` → "Implicit Accept on Conflict").

`declined` is the only non-terminal "slot-freeing" status: after a wave is declined, the pair is no longer in the active set and a new wave becomes possible (subject to the decline cooldown below).

**Soft rules (enforced at the application layer, best-effort):**

Before the insert, `waves.send` runs three independent `SELECT` checks:

- Daily limit — `DAILY_PING_LIMIT_BASIC = 5` per UTC day, counted from `createdAt`.
- Per-person cooldown — `PER_PERSON_COOLDOWN_HOURS = 24`, any-status, counted from `createdAt`.
- Decline cooldown — `DECLINE_COOLDOWN_HOURS = 24`, counted from `respondedAt` of the previous `declined` wave.

These checks are **not atomic** with the insert. Under concurrent sends they are subject to time-of-check / time-of-use races: two requests from A can both observe "daily count = 4" before either commits. We accept this consciously — the HTTP rate limiter catches the vast majority of double-clicks before they reach the procedure, and an occasional off-by-one on a soft limit (user sending 6 waves on a day where the cap is 5) is not a correctness problem. The DB-level unique index guards correctness; the application checks guard policy.

**How the insert is executed:** `waves.send` uses a single statement —

```ts
db.insert(schema.waves)
  .values({ fromUserId, toUserId, senderStatusSnapshot })
  .onConflictDoNothing({
    target: schema.waves.pairKey,
    where: sql`${schema.waves.status} in ('pending', 'accepted')`,
  })
  .returning();
```

If `returning` comes back with the new row, that is the happy path and we proceed with the standard new-wave notifications. If it comes back empty (the unique constraint fired), we run one disambiguation `SELECT` against the active set for the pair (either direction) and decide:

- `existing.status === 'accepted'` → `CONFLICT: already_connected`
- `existing.fromUserId === ctx.userId` → `CONFLICT: already_waved`
- otherwise (existing pending from the other user) → call `acceptWaveCore` to implicitly accept their wave, return `{ wave, conversationId, autoAccepted: true }`

This follows the `drizzle/use-on-conflict` rule. The generated `pair_key` column was the trick that made it possible — with an expression-based index target (`LEAST/GREATEST(...)`) drizzle's `onConflictDoNothing` API would not accept the arbiter, but on a plain text column it works without ceremony.

**Request flow summary:**

```
HTTP rate limiter (Redis sliding window)
  │
  ▼
waves.send procedure
  │
  ├── Daily / per-person / decline cooldown checks  (soft, non-atomic)
  │
  └── INSERT INTO waves ... ON CONFLICT (pair_key)
                              WHERE status IN ('pending', 'accepted')
                              DO NOTHING
                              RETURNING *
        │
        ├── happy path: returning[0] is the new wave
        │     → return { wave, conversationId: null, autoAccepted: false }
        │
        └── conflict: returning is empty → SELECT existing pair (either direction)
              │
              ├── status='accepted'                → CONFLICT already_connected
              ├── status='pending', from = me      → CONFLICT already_waved
              └── status='pending', from = other   → acceptWaveCore(existing)
                                                    → return { wave, conversationId, autoAccepted: true }
```

### Message send idempotency

Network retry on flaky mobile connections can produce duplicate messages (different server-side IDs, same user-visible content). This is especially common on mobile where the app retries after a timeout, not knowing the server already processed the first request.

**Fix:** Client-generated idempotency key (UUID) sent with each message. Backend flow:
1. Check Redis key `idem:msg:{userId}:{idempotencyKey}`.
2. If key exists: return the cached response (the message already exists).
3. If key doesn't exist: proceed with insert, then cache the response with TTL 300s (5 minutes).

**Config:**
- Redis key pattern: `idem:msg:{userId}:{clientKey}`
- TTL: 300 seconds (5 minutes — long enough to cover network retries, short enough to not waste Redis memory)
- Separate `RedisClient` instance (`idempotencyRedis`) from the rate limiter
- Fails open on Redis errors — if Redis can't be read, the message proceeds without dedup

## Group Push Notification Suppression

#### What

When a message is sent in a group conversation, the system checks each recipient's unread state:
1. If the recipient already has unread messages (`unreadCount > 1`, because the current message is already inserted): push with `collapseId: "group:{conversationId}"` and `sound: undefined` — silently replaces the previous notification on the device.
2. If this is the first unread message (`unreadCount <= 1`): normal push with `sound: "default"` and no `collapseId`.

The `collapseId` value is `group:{conversationId}` — unique per group, so notifications from different groups don't collapse into each other.

#### How it works in the push service

In `apps/api/src/services/push.ts`, the `sendPushToUser` function checks for `collapseId`:
- If present: `sound` is set to `undefined` (silent) and `_id` is set to the `collapseId` value. The `_id` field tells Expo Push Service to replace any existing notification with the same ID on the device.
- If absent: `sound` is `"default"` (audible) and no `_id` — each notification is independent.

An additional `collapseId: "ambient-match"` is used for status match notifications in `queue.ts`, ensuring repeated "someone nearby matches" alerts don't pile up.

#### Why

Without suppression, a 50-person group with active conversation would blast every member with audible notifications per message. This is the notification spam problem — especially at events or conferences where groups are highly active. `collapseId` groups notifications on the OS level — one audible alert for the first unread, then silent badge-count updates until the user reads.

The pattern: first unread = "grab attention", subsequent unreads = "update silently". After the user reads (resetting their `lastReadAt`), the next message triggers a fresh audible push.

#### DM behavior

DMs have no suppression. Every message triggers an audible push with no `collapseId` — like iMessage. DMs are 1:1 and typically lower volume, so per-message alerts are expected and welcome.

## Wave Irreversibility

#### What

Waves (pings) are irreversible. There is no cancel/undo operation. Once sent, a wave exists permanently in the database with status `pending`. The recipient can: accept, decline, or ignore (stays `pending` indefinitely).

The `waves` table has statuses: `pending`, `accepted`, `declined`. There is no `cancelled` status.

#### Why

Removing cancel eliminates the entire class of wave/unwave notification spam — a user toggling send/cancel rapidly to harass someone with repeated push notifications. Each send triggers a push notification, so wave/unwave cycling would be a direct notification bombing vector.

**Competitor precedent:** Tinder and Bumble swipes are irreversible. Users understand this model from dating apps. Bumble's "Backtrack" feature (undo last swipe) is a paid premium feature, not a free toggle — and it's limited to one undo.

**Product philosophy alignment:** PRODUCT.md principle 4 ("Stopniowe odslanianie ponad natychmiastowy dostep") — once you signal intent, it's out there. A ping is a commitment to reveal your status to the other person.

**Simplification benefit:** No cancel means no need for per-pair toggle tracking, no cancel rate limits, no "re-ping after cancel" cooldown logic, no "cancelled" status in the waves state machine. The entire system is simpler.

## Adding a New Rate Limit

When adding a new API endpoint or procedure that needs rate limiting:

1. **Add config entry** in `rateLimits.ts` with key, limit, and window. Add a comment explaining the rationale.
2. **Add Polish message** in `rateLimitMessages` if the user might see this limit (skip for internal/admin endpoints).
3. **Apply middleware:**
   - Pre-auth HTTP route: `honoRateLimit("your.key")` in the Hono route chain.
   - Post-auth tRPC procedure: `.use(rateLimit("your.key"))` in the procedure chain. Add `keySuffix` if per-resource.
4. **Check the checklist** from `rateLimits.ts` header: triggers push? enqueues AI jobs? sends emails? writes to S3? abusable by bots?

## Impact Map

If you change this system, also check:

- **`apps/api/src/config/rateLimits.ts`** — Single source of truth for all limit values, windows, and Polish error messages. Type-safe: `RateLimitName` union type used by both middleware factories.
- **`apps/api/src/config/pingLimits.ts`** — Business-rule ping limits (daily cap, cooldowns, mutual window). Must stay aligned with PRODUCT.md pricing tiers (Basic: 5/day, Premium: 20/day).
- **`apps/api/src/services/rate-limiter.ts`** — The Lua script. If Redis key format changes, all existing counters become orphaned (harmless, they'll expire).
- **`apps/api/src/services/push.ts`** — `collapseId` logic for group push suppression. The `sound` field is conditionally set based on presence of `collapseId`. Adding new `collapseId` patterns here affects notification behavior on all devices.
- **`apps/api/src/trpc/procedures/messages.ts`** — Determines `hasUnread` per recipient and sets `collapseId` accordingly. Also contains message idempotency logic (Redis keys, TTL).
- **`apps/api/src/trpc/procedures/waves.ts`** — Enforces ping business limits (daily, per-person, decline cooldown, mutual detection). Serializable transaction for dedup. The error messages (`daily_limit`, `per_person:N`, `cooldown:N`) are parsed by the mobile client.
- **`apps/api/src/ws/handler.ts`** — In-memory WS rate limiting + periodic cleanup interval. The cleanup interval (5 min) and counter map are not bounded — if adding new WS message types, ensure they're rate limited.
- **Mobile error handling** — Two separate catch paths: pre-auth HTTP 429 (in auth/login flow) vs post-auth tRPC `RATE_LIMITED` (in global error handler). Adding a new pre-auth rate limit requires handling in the login flow specifically.
- **PRODUCT.md** — Ping limits are product decisions. Any change to `pingLimits.ts` values should be reflected in PRODUCT.md (pricing table, limit descriptions) and vice versa.
