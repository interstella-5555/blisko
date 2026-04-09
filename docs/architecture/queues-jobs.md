# BullMQ Queues & Job Processing

> v1 — AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-09 — Added 3 admin job types (BLI-154): admin-soft-delete-user, admin-restore-user, admin-force-disconnect.

Single BullMQ queue powering all background work: AI analysis, profile generation, status matching, GDPR compliance, and admin actions. Source: `apps/api/src/services/queue.ts`.

## Terminology & Product Alignment

| PRODUCT.md | Code | UI (Polish) |
|---|---|---|
| Ping / wave | `wave` record, `analyze-pair` job | "Nowy ping!" |
| Profile Match (%) | `connectionAnalyses.aiMatchScore` | % na bance |
| Status Match | `statusMatches` table, `status-matching` job | Pulsujaca banka |
| Ambient notification | `sendAmbientPushWithCooldown()` | "Ktos z pasujacym profilem jest w poblizu" |
| AI profiling Q&A | `generate-profiling-question` / `generate-profile-from-qa` jobs | Onboarding konwersacja |
| Portrait | `profiles.portrait` — AI-generated profile summary | (internal, feeds matching) |
| Account deletion (soft + hard) | `hard-delete-user` delayed job | "Usunięty użytkownik" |
| Data export (GDPR) | `export-user-data` job | Export danych |

## Queue Configuration

**What:** Single BullMQ queue named `ai-jobs` backed by Redis (via `REDIS_URL`). BullMQ uses ioredis internally; all other Redis operations use Bun's native `RedisClient`.

**Config:**
- Queue name: `ai-jobs`
- `removeOnComplete: true` (default for all jobs)
- `removeOnFail: { count: 100 }` — keeps last 100 failed jobs for inspection
- `attempts: 3` — three retries on failure
- `backoff: { type: "exponential", delay: 5000 }` — 5s, 10s, 20s between retries

**Why exponential backoff:** Most failures are transient (LLM API rate limits, Redis hiccups). Exponential backoff avoids hammering external services.

## Worker

**What:** Single worker instance processing from `ai-jobs` queue.

**Config:**
- `concurrency: 50` — up to 50 jobs processed simultaneously
- Initialized at server startup via `startWorker()` (called from `src/index.ts`)
- No-ops gracefully when `REDIS_URL` is not set (local dev without Redis)

**Why concurrency 50:** Most jobs are I/O-bound (waiting on LLM API calls, DB queries). High concurrency keeps throughput up while the worker waits on external calls.

## Job Types (13 total)

### 1. `analyze-pair` — Full Connection Analysis (T3)

**What:** Bidirectional AI analysis between two users. Produces `shortSnippet`, `longDescription`, and `aiMatchScore` for both directions (A->B and B->A).

**Trigger:** Enqueued by `analyze-user-pairs` for each nearby pair, or directly via `enqueuePairAnalysis()` when viewing a profile.

**Processor logic:**
1. Fetch both profiles (portrait, displayName, lookingFor, superpower)
2. Skip if either profile is incomplete (no portrait or `isComplete: false`)
3. Check profile hashes — skip if analysis exists and both profiles are unchanged
4. Call `analyzeConnection()` LLM
5. Upsert `connectionAnalyses` for both directions (A->B and B->A)
6. Publish `analysisReady` WS event for both users
7. Publish `analysis:ready` on dedicated Redis channel (consumed by chatbot)

**Dedup:** Uses `safeEnqueuePairJob()` — see Deduplication section below.

**Priority:** Set by `analyze-user-pairs` based on rank score (1 = highest). Lower-numbered priority jobs process first.

**`removeOnComplete`:** default (true)

### 2. `quick-score` — Lightweight Score (T2)

**What:** Fast asymmetric scoring without full analysis text. Produces only `aiMatchScore` for both directions.

**Trigger:** `enqueueQuickScore()` — typically map view or nearby list where full analysis is overkill.

**Processor logic:**
1. Fetch both profiles
2. Skip if either profile incomplete
3. Skip if full T3 analysis already exists (has `shortSnippet`)
4. Call `quickScore()` LLM
5. Upsert `connectionAnalyses` with score only (`shortSnippet: null`), guarded by `setWhere: isNull(shortSnippet)` to not overwrite a T3 result that arrived concurrently
6. Publish `analysisReady` WS events

