# BullMQ Queues & Job Processing

> v1 — AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-09 — Added 3 admin job types (BLI-154): admin-soft-delete-user, admin-restore-user, admin-force-disconnect.
> Updated 2026-04-22 — Added 2 admin job types (BLI-156): admin-suspend-user, admin-unsuspend-user.
> Updated 2026-04-10 — Self-healing AI queue: `analysisFailed` event, quick-score BullMQ deduplication (BLI-158).
> Updated 2026-04-10 — Push log: `flush-push-log` (15s batch flush) and `prune-push-log` (hourly cleanup) repeatable jobs, Redis buffer entry.
> Updated 2026-04-10 — Self-healing profiling: `questionFailed` event, profiling question BullMQ deduplication (BLI-161).
> Updated 2026-04-10 — Self-healing profile generation: `profilingFailed` event, `generate-profile-from-qa` BullMQ deduplication (BLI-162).
> Updated 2026-04-10 — Self-healing profile AI: `profileFailed` event, `retryProfileAI` mutation (BLI-163).
> Updated 2026-04-10 — Self-healing status matching: `statusMatchingFailed` event, BullMQ deduplication, `retryStatusMatching` mutation (BLI-164).
> Updated 2026-04-10 — GDPR-safe export retry: 10 attempts/60s exponential backoff (~8.5h), `removeOnFail: false`, admin + user emails on permanent failure (BLI-165).
> Updated 2026-04-10 — Split single `ai-jobs` queue into 3 queues (`ai`, `ops`, `maintenance`) grouped by bottleneck. Shared utilities in `queue-shared.ts` (BLI-171).
> Updated 2026-04-10 — Nightly consistency sweep: `consistency-sweep` maintenance job (daily 3 AM), admin trigger, mobile startup health check (BLI-168).
> Updated 2026-04-11 — AI cost tracking: `flush-ai-calls` (15s batch flush) and `prune-ai-calls` (hourly cleanup) repeatable jobs, Redis buffer entry (BLI-174).
> Updated 2026-04-11 — Legacy `ai-jobs` cleanup in `startOpsWorker` extended from "rescue hard-delete" to full `obliterate` so stale failed analyze-pair rows and orphaned repeatable schedulers drop out of Redis; `dev-cli:queue-monitor` now reads `ai`/`ops`/`maintenance` instead of the dead `ai-jobs` key (BLI-204).
> Updated 2026-04-19 — Split status matching LLM fan-out into per-pair `evaluate-status-match` child jobs. Parents (`status-matching`, `proximity-status-matching`) now handle pre-work + fan-out via `queue.addBulk`; each child runs one `evaluateStatusMatch` call + insert + WS event + push. Retry isolation per pair. AI queue now has 9 job types (BLI-167).
> Updated 2026-04-22 — Admin queue page reclassifies Job Scheduler delayed markers as a `scheduled` pseudo-state ("Harmonogram" tab) via `queue.getJobSchedulers()`. Each scheduler keeps one permanent delayed job (per BullMQ design) for the next run — surfacing them separately keeps the "Opóźnione" count honest (retries only) and shows interval/cron + countdown to next run.

Three BullMQ queues grouped by bottleneck: AI (OpenAI-bound), Ops (DB/S3/email-bound critical operations), Maintenance (periodic fire-and-forget). Each has its own worker with independent concurrency and retention policies. Source files: `apps/api/src/services/queue.ts` (AI), `queue-ops.ts` (Ops), `queue-maintenance.ts` (Maintenance), `queue-shared.ts` (shared utilities).

All AI jobs in the AI queue are instrumented via `withAiLogging()` — every OpenAI call through the Vercel AI SDK is logged into `metrics.ai_calls` for cost tracking, including full prompt + completion payloads (24h retention, metrics kept 7d). See `ai-cost-tracking.md`.

Maintenance queue adds a `prune-ai-call-payloads` scheduler (hourly) that nulls `input_jsonb` / `output_jsonb` for rows older than 24h — companion to the existing `prune-ai-calls` DELETE (7d).

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

## Queue Architecture

Three queues backed by Redis (`REDIS_URL`). BullMQ uses ioredis internally; all other Redis operations use Bun's native `RedisClient`. Shared connection config and worker logging in `queue-shared.ts`.

