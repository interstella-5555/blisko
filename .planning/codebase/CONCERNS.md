# Codebase Concerns

**Analysis Date:** 2026-03-26

## Tech Debt

**Large procedure files (API routes):**
- **Issue:** Several tRPC procedure files have grown beyond 800+ lines, mixing concerns (validation, DB queries, business logic, event publishing, push notifications)
- **Files:**
  - `apps/api/src/trpc/procedures/messages.ts` (854 lines)
  - `apps/api/src/trpc/procedures/groups.ts` (823 lines)
  - `apps/api/src/trpc/procedures/profiles.ts` (633 lines)
- **Impact:** Difficult to test individual concerns, hard to refactor without breaking multiple features, hidden dependencies on side effects (push notifications, event publishing)
- **Fix approach:** Extract helpers into service modules. Create domain-specific utilities for common operations (e.g., batch-fetch patterns, participant authorization, soft-delete filtering). Separate sync DB operations from async side effects using task queues instead of inline calls.

**Queue service complexity (1321 lines):**
- **Issue:** `apps/api/src/services/queue.ts` handles 9+ job types with deeply nested logic for analyzing pairs, profiling, status matching, and user deletion. Error paths are inconsistently handled
- **Files:** `apps/api/src/services/queue.ts`
- **Impact:** Difficult to add new job types, performance logging is detailed but error recovery is silent (just `console.error`), no circuit breaker for expensive AI operations
- **Fix approach:** Split into job-type-specific modules (e.g., `queue-analysis.ts`, `queue-profiling.ts`). Centralize job creation with validation. Add structured error handling with retryability classification (permanent failures vs. transient).

**Direct async side effects in handlers:**
- **Issue:** Push notifications and WebSocket events are fired directly inside endpoint handlers without isolation (e.g., `apps/api/src/trpc/procedures/groups.ts` lines 131-143, `apps/api/src/services/push.ts`). Failures are swallowed with `void` or silent catch blocks
- **Files:**
  - `apps/api/src/trpc/procedures/groups.ts`
  - `apps/api/src/trpc/procedures/waves.ts`
  - `apps/api/src/services/push.ts` (lines 59-61)
- **Impact:** If push service is slow or fails, it delays/blocks the main request. No retry strategy or fallback queue for failed notifications
- **Fix approach:** Move push notifications to a background job queue (BullMQ). Store notification intent before sending, with a separate worker. Implement exponential backoff for transient failures. Wire feature gate for disabling notifications if needed.

---

## Known Bugs

**Push notification deduplication may fail on rapid reconnection:**
- **Symptoms:** Users may see duplicate push notifications when reconnecting to WebSocket after brief disconnection (seconds)
- **Files:** `apps/mobile/src/lib/ws.ts` (lines 143-156), `apps/api/src/services/push.ts` (lines 20-21)
- **Trigger:** User loses network for <5 seconds, reconnects quickly. Server may send push notification during the brief disconnection, then again after reconnect because `isUserConnected()` check is unreliable (client-side timing race)
- **Workaround:** Client-side deduplication in Zustand store with message ID + timestamp. Prevent reprocessing of the same event within 2 seconds

**Invalid token index ticket in Apple integration:**
- **Symptoms:** Apple OAuth deep links fail to validate; sign-in OTP deeplinks may be rejected
- **Files:** `apps/website/server/routes/.well-known/apple-app-site-association.get.ts` (line 8), `apps/website/src/config.ts` (line 4)
- **Trigger:** When app is deployed to App Store, real Apple Team ID and App Store ID are not filled in (currently "TEAMID" and "id0")
- **Workaround:** Pre-deployment checklist must include filling these values. CI/CD should fail if these remain as placeholders
- **Fix approach:** Replace with environment variables `APPLE_TEAM_ID` and `IOS_APP_STORE_ID`. Validate in build step that they're not placeholders

**Android fingerprint configuration missing:**
- **Symptoms:** Android universal links don't work; `assetlinks.json` has empty fingerprints
- **Files:** `apps/website/server/routes/.well-known/assetlinks.json.get.ts` (line 9)
- **Trigger:** On first Android app release, fingerprints must be generated from the signing certificate used in Play Store
- **Workaround:** Manual step after first Android build—generate fingerprints via Play Console and update code
- **Fix approach:** Document the process. Add a setup script that can be run locally to generate fingerprints from a provided keystore