**JobId:** `quick-score-{sortedA}-{sortedB}` (deterministic, prevents duplicates)

**`removeOnComplete`:** default (true)

### 3. `analyze-user-pairs` — Bulk Nearby Analysis

**What:** Finds all nearby users for a given user and enqueues individual `analyze-pair` jobs for each pair.

**Trigger:** `enqueueUserPairAnalysis()` — called on location update.

**Processor logic:**
1. Compute bounding box from lat/lon + radius (default 5000m)
2. Query nearby users: not blocked, not soft-deleted, profile complete, not ninja, within Haversine distance (limit 100)
3. Score and rank by composite: 0.7 * cosine similarity (embedding) + 0.3 * interest overlap, weighted 0.6 match + 0.4 proximity
4. Enqueue `analyze-pair` for each pair via `safeEnqueuePairJob()`, priority = rank position (1 = best match)

**Debounce:** `id: user-pairs-{userId}`, TTL 30s

**`removeOnComplete`:** default (true)

### 4. `generate-profile-ai` — Profile AI Generation

**What:** Generates portrait text, embedding vector, and interest tags from user's bio and lookingFor.

**Trigger:** `enqueueProfileAI()` — after profile creation or bio/lookingFor update.

**Processor logic:**
1. Call `generatePortrait(bio, lookingFor)`
2. Parallel: `generateEmbedding(portrait)` + `extractInterests(portrait)`
3. Update `profiles` table
4. Publish `profileReady` WS event

**Debounce:** `id: profile-ai-{userId}`, TTL 30s

**`removeOnComplete`:** default (true)

### 5. `generate-profiling-question` — Profiling Q&A Question

**What:** AI generates the next question in a profiling session.

**Trigger:** `enqueueProfilingQuestion()` — after user answers a question.

**Processor logic:**
1. Call `generateNextQuestion()` with Q&A history, previous session context, direction hint
2. Insert question into `profilingQA` table
3. Publish `questionReady` WS event

**JobId:** `profiling-q-{sessionId}-{questionNumber}` (deterministic)

**`removeOnComplete`:** default (true)

### 6. `generate-profile-from-qa` — Profile from Q&A

**What:** Generates bio, lookingFor, and portrait from a completed Q&A session.

**Trigger:** `enqueueProfileFromQA()` — when profiling session has enough answers.

**Processor logic:**
1. Call `generateProfileFromQA()` with full Q&A history
2. Update `profilingSessions` with generated fields, set status to `completed`
3. Publish `profilingComplete` WS event

**JobId:** `profile-from-qa-{sessionId}` (deterministic)

**`removeOnComplete`:** default (true)

### 7. `status-matching` — Status Match Discovery

**What:** Finds users whose status or profile matches the current user's active status.

**Trigger:** `enqueueStatusMatching()` — when user sets or updates their status.

**Processor logic:**
1. Fetch user's profile and active status
2. Skip if: no status, profile incomplete, ninja mode
3. Generate embedding for status text, store in `profiles.statusEmbedding`
4. Query nearby users (~5km bounding box, `NEARBY_RADIUS_DEG = 0.05`)
5. Pre-filter by cosine similarity > 0.3, take top 20
6. Privacy: private statuses matched via profile embedding only — status text never enters LLM
7. LLM evaluation (`evaluateStatusMatch`) with status categories for each candidate
8. Replace all existing matches (`DELETE` + `INSERT` into `statusMatches`)
9. Publish `statusMatchesReady` WS event
10. Send ambient push with 1-hour cooldown if matches found

**JobId:** `status-matching-{userId}` (deterministic, no debounce)

**`removeOnComplete`:** true (explicit)

### 8. `proximity-status-matching` — Proximity-Triggered Status Match

**What:** When a user moves to a new location, check if nearby users' existing statuses match theirs.

**Trigger:** `enqueueProximityStatusMatching()` — called on location update.