| Queue | Name | Source file | Concurrency | Job types | Bottleneck |
|---|---|---|---|---|---|
| **AI** | `ai` | `queue.ts` | 50 | 9 (OpenAI-calling jobs) | OpenAI RPM/TPM |
| **Ops** | `ops` | `queue-ops.ts` | 10 | 5 (GDPR, admin actions) | DB/S3/email |
| **Maintenance** | `maintenance` | `queue-maintenance.ts` | 2 | 7 (periodic flush/prune + nightly sweep + daily test-user cleanup) | None |

**Why 3 queues:** Jobs grouped by shared bottleneck. AI jobs all compete for OpenAI API capacity and benefit from cross-type priority (`promotePairAnalysis`). Ops jobs are rare but critical — admin clicking "delete account" shouldn't wait behind 200 AI analysis jobs. Maintenance is fire-and-forget and needs no concurrency with either.

### Default job options per queue

| Queue | `removeOnComplete` | `removeOnFail` | `attempts` | `backoff` |
|---|---|---|---|---|
| AI | `{ count: 200, age: 3600 }` | `{ count: 100 }` | 3 | exponential 5s |
| Ops | `{ count: 200, age: 3600 }` | `{ age: 7_776_000 }` (90 days) | 3 | exponential 5s |
| Maintenance | `{ count: 10 }` | `{ count: 10 }` | 3 | exponential 5s |

**Why 90-day retention for ops failures:** GDPR and admin ops must be auditable. A failed `hard-delete-user` or `export-user-data` job needs to be visible for investigation months later.

**Why exponential backoff:** Most failures are transient (LLM API rate limits, Redis hiccups). Exponential backoff avoids hammering external services.

### Workers

All three workers start at server startup from `src/index.ts`: `startAiWorker()`, `startOpsWorker()`, `startMaintenanceWorker()`. Each no-ops gracefully when `REDIS_URL` is not set (local dev without Redis). Shared logging via `attachWorkerLogger()` in `queue-shared.ts` records Prometheus metrics and console output.

### Legacy migration

On startup, `startOpsWorker()` runs a one-time cleanup of the pre-BLI-171 `ai-jobs` Redis queue: it first rescues any delayed `hard-delete-user` jobs by re-adding them to `ops` with preserved remaining delay and job ID, then calls `legacyQueue.obliterate({ force: true })` to remove everything else that stuck around — stale failed `analyze-pair` entries, old completed jobs, and the `flush-push-log`/`prune-push-log` repeatable schedulers that no worker consumes anymore. Both steps no-op gracefully on an empty queue; failures are logged but non-fatal (BLI-204).

## Job Types (21 total)

### AI Queue (9 types) — `queue.ts`

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

**Dedup:** BullMQ `deduplication` option (Simple Mode) with id `quick-score-{sortedA}-{sortedB}`. Automatically releases dedup key on completion or failure — enables self-healing re-enqueue after failure.

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

**Dedup:** BullMQ `deduplication` option (Simple Mode) with id `profiling-q-{sessionId}-{questionNumber}`. Automatically releases dedup key on completion or failure — enables self-healing re-enqueue after failure.

**`removeOnComplete`:** default (true)

### 6. `generate-profile-from-qa` — Profile from Q&A

**What:** Generates bio, lookingFor, and portrait from a completed Q&A session.

**Trigger:** `enqueueProfileFromQA()` — when profiling session has enough answers.

**Processor logic:**
1. Call `generateProfileFromQA()` with full Q&A history
2. Update `profilingSessions` with generated fields, set status to `completed`
3. Publish `profilingComplete` WS event

**Dedup:** BullMQ `deduplication` option (Simple Mode) with id `profile-from-qa-{sessionId}`. Automatically releases dedup key on completion or failure — enables self-healing re-enqueue after failure.

**`removeOnComplete`:** default (true)

### 7. `status-matching` — Status Match Discovery (parent)

**What:** Finds users whose status or profile matches the current user's active status. Fan-out parent — pre-work + DELETE + enqueue children.

**Trigger:** `enqueueStatusMatching()` — when user sets or updates their status.