---

## Security Considerations

**CSRF disabled for cross-site POST compatibility:**
- **Risk:** `apps/api/src/auth.ts` (line 93) disables CSRF checks globally to support React Native OAuth flows (Apple uses `response_mode=form_post`). This is necessary but widens attack surface
- **Files:** `apps/api/src/auth.ts` (line 93)
- **Current mitigation:** Better Auth uses Expo SDK for client-side OAuth (avoids browser POST). State parameter uses `sameSite=none` + `secure`. API-side origin validation should be strict
- **Recommendations:**
  - Add explicit origin whitelist for trusted OAuth callback URLs (currently relies on `trustedOrigins`)
  - Monitor for unusual POST origins in logs
  - Consider rotating BETTER_AUTH_SECRET regularly (especially before wide rollout)

**OAuth token storage:**
- **Risk:** Facebook and LinkedIn access tokens are stored in DB for profile enrichment (`apps/api/src/auth.ts` lines 33-48). If DB is breached, social accounts could be compromised
- **Files:** `apps/api/src/auth.ts`, `apps/api/src/db/schema.ts` (line 63: `accessToken`)
- **Current mitigation:** Tokens are scoped to specific permissions and expire. No tokens are displayed in data exports
- **Recommendations:**
  - Add token encryption at rest (store in `apps/api/.env.production` via Railway secrets, not plaintext)
  - Rotate tokens weekly; invalidate on user deletion
  - Consider token proxy pattern (exchange for session-scoped credential instead of storing raw token)

**Soft-delete filtering gaps (potential data leak):**
- **Risk:** Soft-deleted users must be filtered from discovery, but filtering is manual per-query. Easy to forget `isNull(schema.user.deletedAt)` in new queries
- **Files:** Various tRPC procedures, especially new ones in groups/profiling discovery
- **Current mitigation:** `security/filter-soft-deleted` rule in CLAUDE.md. Existing queries have the filter
- **Recommendations:**
  - Create a helper function `notSoftDeleted(userId: string)` to centralize the filter
  - Add a pre-commit hook that flags new queries missing soft-delete filters (scan for `db.query` or `db.select` without the filter)
  - Test with a fresh soft-deleted user in the test suite to catch regressions

**Email OTP exposure in logs:**
- **Risk:** `apps/api/src/auth.ts` (line 112) logs the OTP to stdout for local development. In production, if logs are piped to files or monitoring services, OTPs are exposed
- **Files:** `apps/api/src/auth.ts` (lines 112, 116)
- **Current mitigation:** This is intentional for local dev. Production logs should be configured to redact
- **Recommendations:**
  - Only log in development mode (check `NODE_ENV`)
  - If logs go to centralized service, add a redaction rule for `OTP for .* : .*`
  - Implement OTP rate limiting per email (already 6-char, 5-min expiry is reasonable)

**Account linking with `allowDifferentEmails`:**
- **Risk:** `apps/api/src/auth.ts` (line 17) allows linking multiple OAuth providers with different emails. A user could link an attacker's email, gaining access to that account
- **Files:** `apps/api/src/auth.ts` (line 17)
- **Current mitigation:** Better Auth validates that each provider's email is legitimate (verified by that provider). Still, a compromised email could be linked
- **Recommendations:**
  - Add a verification step: after linking a new provider, send a confirmation email to the main account
  - Disable linking if primary email doesn't match provider email (more restrictive but safer)
  - Audit account linking in the `better-auth` hooks

---

## Performance Bottlenecks

**N+1 query in message conversations (potentially fixed, needs verification):**
- **Problem:** `apps/api/src/trpc/procedures/messages.ts` (lines 135-150) loads sender display names for group last messages. If many groups have different last senders, this could be N queries
- **Files:** `apps/api/src/trpc/procedures/messages.ts` (lines 144-150)
- **Current approach:** Batch fetches `senderProfiles` in a single query, which is good. But if the feature expands (e.g., showing member list per group), risk of regression
- **Improvement path:** Already using batch-fetch pattern. Document this as a template for similar features. Add test case with 100+ groups to catch regressions