**Processor logic:**
1. Fetch moving user's profile
2. Skip if incomplete or ninja
3. Generate status embedding if missing
4. Query nearby users with active statuses (~5km bounding box, limit 100)
5. Filter out already-matched pairs (either direction)
6. Pre-filter by cosine similarity > 0.3, take top 10
7. LLM evaluation for each candidate
8. Insert new matches bidirectionally (`onConflictDoNothing`)
9. Publish `statusMatchesReady` for all affected users
10. Send ambient push with cooldown for all affected users

**Debounce:** `id: proximity-status-{userId}`, TTL 2 minutes

**`removeOnComplete`:** true (explicit)

### 9. `hard-delete-user` — GDPR Anonymization

**What:** Permanently anonymizes user data 14 days after soft-delete.

**Trigger:** `enqueueHardDeleteUser()` — when user soft-deletes their account.

**Processor logic:**
1. Skip if already anonymized (`anonymizedAt` set)
2. Delete S3 files (avatar, portrait)
3. In transaction: overwrite user table (name -> "Usunięty użytkownik", random email), nullify all profile fields, set ninja mode, clear profiling Q&A answers
4. Outside transaction: anonymize metrics (`requestEvents.userId` / `targetUserId` -> null)

**Delay:** 14 days (1,209,600,000 ms) — allows account recovery during grace period.

**Cancellation:** `cancelHardDeleteUser()` removes the delayed job if user reactivates.

**JobId:** `hard-delete-{userId}` (deterministic)

**`removeOnComplete`:** true (explicit)

### 10. `export-user-data` — GDPR Data Export

**What:** Collects all user data and emails it as an export.

**Trigger:** `enqueueDataExport()` — user requests data export.

**Processor logic:** Delegates to `collectAndExportUserData()` in `data-export.ts`.

**JobId:** `export-{userId}-{timestamp}` (allows multiple exports)

**`removeOnComplete`:** true (explicit)

### 11. `admin-soft-delete-user` — Admin Soft Delete

**What:** Soft-deletes a user account via admin panel. Calls `softDeleteUser()` service function from `apps/api/src/services/user-actions.ts`.

**Trigger:** Admin panel "Usuń konto" action → `enqueueAndWait()` from admin app.

**Processor logic:** Delegates to `softDeleteUser(userId)` — same logic as user-initiated deletion but without OTP verification. Transaction: set `deletedAt`, delete sessions, delete push tokens. Post-transaction: `forceDisconnect` event + enqueue `hard-delete-user` delayed job.

**`removeOnComplete`:** true (via admin enqueue options)

### 12. `admin-restore-user` — Admin Restore User

**What:** Restores a soft-deleted user during the 14-day grace period. Calls `restoreUser()` service function.

**Trigger:** Admin panel "Przywróć konto" action → `enqueueAndWait()` from admin app.

**Processor logic:** Delegates to `restoreUser(userId)` — clears `user.deletedAt` and cancels the pending `hard-delete-user` delayed job.

**`removeOnComplete`:** true (via admin enqueue options)

### 13. `admin-force-disconnect` — Admin Force Disconnect

**What:** Closes all active WebSocket connections for a user.

**Trigger:** Admin panel "Rozłącz" action → `enqueueAndWait()` from admin app.

**Processor logic:** Calls `publishEvent("forceDisconnect", { userId })`. No data changes — just closes WS connections. The mobile app auto-reconnects.

**`removeOnComplete`:** true (via admin enqueue options)

## Deduplication: `safeEnqueuePairJob`

**What:** Prevents duplicate `analyze-pair` jobs for the same user pair.

**Logic:**
1. Compute deterministic `jobId`: `pair-{sortedUserAId}-{sortedUserBId}`
2. Check if job with that ID already exists in the queue
3. If `active` or `completed` -> skip (analysis in progress or done)
4. If `waiting` or `delayed` and no priority upgrade requested -> skip
5. If `failed` or stale -> remove old job (try-catch for TOCTOU race), then re-add
6. Otherwise -> add new job

**Why:** Location updates trigger `analyze-user-pairs` frequently. Without dedup, the same pair would be re-enqueued on every location ping.

## Priority Promotion: `promotePairAnalysis`

**What:** Promotes an existing `analyze-pair` job to highest priority, or creates a new one at highest priority.

**Trigger:** Called from `waves.send` when user pings someone — their connection analysis should complete ASAP for the "Co nas laczy" card.