**Processor logic:**
1. Fetch user's profile and active status
2. Skip if: no status, profile incomplete, ninja mode
3. Generate embedding for status text, store in `profiles.statusEmbedding`
4. Query nearby users (~5km bounding box, `NEARBY_RADIUS_DEG = 0.05`)
5. Pre-filter by cosine similarity > 0.3, take top 20
6. Privacy: private statuses matched via profile embedding only — status text never enters LLM
7. `DELETE FROM statusMatches WHERE userId = ?` — atomic replace semantic preserved
8. Publish initial `statusMatchesReady` with empty list so clients drop stale bubbles
9. `queue.addBulk` fan-out of up to 20 `evaluate-status-match` child jobs (`insertMode: "unidirectional"`, `notifyUserIds: [userId]`, `stalenessKey: user.statusSetAt.toISOString()`)

**Dedup:** BullMQ `deduplication` option (Simple Mode) with id `status-matching-{userId}`. Automatically releases dedup key on completion or failure — enables self-healing re-enqueue after failure.

**`removeOnComplete`:** default

### 8. `proximity-status-matching` — Proximity-Triggered Status Match (parent)

**What:** When a user moves to a new location, check if nearby users' existing statuses match theirs. Fan-out parent.

**Trigger:** `enqueueProximityStatusMatching()` — called on location update.

**Processor logic:**
1. Fetch moving user's profile
2. Skip if incomplete or ninja
3. Generate status embedding if missing
4. Query nearby users with active statuses (~5km bounding box, limit 100)
5. Filter out already-matched pairs (either direction)
6. Pre-filter by cosine similarity > 0.3, take top 10
7. `queue.addBulk` fan-out of up to 10 `evaluate-status-match` child jobs (`insertMode: "bidirectional"`, `notifyUserIds: [userId, candidateUserId]`, `stalenessKey: null` — userId here is the moving user, not the status setter)

**Debounce:** `id: proximity-status-{userId}`, TTL 2 minutes

**`removeOnComplete`:** queue default (`{ count: 200, age: 3600 }`)

### 9. `evaluate-status-match` — Per-Pair LLM Evaluation (child)

<!-- ninth AI-queue job; Ops queue numbering restarts at 10 below -->


**What:** One LLM call + one INSERT for a single (setter, candidate) pair. Fanned out by `status-matching` and `proximity-status-matching` parents. Retry/backoff isolated per pair — a failed LLM call for one pair doesn't discard siblings' work (BLI-167).

**Trigger:** `queue.addBulk` from parent processors. No direct external enqueue.