**Metrics buffer management can drop events silently:**
- **Problem:** `apps/api/src/services/metrics.ts` (lines 42-45) drops 10% of oldest events if buffer hits 5000 capacity. In high-traffic periods, important analytics are lost
- **Files:** `apps/api/src/services/metrics.ts` (lines 42-45)
- **Cause:** Unbounded buffer can grow if flush fails repeatedly (e.g., DB connection pool exhausted)
- **Improvement path:**
  - Track drop rate in metrics (expose `metrics_buffer_drops_total`)
  - Set alert if drop_rate > 5% over 5 minutes
  - Increase FLUSH_THRESHOLD if realistic traffic estimates are higher
  - Consider async queue (BullMQ) for durable buffering instead of in-memory

**Distance calculation in proximity matching runs subqueries for each user:**
- **Problem:** `apps/api/src/services/queue.ts` (lines 475-490) calculates Haversine distance for all nearby users. If a user has 500+ nearby matches, this runs a complex WHERE clause for each
- **Files:** `apps/api/src/services/queue.ts` (lines 475-490)
- **Cause:** Drizzle doesn't have built-in Haversine, so raw SQL is used. Executed inside a loop per user
- **Improvement path:** Denormalize distance calculation into a materialized view (run nightly). Or implement a spatial index (PostGIS), then use Drizzle with raw SQL in a single query instead of per-user

**WebSocket event broadcasting loops over all clients:**
- **Problem:** `apps/api/src/ws/handler.ts` (lines 166, 184) broadcast to all connected clients. With 1000+ users online, each broadcast iterates 1000 times
- **Files:** `apps/api/src/ws/handler.ts` (lines 166-185)
- **Current scale:** Blisko is small (demo phase), so not critical yet
- **Scaling path:**
  - Pre-filter clients by subscription/room (already done for conversation subscribers)
  - Use Redis pub/sub (already in place for multi-instance deployment)
  - For user-specific broadcasts, maintain a `userId → WebSocket` map for O(1) lookup

---

## Fragile Areas

**Conversation participant authorization (multiple code paths):**
- **Files:** `apps/api/src/trpc/procedures/groups.ts` (lines 28-58)
- **Why fragile:** Authorization check `requireGroupParticipant()` is a helper, but not all group mutations use it (need to verify). If a new mutation is added without calling this, it could allow non-members to modify groups
- **Safe modification:**
  - Always call `requireGroupParticipant(conversationId, ctx.userId, minRole)` at the start of group mutations
  - Create a wrapper procedure factory: `groupMutation(schema, minRole)` that bakes in the check
  - Add pre-commit test: scan for `eq(schema.conversations.type, "group")` in mutations without `requireGroupParticipant`

**Wave status transitions (no state machine):**
- **Files:** `apps/api/src/trpc/procedures/waves.ts`
- **Why fragile:** Waves have states (pending, accepted, declined), but transitions are enforced by inline checks. No formal state machine. Easy to create invalid transitions (e.g., accept a declined wave, respond twice)
- **Safe modification:**
  - Document allowed transitions as a state machine diagram
  - Create a validation function: `validateWaveTransition(currentStatus, newStatus) → boolean`
  - Test all edge cases: double-respond, decline then accept, respond after 30 days

**Profiling Q&A storage (text array with structured data):**
- **Files:** `apps/api/src/db/schema.ts` (profiling_qa uses array of text)
- **Why fragile:** Q&A pairs are stored as `{ question: string; answer: string }[]` in JSON, but the schema doesn't enforce structure. A corrupt entry could break AI processing
- **Safe modification:**
  - Use Drizzle relations to create a proper `profiling_questions` table with FK to user
  - Validate structure on write: `zodProfilingQASchema.parse(qa)` before storing
  - Add migration to backfill existing data, validate + drop invalid records

---

## Test Coverage Gaps

**Soft-delete filtering not covered in tests:**
- **What's not tested:** Creating/deleting users and verifying they're excluded from discovery, nearby queries, and group searches
- **Files:** `apps/api/__tests__/` (only 6 test files for entire API)
- **Risk:** Regressions in soft-delete filtering could expose deleted user data
- **Priority:** High — data privacy is critical