**Logic:**
1. Check if job exists and is `active` or `completed` -> no-op
2. Remove existing job
3. Re-add without `priority` field -> BullMQ processes FIFO jobs before prioritized ones, making this effectively highest priority

## Debouncing

| Job type | Debounce ID | TTL |
|---|---|---|
| `generate-profile-ai` | `profile-ai-{userId}` | 30 seconds |
| `proximity-status-matching` | `proximity-status-{userId}` | 2 minutes |
| `analyze-user-pairs` | `user-pairs-{userId}` | 30 seconds |

**Why:** User actions can trigger rapid-fire job enqueues (typing bio triggers profile-ai, walking triggers proximity-status). Debouncing coalesces these into a single job after the user "settles."

## Redis Usage Summary

Redis (`REDIS_URL`) serves 5 distinct purposes in the API:

| Use | Client | Key pattern | TTL |
|---|---|---|---|
| **BullMQ queue** | ioredis (internal) | `bull:ai-jobs:*` | Managed by BullMQ |
| **WS pub/sub bridge** | Bun `RedisClient` | Channel: `ws-events` | N/A (pub/sub) |
| **Analysis notification** | Bun `RedisClient` | Channel: `analysis:ready` | N/A (pub/sub) |
| **Rate limiting** | Bun `RedisClient` | `rl:{context}:{userId}:{window}` | 2x window seconds |
| **Ambient push cooldown** | Bun `RedisClient` | `ambient-push:{userId}` | 3600s (1 hour) |
| **Message idempotency** | Bun `RedisClient` | `idem:msg:{userId}:{idempotencyKey}` | 300s (5 minutes) |

## Metrics

Source: `apps/api/src/services/queue-metrics.ts`, `apps/api/src/services/prometheus.ts`.

**Prometheus metrics:**
- `bullmq_jobs_total` (counter) — labels: `queue`, `status` (completed/failed)
- `bullmq_job_duration_ms` (histogram) — labels: `queue`. Buckets: 100, 500, 1000, 2500, 5000, 10000, 30000, 60000 ms
- `bullmq_queue_depth` (gauge) — labels: `queue`, `state`

**In-memory stats:** `getQueueStats()` returns per-queue completed/failed counts and duration percentiles (kept in a rolling window of max 1000 samples).

## Startup Order

In `apps/api/src/index.ts`:

1. Hono app created with middleware (metrics, logger, CORS)
2. Routes registered (health, metrics, auth, uploads, tRPC)
3. `initWsRedisBridge()` — sets up Redis pub/sub for cross-replica WS events
4. `startWorker()` — starts BullMQ worker consuming `ai-jobs` queue
5. Bun server starts on `PORT` (default 3000) with WS upgrade handler

## Impact Map

If you change this system, also check:
- **Job type added/removed:** Update `AIJob` union type, `processJob` switch, add enqueue function
- **Profile schema changed:** `analyze-pair` and `quick-score` fetch profiles — update field lists. Profile hash calculation uses `bio` + `lookingFor`
- **Status schema changed:** `status-matching` and `proximity-status-matching` both query status fields
- **Redis connection:** BullMQ, rate limiter, WS bridge, ambient push, message idempotency all share `REDIS_URL`
- **Queue config (attempts, backoff):** Affects all 13 job types
- **Service functions (`user-actions.ts`):** `softDeleteUser` and `restoreUser` are called by both user tRPC and admin BullMQ workers — changes affect both paths
- **Admin BullMQ client:** Admin app connects to same Redis via `REDIS_URL` as queue producer only. See `admin-panel.md`
- **Worker concurrency:** Affects throughput of all jobs — higher = more parallel LLM calls
- **Debounce TTLs:** Changing profile-ai debounce affects how quickly profile updates propagate; proximity-status debounce affects how responsive ambient matching is to movement
- **`hard-delete-user` processor:** Must be updated when new tables store personal data (check `security/new-tables-check` rule)
- **`analysis:ready` Redis channel:** Chatbot subscribes to this — changing format breaks bot wave acceptance
- **`connectionAnalyses` table:** Both `analyze-pair` and `quick-score` write to it — schema changes affect both