**Payload:** `contextA`/`contextB` (pre-resolved LLM inputs in same arg order as `evaluateStatusMatch()`), `matchType`, `categoriesA`/`categoriesB`, `stalenessKey` (setter's `statusSetAt` ISO or `null`), `insertMode` (`"unidirectional"` | `"bidirectional"`), `notifyUserIds`.

**Processor logic:**
1. If `stalenessKey` is set: re-read `profiles.statusSetAt` for `userId`. If `currentStatus` is cleared or `statusSetAt` differs → skip silently (setter has since set a new status; this child belongs to the old epoch).
2. Call `evaluateStatusMatch(contextA, contextB, matchType, categoriesA, categoriesB, ctx)` with `ctx.jobName = "evaluate-status-match"`.
3. If `!isMatch` → return (no event, no push).
4. INSERT row(s) based on `insertMode` (`onConflictDoNothing`).
5. For each id in `notifyUserIds`: `publishEvent("statusMatchesReady", { userId: id, matchedUserIds: [otherUserId] })` (where `otherUserId` is the OTHER side of the pair — setter: always `candidateUserId`; proximity: `candidateUserId` when notifying moving user and `userId` when notifying candidate) and `sendAmbientPushWithCooldown(id)`. The 1h Redis cooldown (`ambient-push:{userId}`) collapses fan-out into at most one push per user per hour.

**Dedup:** BullMQ `deduplication` with id `evaluate-status-match-{userId}-{candidateUserId}-{stalenessKey ?? "na"}`. The epoch suffix means rapid setStatus runs produce fresh children for the same pair without collision.

**`removeOnComplete`:** default

### Ops Queue (7 types) — `queue-ops.ts`

### 10. `hard-delete-user` — GDPR Anonymization

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

### 11. `export-user-data` — GDPR Data Export

**What:** Collects all user data and emails it as an export.

**Trigger:** `enqueueDataExport()` — user requests data export.

**Processor logic:** Delegates to `collectAndExportUserData()` in `data-export.ts`.

**JobId:** `export-{userId}-{timestamp}` (allows multiple exports)

**Retry:** 10 attempts, exponential backoff (60s base → ~8.5h total). Overrides queue default because GDPR export is a legal obligation.

**`removeOnFail`:** false — failed export jobs are never auto-removed. Every failure must be resolved.

**Failure handling:** After all retries exhausted: (1) user gets "export delayed" email, (2) prominent `GDPR EXPORT FAILED` console error. Admin alerting TODO(BLI-169). See `data-export.md` for details.

### 12. `admin-soft-delete-user` — Admin Soft Delete

**What:** Soft-deletes a user account via admin panel. Calls `softDeleteUser()` service function from `apps/api/src/services/user-actions.ts`.

**Trigger:** Admin panel "Usuń konto" action → `enqueueAndWait()` from admin app.

**Processor logic:** Delegates to `softDeleteUser(userId)` — same logic as user-initiated deletion but without OTP verification. Transaction: set `deletedAt`, delete sessions, delete push tokens. Post-transaction: `forceDisconnect` event + enqueue `hard-delete-user` delayed job.

**`removeOnComplete`:** true (via admin enqueue options)

### 13. `admin-restore-user` — Admin Restore User

**What:** Restores a soft-deleted user during the 14-day grace period. Calls `restoreUser()` service function.

**Trigger:** Admin panel "Przywróć konto" action → `enqueueAndWait()` from admin app.

**Processor logic:** Delegates to `restoreUser(userId)` — clears `user.deletedAt` and cancels the pending `hard-delete-user` delayed job.

**`removeOnComplete`:** true (via admin enqueue options)

### 14. `admin-force-disconnect` — Admin Force Disconnect

**What:** Closes all active WebSocket connections for a user.

**Trigger:** Admin panel "Rozłącz" action → `enqueueAndWait()` from admin app.

**Processor logic:** Calls `publishEvent("forceDisconnect", { userId })`. No data changes — just closes WS connections. The mobile app auto-reconnects.

**`removeOnComplete`:** true (via admin enqueue options)

### 15. `admin-suspend-user` — Admin Suspend User (BLI-156)

**What:** Marks a user account as suspended — blocks login, hides from discovery, declines pending waves, closes live sessions. Admin-driven moderation state parallel to (but distinct from) soft-delete. See `moderation-suspension.md`.

**Trigger:** Admin panel "Zawieś konto" dialog → `enqueueOpsAndWait()` from admin app with `{ userId, reason }`.

**Processor logic:** Calls `suspendUser(userId, reason)` in `apps/api/src/services/user-actions.ts`. Transaction: set `suspendedAt` + `suspendReason`, delete sessions + push tokens, auto-decline pending waves in both directions. Post-transaction: `publishEvent("forceDisconnect", { userId })`.

**`removeOnComplete`:** true (via admin enqueue options)

### 16. `admin-unsuspend-user` — Admin Unsuspend User (BLI-156)

**What:** Clears the suspension — restores login capability. Does not re-open the auto-declined waves (by design, per `infra/waves-irreversible`).

**Trigger:** Admin panel "Odwieś konto" action → `enqueueOpsAndWait()` from admin app with `{ userId }`.

**Processor logic:** Calls `unsuspendUser(userId)`: clears `suspendedAt` and `suspendReason`.

**`removeOnComplete`:** true (via admin enqueue options)

### Maintenance Queue (7 types) — `queue-maintenance.ts`

### 17. `flush-push-log` — Push Log Batch Flush

**What:** Drains the `blisko:push-log` Redis list and batch-inserts all buffered push notification events into the `push_sends` database table.

**Trigger:** BullMQ repeatable job scheduler, every 15 seconds. Registered in `startMaintenanceWorker()` via `queue.upsertJobScheduler()`.

**Processor logic:**
1. Atomically swap the Redis list (`RENAME blisko:push-log blisko:push-log:processing`)
2. Read all entries from the processing list
3. Batch insert into `push_sends` table
4. Delete the processing list

**Why batch:** Push events are appended to Redis via `RPUSH` (~0.1ms) from the hot path in `sendPushToUser()`. Batching avoids per-push DB inserts. At 15s intervals, this means 1 DB insert per 15s regardless of push volume.

**Infrastructure:** Uses `createBatchBuffer` — a generic reusable Redis-buffered batch writer in `apps/api/src/services/batch-buffer.ts`.

### 18. `prune-push-log` — Push Log Cleanup

**What:** Deletes push log entries older than 7 days from the `push_sends` table.

**Trigger:** BullMQ repeatable job scheduler, every hour. Registered in `startMaintenanceWorker()`.

**Processor logic:** `DELETE FROM push_sends WHERE created_at < NOW() - 7 days`.

### 19. `flush-ai-calls` — AI Call Log Batch Flush

**What:** Drains the `blisko:ai-calls` Redis list and batch-inserts all buffered AI call events into the `metrics.ai_calls` database table.

**Trigger:** BullMQ repeatable job scheduler, every 15 seconds. Registered in `startMaintenanceWorker()` via `queue.upsertJobScheduler()`.

**Processor logic:** Calls `aiCallBuffer.flush()` from `ai-log.ts`. Same `createBatchBuffer` pattern as `flush-push-log`: atomic `RENAME` swap → `LRANGE` → batch `INSERT` → `DEL`.

**Why batch:** Every OpenAI call in the hot path (map view `quick-score` especially) appends to Redis (~0.1ms) via `withAiLogging()`. Batching keeps the write amplification proportional to time, not volume.

**Source:** `apps/api/src/services/ai-log.ts` (buffer + wrapper), `apps/api/src/services/ai-log-buffer.ts` (`createBatchBuffer` + `onFlush` writer).

See `ai-cost-tracking.md` for the wrapper design and admin dashboard.

### 20. `prune-ai-calls` — AI Call Log Cleanup

**What:** Deletes AI call log entries older than 7 days from the `metrics.ai_calls` table.

**Trigger:** BullMQ repeatable job scheduler, every hour.

**Processor logic:** `DELETE FROM metrics.ai_calls WHERE timestamp < NOW() - INTERVAL '7 days'` via `pruneAiCalls(SEVEN_DAYS_MS)`.

### 21. `consistency-sweep` — Nightly Consistency Sweep

**What:** Scans for stuck state left by failed queue jobs and repairs it. Three checks: zombie profiles (bio exists but portrait/embedding missing), stuck profiling sessions (all Q&A answered but no generated profile), abandoned sessions (active >24h).

**Trigger:** BullMQ repeatable job scheduler, daily at 3:00 AM (`pattern: "0 3 * * *"`). Also manually triggerable from admin panel via "Consistency Sweep" button on the queue page.

**Processor logic:**
1. Mark sessions active >24h as `abandoned` (cleanup first to avoid race with step 3)
2. Find profiles with `bio` but null `portrait`, `updatedAt` > 1h → re-enqueue `generate-profile-ai`
3. Find sessions status=`active`, `generatedBio` null, has sufficient Q&A, 1h-24h old → re-enqueue `generate-profile-from-qa`

**Source:** `apps/api/src/services/consistency-sweep.ts` — `runConsistencySweep()` function shared between scheduler and admin trigger.

**Returns:** `SweepResult` with counts for each category (found/enqueued/cleaned).

### 22. `cleanup-test-users` — Test User Cleanup

**What:** Physically deletes test users (`@example.com` emails, excluding chatbot demos `user[0-249]@example.com`) and all their relational data. Production accumulates these from CI runs.

**Trigger:** BullMQ repeatable job scheduler, daily at 4:00 UTC (`pattern: "0 4 * * *"`).

**Processor logic:**
1. Select up to 500 users matching `email LIKE '%@example.com' AND email NOT LIKE 'user%@example.com' AND created_at < now() - 1h`
2. In a single `db.transaction`, delete from 11 dependent tables in dependency order (statusMatches, messageReactions, messages, conversationParticipants, conversationRatings, conversations, connectionAnalyses, waves, blocks, pushTokens, topics — 4 of these are dual-FK tables deleted with `or(inArray(colA, ids), inArray(colB, ids))`)
3. Delete the user row — `ON DELETE CASCADE` on profiles, sessions, account, profilingSessions, profilingQA handles the rest

**Why physical delete (not anonymization):** `processHardDeleteUser` preserves the user row with a "Usunięty użytkownik" placeholder so other users' conversation history stays intact — this is the GDPR-compliant path for real users. Test users are pure CI cruft; preserving placeholders would just bloat the DB.

**Why 1h `createdAt` margin:** Protects an active CI run from having its test user yanked mid-flow. E2E suite completes in ~45 min; 1h is a safe buffer.

**Why `LIMIT 500`:** Caps a single transaction at a manageable size. If accumulation exceeds 500/day, subsequent runs catch up.

**Job options override:** `attempts: 1` (no retry storm — wait 24h on failure), `removeOnComplete: { count: 30 }`, `removeOnFail: { count: 30 }` (~month of history).

**Source:** `apps/api/src/services/test-users-cleanup.ts` — `cleanupTestUsers()` + `isTestUserEmail()` helper.

**Returns:** `{ found, deleted, sampledIds }`.

**Definition of "test user" lives in 4 places** (BLI-271 will consolidate via a `user.isTestUser` column):
1. `cleanupTestUsers()` SQL filter — `apps/api/src/services/test-users-cleanup.ts`
2. `isTestUserEmail()` helper (mirrors filter, used by tests; future use: `/dev/auto-login` to set the flag) — same file
3. Admin `seedFilter` — `apps/admin/src/server/routers/users.ts`
4. Manual escape hatch dev-cli `cleanup-e2e` (narrower `seed%@example.com` filter) — `packages/dev-cli/src/cli.ts`

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

## Worker Failure Handling

When a job exhausts all retry attempts (3 by default with exponential backoff), the worker's `failed` handler publishes failure events via WebSocket:

- **`analyze-pair` / `quick-score`:** publishes `analysisFailed` to both users in the pair. Mobile retries via `ensureAnalysis`.
- **`generate-profiling-question`:** publishes `questionFailed` to the user. Mobile retries via `retryQuestion` (re-enqueues question generation with current QA state).
- **`generate-profile-from-qa`:** publishes `profilingFailed` to the user. Mobile retries via `retryProfileGeneration` (re-enqueues profile generation with current QA state).
- **`generate-profile-ai`:** publishes `profileFailed` to the user. Mobile retries via `retryProfileAI` (re-enqueues portrait/embedding/interest generation with current bio/lookingFor from DB).
- **`status-matching`:** publishes `statusMatchingFailed` to the user on parent-level terminal failures (DB error, unexpected exception before/after fan-out). Mobile retries via `retryStatusMatching`. Note: individual `evaluate-status-match` child failures are silent by design — `evaluateStatusMatch` itself swallows LLM/parse errors to `{ isMatch: false }`, so a terminal child failure means a non-LLM error (DB write) and the next `setStatus` re-enqueues cleanly.

**Self-healing loop:** The mobile client keeps retrying as long as the user is visible in the UI — there is no retry limit or badge clearing. Natural backoff: each BullMQ cycle takes ~35s (3 retries with exponential backoff 5s→10s→20s). The existing 30s self-healing timer (in the nearby screen) covers the case where the user was offline during the failure event.

**Second leg — missed-success reconciliation.** The `*Failed` path above only fires on permanent job failure. If a job succeeds while the client's WS is dropped (sim reload, app backgrounded, flaky network), the terminal `*Ready` / `profilingComplete` / `statusMatchesReady` event is lost. The synthetic `reconnected` event (see `websockets-realtime.md`) fires after re-auth and is consumed by handlers that are still waiting on a completion — e.g. `onboarding/profiling-result.tsx` refetches `profiling.getSessionState` on `reconnected` so a profile generated during the drop transitions the UI forward without the user tapping anything (BLI-229).

**Why no retry cap:** The design principle is that if a user is visible on the map/list without an analysis, the system keeps trying until it succeeds. Transient failures (LLM rate limits, Redis hiccups) resolve themselves; permanent failures (API key revoked) are operational issues that should be fixed at the source, not hidden from users.

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
| **BullMQ queues (3)** | ioredis (internal) | `bull:ai:*`, `bull:ops:*`, `bull:maintenance:*` | Managed by BullMQ |
| **WS pub/sub bridge** | Bun `RedisClient` | Channel: `ws-events` | N/A (pub/sub) |
| **Analysis notification** | Bun `RedisClient` | Channel: `analysis:ready` | N/A (pub/sub) |
| **Rate limiting** | Bun `RedisClient` | `rl:{context}:{userId}:{window}` | 2x window seconds |
| **Ambient push cooldown** | Bun `RedisClient` | `ambient-push:{userId}` | 3600s (1 hour) |
| **Message idempotency** | Bun `RedisClient` | `idem:msg:{userId}:{idempotencyKey}` | 300s (5 minutes) |
| **Push log buffer** | Bun `RedisClient` | `blisko:push-log` | None (drained every 15s) |
| **AI call log buffer** | Bun `RedisClient` | `blisko:ai-calls` | None (drained every 15s) |

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
4. `startAiWorker()` — starts AI queue worker (concurrency 50)
5. `startOpsWorker()` — starts ops queue worker (concurrency 10) + legacy migration
6. `startMaintenanceWorker()` — starts maintenance worker (concurrency 2) + registers repeatable schedulers
7. Bun server starts on `PORT` (default 3000) with WS upgrade handler

## Impact Map

If you change this system, also check:
- **AI job type added/removed:** Update `AIJob` union in `queue.ts`, `processJob` switch, add enqueue function
- **Ops job type added/removed:** Update `OpsJob` union in `queue-ops.ts`, `processOpsJob` switch, add enqueue function
- **Maintenance job type added:** Update `MaintenanceJob` union in `queue-maintenance.ts`, `processMaintenanceJob` switch
- **Profile schema changed:** `analyze-pair` and `quick-score` fetch profiles — update field lists. Profile hash calculation uses `bio` + `lookingFor`
- **Status schema changed:** `status-matching` and `proximity-status-matching` both query status fields
- **Redis connection:** All 3 BullMQ queues, rate limiter, WS bridge, ambient push, message idempotency share `REDIS_URL`
- **Queue config (attempts, backoff):** Each queue has its own defaults in its source file. Exception: `export-user-data` overrides ops defaults
- **Service functions (`user-actions.ts`):** `softDeleteUser` and `restoreUser` are called by both user tRPC and ops BullMQ worker — changes affect both paths
- **Admin BullMQ client:** Admin app connects to same Redis via `REDIS_URL`. Reads from `ai` + `ops` queues for the live feed. Writes via `enqueueAiAndWait` (AI jobs: reanalyze, regenerate) or `enqueueOpsAndWait` (ops jobs: delete, restore, disconnect). See `admin-panel.md`
- **Admin live feed:** Polls `ai` + `ops` queues, merges results. Maintenance queue intentionally excluded. Source: `apps/admin/src/server/routers/queue.ts`
- **Worker concurrency:** Each queue has independent concurrency. AI=50 (OpenAI I/O-bound), Ops=10 (DB-bound), Maintenance=2 (periodic)
- **Shared worker logger:** `attachWorkerLogger()` in `queue-shared.ts` — handles Prometheus metrics + console logging for all 3 workers
- **Debounce TTLs:** Changing profile-ai debounce affects how quickly profile updates propagate; proximity-status debounce affects how responsive ambient matching is to movement
- **`hard-delete-user` processor:** In `queue-ops.ts`. Must be updated when new tables store personal data (check `security/new-tables-check` rule)
- **`analysis:ready` Redis channel:** Chatbot subscribes to this — changing format breaks bot wave acceptance
- **`connectionAnalyses` table:** Both `analyze-pair` and `quick-score` write to it — schema changes affect both
- **Queue name constants:** `QUEUE_NAMES` in `queue-shared.ts`. Admin app has matching local constants — keep in sync
- **Changing the "test user" definition** (BLI-271 migration to `user.isTestUser` column): Update the WHERE clause in `cleanupTestUsers()` (`apps/api/src/services/test-users-cleanup.ts`), the admin `seedFilter` (`apps/admin/src/server/routers/users.ts`), and the dev-cli `cleanup-e2e` command (`packages/dev-cli/src/cli.ts`). The `isTestUserEmail()` helper stays — moves from "predicate mirror" role to "decide flag at user-creation time" role inside `/dev/auto-login`.
- **New table with `user` FK:** Update the delete order in `cleanupTestUsers()` (`apps/api/src/services/test-users-cleanup.ts`), the parallel list in `packages/dev-cli/src/cli.ts` `cleanup-e2e`, and the anonymization or preservation decision in `processHardDeleteUser` (`queue-ops.ts`). All three touch the same FK graph from different angles.