**Wave status transitions (edge cases):**
- **What's not tested:** Double-respond, respond after decline window, respond with mutual pending, wave from blocked user
- **Files:** `apps/api/__tests__/` (no wave-specific tests)
- **Risk:** Invalid state could be created, confusing UI and breaking expectations
- **Priority:** High — core feature

**WebSocket reconnection and message reconciliation:**
- **What's not tested:** Disconnect for 30 seconds, reconnect, verify no message loss or duplicates
- **Files:** `apps/mobile/src/lib/ws.ts` (no unit tests, only integration via E2E)
- **Risk:** Users miss messages or see duplicates
- **Priority:** Medium — affects reliability

**Metrics buffer overflow:**
- **What's not tested:** Simulating high traffic (>5000 events/10s), verify drop rate and alarm
- **Files:** `apps/api/__tests__/` (no metrics tests)
- **Risk:** Silent analytics loss in production
- **Priority:** Medium — observability

**Database constraint violations:**
- **What's not tested:** Duplicate wave IDs, profile without user, participant in non-existent group
- **Files:** `apps/api/__tests__/` (no database constraint tests)
- **Risk:** Data integrity violations in edge cases
- **Priority:** Medium — safety

---

## Missing Critical Features

**Token refresh mechanism (oauth tokens):**
- **Problem:** LinkedIn and Facebook access tokens are stored but never refreshed. After 3–6 months, they expire
- **Impact:** Profile enrichment breaks silently for those providers
- **Blocks:** Can't maintain up-to-date social profile info over time
- **Recommendation:** Implement refresh token flow. Store refresh tokens in `apps/api/.env.production` secrets (not DB). Schedule a cron job to refresh weekly

**Graceful shutdown on Railway redeploy:**
- **Problem:** `apps/api/src/services/metrics.ts` has a flush timer but no pre-shutdown hook. Active requests and buffered metrics may be lost during Railway deployment
- **Impact:** Analytics gaps during each deploy, incomplete request spans in observability
- **Blocks:** Accurate monitoring during deployment windows
- **Recommendation:** Add Bun lifecycle handler to flush all buffers + drain WebSocket connections before exit. Use Railway's `SIGTERM` signal handler

**Data anonymization job errors (GDPR compliance):**
- **Problem:** Hard delete and anonymization jobs in queue have no monitoring. If a job fails 3 times and is dropped, a user's data isn't actually deleted
- **Impact:** GDPR non-compliance if deletion requests aren't honored
- **Blocks:** Legal requirement for app in EU
- **Recommendation:** Log all anonymization completions to audit table. Schedule a daily reconciliation job to verify all `deletedAt > 14 days ago` have been anonymized

**Rate limit status exposure in API:**
- **Problem:** Rate limit failures return generic errors but don't indicate remaining quota or reset time
- **Impact:** Clients can't implement smart backoff (they either retry or give up)
- **Blocks:** Good developer experience; prevents thundering herd retries
- **Recommendation:** Return `Retry-After` and `X-RateLimit-*` headers on 429 responses. Expose rate limit state to mobile client so UI can warn before hitting limit

---

## Scaling Limits

**WebSocket connection count (single instance):**
- **Current capacity:** Bun's WebSocket server can handle ~10k concurrent connections per instance. With typical connection churn, expect ~5k peak stable connections
- **Limit:** If daily active users exceed 20k, peak connections could exceed 5k → need horizontal scaling with Redis pub/sub
- **Scaling path:**
  - Use Railway's auto-scaling to add instances
  - Ensure Redis bridge is working (already implemented in `apps/api/src/ws/redis-bridge.ts`)
  - Load balance WebSocket connections by user ID hash (sticky sessions)

**Database connection pool:**
- **Current capacity:** Default connection pool is ~10 connections. Under high concurrency (>100 req/s), pool exhaustion is possible
- **Limit:** Triggers "too many connections" errors at ~150+ simultaneous requests
- **Scaling path:** Increase pool size in `apps/api/src/db/index.ts` (postgres-js config). Monitor with `SELECT count(*) FROM pg_stat_activity` in RDS. Add alert at 80% pool usage

**Push notification throughput:**
- **Current capacity:** Expo API rate limit is ~1000 notifications/second. With 50k users, a global push event could take 50 seconds to deliver
- **Limit:** Breaks if notification volume exceeds 1k/sec
- **Scaling path:**
  - Segment pushes by user cohort (e.g., 5 batches staggered over 10 seconds)
  - Use Redis queue with multiple workers to parallelize chunk processing
  - Implement notification priority (urgent = immediate, ambient = batched)

**Metrics buffer capacity:**
- **Current capacity:** ~5000 events in-memory before dropping. At 100 req/s, buffer fills in ~50 seconds if flush fails
- **Limit:** If flush fails (DB overloaded) and traffic is sustained, events are lost silently
- **Scaling path:**
  - Move to durable queue (BullMQ with Redis)
  - Increase flush frequency if DB can handle it
  - Add circuit breaker: if flush fails 3x, pause writes and trigger alarm

---

## Dependencies at Risk

**Better Auth library (emerging, v0.x):**
- **Risk:** Better Auth is still early-stage (v0.x). API may change, and community support is limited compared to NextAuth or Clerk
- **Impact:** OAuth integration breaks on major version bump. Migrating to a stable auth solution requires refactoring all routes
- **Workaround:** Pin version in `package.json`. Monitor GitHub releases
- **Migration plan:** If stability concerns grow, migrate to Clerk (better mobile support). Would require: (1) new tRPC endpoints for Clerk endpoints, (2) drop Better Auth schema, (3) sync user table with Clerk IDs

**Expo + React Native (version churn):**
- **Risk:** React Native ecosystem moves fast. New version every 2–3 months. Dependency tree can become incompatible
- **Impact:** Can't upgrade core libraries, security patches blocked
- **Current status:** Recently upgraded React to 19.1.0 and TypeScript to 6.0.2 (commits show active maintenance)
- **Mitigation:** Stay on minor versions within major. Run `npx expo doctor` monthly to catch broken deps

**BullMQ + Redis (critical infrastructure):**
- **Risk:** Both are stable, but Redis is a single point of failure. If Redis goes down, all jobs are blocked (including user deletion, which is time-sensitive for GDPR)
- **Impact:** Cascading failures; users can't delete accounts
- **Scaling path:** Use Railway's managed Redis with automatic failover. Implement circuit breaker in queue clients (fail-open if Redis is unavailable, queue to in-memory buffer)

---

## Unforeseen Issues

**Timezone handling in wave cooldown:**
- **Problem:** `apps/api/src/trpc/procedures/waves.ts` (line 75) sets `todayMidnight` using `setUTCHours()`, but the user might be in a different timezone. If a user is in UTC+2 and sends a wave at 2 AM their time (0 AM UTC), they reset the counter immediately
- **Impact:** Daily ping limit is off by a full day for non-UTC users
- **Fix:** Use user's timezone (store in profile) or switch to a per-user "day" that resets at their local midnight. This requires storing timezone and doing arithmetic on the server

**Duplicate analysis due to queuing race:**
- **Problem:** Multiple users querying the same pair rapidly could queue `analyze-pair` jobs before the first completes. Both jobs run and insert twice
- **Impact:** Wasted AI API calls, duplicate rows overwriting each other (is non-destructive due to `onConflictDoUpdate` but wasteful)
- **Fix:** Add deduplication in queue. Before inserting analyze-pair job, check if one already exists for that pair in the queue (use `PENDING` job status)

**Message read-state ambiguity in groups:**
- **Problem:** `apps/api/src/trpc/procedures/messages.ts` (line 85) has a complex `CASE WHEN` for groups vs DMs. Groups use `lastReadAt` cursor, DMs use per-message `readAt`. If a query is written to the wrong branch, unread counts are wrong
- **Impact:** User sees old messages as unread or vice versa
- **Fix:** Create separate functions: `getUnreadCountDM()` and `getUnreadCountGroup()`. Use feature gate or conversation type check to call the right one

---

*Concerns audit: 2026-03-26*
