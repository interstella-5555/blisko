# Pitfalls Research

**Domain:** Admin dashboard with BullMQ monitoring, telemetry, and programmatic API for an existing monorepo
**Researched:** 2026-03-26
**Confidence:** HIGH (grounded in codebase analysis + BullMQ docs + production post-mortems)

## Critical Pitfalls

### Pitfall 1: Shared Database Connection Pool Exhaustion

**What goes wrong:**
The admin app opens its own Drizzle/postgres-js connection pool to the same Railway PostgreSQL instance the main API uses. Under load (dashboard polling + API traffic + queue workers), the combined connection count exceeds PostgreSQL's `max_connections` (Railway default: 97). The main API starts getting "too many connections" errors, breaking user-facing features.

**Why it happens:**
Each postgres-js client creates its own pool (default: 10 connections). The main API already has one pool, the queue workers use connections, and now the admin app adds another. Developers don't think about aggregate connection count across services because each service works fine in isolation.

**How to avoid:**
- Set explicit `max` on the admin app's postgres-js client: `postgres(url, { max: 3 })`. The admin dashboard has low concurrency (1-2 users) so 3 connections is plenty.
- Add a Railway dashboard env var `DATABASE_MAX_CONNECTIONS` and document the budget: API gets 10, admin gets 3, leaving headroom for queue workers and direct `psql` access.
- Monitor `pg_stat_activity` count in the admin dashboard itself -- eat your own dog food.

**Warning signs:**
- Intermittent "too many clients already" errors in API logs during admin dashboard use.
- Dashboard queries timing out while API is under moderate load.

**Phase to address:** Phase 1 (database connection setup). Misconfiguring this at the start silently degrades the main API.

---

### Pitfall 2: BullMQ Monitoring Polling Hammers Redis

**What goes wrong:**
The admin dashboard calls `queue.getJobCounts()`, `queue.getJobs('failed')`, and `queue.getMetrics()` on a timer (e.g., every 2 seconds) to show real-time queue health. Each call executes multiple Redis commands (LLEN, ZCARD, HGETALL across job states). With a single queue this is fine, but the current setup has one "ai-jobs" queue handling 10+ job types. Aggressive polling from the admin app competes with the worker for Redis bandwidth, increasing job processing latency.

**Why it happens:**
Dashboard developers default to short polling intervals for "real-time feel." BullMQ's getter methods look cheap in code (`await queue.getJobCounts()`) but each one runs several Redis commands. The existing queue already does significant Redis I/O (see the 1321-line `queue.ts` with 10 job types). Adding monitoring queries on top tips the balance.

**How to avoid:**
- Poll no faster than every 10 seconds for queue stats. Queue health doesn't change faster than that in meaningful ways.
- Use BullMQ's built-in metrics system (`getMetrics('completed')`, `getMetrics('failed')`) which stores pre-aggregated per-minute counters in Redis -- much cheaper than scanning job lists each time.
- Cache `getJobCounts()` results server-side in the admin app (Nitro route with 10s TTL). Multiple browser tabs hitting the admin don't multiply Redis calls.
- Create a separate `Queue` instance for read-only monitoring with its own Redis connection, so monitoring never blocks job processing.

**Warning signs:**
- Redis `INFO commandstats` showing disproportionate LRANGE/ZRANGEBYSCORE calls.
- AI job processing latency increases when the admin dashboard is open.
- Redis CPU spikes correlated with admin dashboard page views.

**Phase to address:** Phase 1 (BullMQ monitoring). Get the polling interval right from the start; it's easy to tighten later but hard to loosen once people expect sub-second updates.

---

### Pitfall 3: Admin Write Operations Without Confirmation Gates

**What goes wrong:**
The admin dashboard exposes "retry failed job," "drain queue," and eventually "delete user" buttons. Someone (or the Claude Code programmatic API) triggers a destructive operation without a confirmation step. `queue.obliterate()` deletes all queue data irreversibly. A mass retry of 100 failed AI jobs floods the OpenAI API with $50+ of requests in seconds.

**Why it happens:**
Admin dashboards often start as "power user tools" where convenience trumps safety. The BullMQ API has destructive methods (`obliterate`, `drain`, `retryJobs`) that look identical to benign reads in code. Developers wire them to buttons without thinking about blast radius. The Claude Code programmatic API makes this worse -- an LLM can call these endpoints in loops.

**How to avoid:**
- Classify all admin operations into tiers: **read** (no confirmation), **write** (inline confirmation), **destructive** (modal confirmation with typed input, e.g., "type DRAIN to confirm").
- For the Claude Code API: the allowlist must default to read-only endpoints. Write endpoints require explicit opt-in per endpoint, not per category.
- Rate-limit destructive operations: max 1 drain/obliterate per hour. Max 10 job retries per minute (prevents mass-retry flooding the AI provider).
- Log every write operation with who/what/when to an audit table. The Claude Code API key should be associated with a named actor for audit trails.

**Warning signs:**
- No confirmation dialogs in the admin UI for any action.
- The Claude Code API allowlist starts with "all endpoints enabled."
- No audit log for admin operations.

**Phase to address:** Phase 1 (BullMQ monitoring) for queue operations, Phase 3 (Claude Code API) for programmatic access. But the operation classification system should be designed in Phase 1 and extended in later phases.

---

### Pitfall 4: API Key as Bearer Token Without Scoping or Rotation

**What goes wrong:**
The Claude Code admin API uses a single static API key stored as a Railway env var. The key grants access to all allowlisted endpoints with no expiration. If the key leaks (logged accidentally, committed in a `.claude` skill file, visible in a screen share), there's no way to know and no way to rotate without downtime.

**Why it happens:**
API key auth is the simplest auth scheme to implement. A single env var feels elegant. But "simple to implement" means "simple to compromise." The allowlist gives a false sense of security -- the key itself is the castle gate, and the allowlist is just room doors inside.

**How to avoid:**
- Store the API key hashed in the database, not as a plaintext env var that appears in Railway's UI. Generate it once, show it once, hash with SHA-256 before persisting.
- Add key metadata: `created_at`, `last_used_at`, `expires_at`. Display "last used" in the admin UI so suspicious activity is visible.
- Support key rotation: generate a new key, keep the old one valid for 24 hours (grace period), then invalidate. Never require the admin to update the key in all places simultaneously.
- Include the API key prefix (first 8 chars) in audit logs for identification without exposure.
- Rate-limit the API key: 60 requests/minute is generous for Claude Code usage. This limits blast radius if compromised.

**Warning signs:**
- API key visible in plaintext in Railway service variables.
- No `last_used_at` tracking on the key.
- Key has been the same value for months with no rotation mechanism.

**Phase to address:** Phase 3 (Claude Code API). Get this right before shipping the API to Claude Code.

---

### Pitfall 5: Telemetry Dashboard Queries Kill the Database

**What goes wrong:**
The ops dashboard runs aggregate queries against `request_events` (the metrics table that the main API flushes to). Queries like "error rate over 24 hours" or "p95 latency by endpoint" scan hundreds of thousands of rows. The admin dashboard runs these queries on page load and on every refresh. The database becomes IO-bound, slowing down user-facing API queries that share the same PostgreSQL instance.

**Why it happens:**
The `request_events` table is an append-only metrics store. It grows fast (every API request creates a row). Aggregate queries without proper indexing or time-bounding default to sequential scans. The existing `BUFFER_HARD_CAP` of 5000 events per flush means the table accumulates ~500K+ rows per day under moderate traffic.

**How to avoid:**
- Add a time-partitioned index on `request_events.timestamp` (if not already present). All dashboard queries must include a time range filter.
- Pre-aggregate metrics on write: maintain a `metrics_hourly` rollup table updated by a cron job. Dashboard reads from rollups, not raw events.
- Set a hard maximum time window for dashboard queries (e.g., 7 days). "Show me all time" should query rollup tables, never raw events.
- Use `EXPLAIN ANALYZE` on every dashboard query during development. No sequential scans on `request_events` in production.
- Purge raw `request_events` older than 30 days (keep rollups indefinitely).

**Warning signs:**
- Dashboard pages take >2 seconds to load.
- PostgreSQL `pg_stat_user_tables` shows high sequential scan count on `request_events`.
- Main API p95 latency increases when the admin dashboard is actively used.

**Phase to address:** Phase 2 (Ops dashboards). The schema design for pre-aggregation must happen before building any charts.

---

### Pitfall 6: In-Memory Session Store Loses State on Redeploy

**What goes wrong:**
The existing admin app stores OTP codes and sessions in in-memory `Map` objects (see `apps/admin/src/lib/auth.ts`). Every Railway redeploy clears all sessions, logging out the admin. If someone is in the middle of an OTP flow during a deploy, the OTP is lost. This also means horizontal scaling is impossible -- each instance has its own session store.

**Why it happens:**
In-memory auth was the right call for the initial scaffold (zero dependencies, instant startup). But it becomes a problem as soon as the admin dashboard is used daily and the API deploys frequently (which it does -- Railway auto-deploys on every push to main).

**How to avoid:**
- Move session storage to Redis (the same Redis instance used by BullMQ). Sessions are tiny (email + expiry) and Redis handles TTL natively with `SETEX`.
- Keep OTP storage in memory (OTPs are short-lived and losing one on redeploy is a minor annoyance -- just request a new one).
- Alternative: store sessions in PostgreSQL with a `sessions` table. Simpler than Redis for a single-admin scenario, and sessions survive redeploys.

**Warning signs:**
- Admin gets logged out after every deploy.
- "OTP expired" errors that correlate with deploy timestamps.

**Phase to address:** Phase 1 (foundation/auth hardening). Fix this early so subsequent phases don't build on a fragile auth layer.

---

### Pitfall 7: Allowlist State Becomes a Security Bypass Vector

**What goes wrong:**
The allowlist (which endpoints Claude Code can access) is stored in the database and managed via a UI toggle. If the allowlist check has a bug -- e.g., checking against the wrong table, using `LIKE` instead of exact match, or failing open when the DB is unreachable -- all endpoints become accessible. Worse: if the allowlist defaults to "enabled" for new endpoints, adding a dangerous admin endpoint automatically exposes it to Claude Code.

**Why it happens:**
Allowlist logic is deceptively simple: "if endpoint in allowlist, allow." But edge cases multiply: What about path parameters (`/api/users/:id`)? What about query strings? What if the endpoint path changes during a refactor? What if a new endpoint is added and nobody remembers to set its allowlist state?

**How to avoid:**
- Default-deny: new endpoints are NOT in the allowlist until explicitly added via the UI. Never fail open.
- Match on a stable endpoint identifier (e.g., `admin.users.list`), not the URL path. URL paths change; identifiers are stable.
- Validate the allowlist on startup: if an allowlist entry references a non-existent endpoint, log a warning (stale entry). If an endpoint exists without an allowlist entry, it's automatically denied.
- Write tests: for every admin API endpoint, assert it returns 403 when not in the allowlist.

**Warning signs:**
- The allowlist table has entries that don't correspond to any existing endpoint (stale data).
- A new admin API endpoint works via the Claude Code API without anyone explicitly enabling it.
- No tests for the allowlist middleware.

**Phase to address:** Phase 3 (Claude Code API). The allowlist design is Phase 3's most security-critical component.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Polling BullMQ every 2s instead of using built-in metrics | Simpler code, real-time feel | Redis overhead scales with open dashboard tabs | Never -- use built-in metrics + 10s polling from day one |
| Raw `request_events` queries for charts | No pre-aggregation code needed | Sequential scans on a fast-growing table | Acceptable in Phase 2 MVP if table is <100K rows, but build rollups before production traffic |
| Single API key for all Claude Code access | Fast to implement, one env var | No rotation, no per-key scoping, no audit granularity | Phase 3 MVP only -- add rotation + hashing before going live |
| Storing admin sessions in memory | Zero-dependency auth, works immediately | Lost on redeploy, blocks horizontal scaling | Current scaffold only -- move to Redis/DB before building real features |
| `SELECT *` on job data for the monitoring UI | Shows all job fields without mapping | Fetches large AI prompt/response payloads into dashboard memory | Never -- BullMQ job data can be huge (AI prompts). Always select specific fields or use `getJobCounts()` instead of `getJobs()` |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| BullMQ Queue instance in admin app | Creating a Queue with the same connection config as the worker -- the admin's Queue instance interferes with the worker (event listeners, job lifecycle hooks) | Create a read-only Queue instance: same queue name, but never add workers or process jobs from the admin app. Use `QueueEvents` for listening without side effects |
| Prometheus metrics endpoint | Fetching `/metrics` from the main API on every dashboard page load, parsing the text format in JavaScript | Fetch `/api/metrics/summary` (JSON) instead. The Prometheus text format is for Prometheus scrapers, not for dashboards. The existing JSON endpoint already aggregates the data you need |
| Redis direct access from admin | Using the main API's Redis connection string to read queue state, which shares the connection pool with BullMQ workers | Create a separate Redis connection (Bun `RedisClient`) in the admin app for read-only monitoring. BullMQ recommends separate connections for Queue and Worker -- monitoring should be a third |
| PostgreSQL aggregate queries | Using the Drizzle relational API (`findMany` with `with`) for analytics queries that need GROUP BY, COUNT, date truncation | Use the Drizzle query builder (`db.select().from()`) with `sql` for aggregates. Relational API generates N+1-style queries for aggregations it can't express |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full job data fetch for monitoring | Dashboard takes 5+ seconds to load failed jobs tab | Use `getJobCounts()` for overview, paginate `getJobs()` with `start`/`end` params (max 20 per page) | >100 failed jobs with large AI prompt payloads (~10KB each) |
| Unindexed time-range queries on `request_events` | Dashboard latency charts take >3 seconds | Add `CREATE INDEX idx_request_events_ts ON request_events (timestamp DESC)` and always include `WHERE timestamp > NOW() - interval` | >100K rows (roughly 1 week of moderate traffic) |
| Real-time event stream via SSE without backpressure | Browser tab memory grows unbounded as events accumulate | Cap the client-side event buffer (last 500 events). Implement server-side throttling: batch events into 1-second windows | >1000 events/minute (during AI batch processing or location scatter) |
| Dashboard chart rendering with raw data points | Charts become sluggish with >10K data points | Pre-bucket data server-side (1-minute or 5-minute buckets). Never send raw per-request data to the frontend | >10K data points on any single chart (a few hours of traffic) |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Admin API returns full user records including OAuth tokens | Token leak via admin dashboard or Claude Code API response | Create admin-specific DTOs that strip `accessToken`, `refreshToken`, hashed passwords. Never reuse user-facing API response shapes for admin |
| API key transmitted in query string (`?key=xxx`) | Key appears in access logs, browser history, Referer headers | Always send the API key in the `Authorization: Bearer <key>` header. Reject requests with key in query params |
| Admin dashboard CORS allows `*` for API routes | Any website can make authenticated requests to admin API if user has session cookie | Set CORS origin to `admin.blisko.app` only. API key endpoints don't need CORS at all (server-to-server) |
| Allowlist bypass via path traversal | `../api/users` might bypass `/api/admin/users` check | Normalize paths before allowlist comparison. Use an explicit route registry, not path string matching |
| Job retry exposes original job data to admin UI | Failed jobs may contain user PII in their payload (bio, looking_for, display_name) | Redact PII fields from job data before displaying in the admin UI. Show job metadata (type, timestamps, error message) but not full payload |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Auto-refreshing dashboard flickers on every data fetch | Admin loses context, can't read error messages mid-refresh | Use optimistic UI: keep showing stale data while fetching, then diff-update. Never clear and re-render the entire dashboard |
| Error counts without context | "47 failed jobs" is meaningless without knowing if that's 47 out of 50 or 47 out of 50,000 | Always show error rate (percentage) alongside absolute counts. Add trend indicator (up/down vs. previous period) |
| Queue monitoring shows all job types mixed together | Can't distinguish between a spike in `analyze-pair` failures vs. `hard-delete-user` failures | Group stats by job type (the `type` field in job data). Show per-type failure rates. The current queue has 10+ job types -- they behave very differently |
| Showing raw error stack traces as the primary failure info | Stack traces are developer artifacts, not operational signals | Show the error message first, with a collapsible stack trace. Categorize errors: "AI provider timeout," "DB constraint violation," "rate limit hit" |
| No "time ago" context on data | "Last job completed at 14:32:07" requires mental math | Show relative time ("2 min ago") with absolute time on hover. Highlight stale data: if no job has completed in >5 minutes, show a warning |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **BullMQ monitoring:** Shows job counts but doesn't track `stalled` jobs -- stalled jobs are silently re-queued and can cause duplicate AI processing (and duplicate API costs). Verify `queue.getJobCounts()` includes `stalled` state.
- [ ] **Telemetry charts:** Charts render but time zones aren't handled -- all timestamps are UTC from PostgreSQL, but the admin is in Warsaw (CET/CEST, UTC+1/+2). Display times in the admin's local timezone.
- [ ] **API key auth:** Auth works but there's no rate limiting on auth failures -- an attacker can brute-force the API key. Add exponential backoff after 5 failed attempts from the same IP.
- [ ] **Allowlist toggles:** UI toggles work but there's no startup validation -- if an endpoint is renamed in code, the allowlist entry becomes a dangling reference that neither blocks nor allows anything. Add validation on boot.
- [ ] **Job retry button:** Retrying works but the original job's `attempts` counter isn't reset -- the retried job may immediately hit the max attempts limit and fail again. Use `job.retry()` which resets the counter, not `queue.add()` with the same data.
- [ ] **Real-time event stream:** Events flow but there's no reconnection logic -- if the SSE connection drops (network blip, Railway restart), the admin sees a frozen dashboard with no error indicator. Implement auto-reconnect with a visible "reconnecting..." banner.
- [ ] **Claude Code skill generation:** Skill file is generated but doesn't include error response schemas -- Claude Code can't distinguish between "endpoint not in allowlist" (403) and "resource not found" (404), leading to wrong retry behavior.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Connection pool exhaustion | LOW | Restart admin app with lower `max` setting. No data loss. Main API auto-recovers when connections free up |
| Redis memory spike from monitoring | LOW | Stop the admin dashboard (close browser tab or kill admin service). Redis memory recovers as monitoring queries stop. Increase poll interval in config |
| Accidental queue drain | HIGH | Lost jobs cannot be recovered from BullMQ. Must re-trigger the operations that created those jobs (re-analyze pairs, re-process profiles). May require running scatter scripts |
| API key compromise | MEDIUM | Rotate the key immediately (generate new, invalidate old). Audit all admin API requests from the compromised key's `last_used_at` onward. Check for data exfiltration |
| Dashboard queries degrading main API | MEDIUM | Kill the admin app's database connections. Add missing indexes. Implement query timeouts (`statement_timeout` in postgres-js config). Deploy pre-aggregation tables |
| Allowlist bypass | HIGH | Revoke the API key immediately. Audit all requests made through the Claude Code API. Fix the allowlist matching logic. Add integration tests before re-enabling |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Connection pool exhaustion | Phase 1 (DB setup) | Admin app postgres config has explicit `max: 3`. Aggregate connection count documented |
| Redis polling overhead | Phase 1 (BullMQ monitoring) | Polling interval is >= 10s. Uses `getMetrics()` over repeated `getJobs()`. Server-side caching in place |
| Destructive operations without gates | Phase 1 (BullMQ monitoring) | Every write/destructive button has a confirmation step. Operation tiers documented |
| API key security | Phase 3 (Claude Code API) | Key is hashed in DB. `last_used_at` tracked. Rate limiting on key auth failures |
| Telemetry query performance | Phase 2 (Ops dashboards) | All dashboard queries use time-bounded index scans. Pre-aggregation for windows > 1 hour |
| In-memory session loss | Phase 1 (foundation) | Sessions stored in Redis or PostgreSQL. Admin stays logged in across deploys |
| Allowlist bypass | Phase 3 (Claude Code API) | Default-deny verified. Integration tests for every endpoint's allowlist behavior. Startup validation of allowlist entries |
| PII in admin responses | Phase 1 (foundation) | Admin DTOs defined separately from user-facing types. OAuth tokens never appear in admin responses |
| Stalled job blindness | Phase 1 (BullMQ monitoring) | Dashboard shows stalled job count. Alert when stalled > 0 for > 5 minutes |
| Event stream memory leak | Phase 2 (real-time) | Client-side buffer cap (500 events). Reconnection logic with visible status indicator |

## Sources

- [BullMQ Going to Production](https://docs.bullmq.io/guide/going-to-production) -- Redis maxmemory-policy, graceful shutdown, connection management
- [BullMQ Metrics](https://docs.bullmq.io/guide/metrics) -- Built-in per-minute aggregation, memory overhead (~120KB/queue)
- [BullMQ Removing Jobs](https://docs.bullmq.io/guide/queues/removing-jobs) -- obliterate/drain behavior and risks
- [BullMQ Auto-removal](https://docs.bullmq.io/guide/queues/auto-removal-of-jobs) -- removeOnComplete/removeOnFail memory implications
- [Avoiding Redis Crashes with BullMQ](https://dev.to/lbd/avoiding-redis-crashes-with-bullmq-memory-monitoring-basics-2848) -- Redis memory monitoring patterns
- [Connection Pool Exhaustion](https://furkanbaytekin.dev/blogs/connection-pool-exhaustion-what-it-is-and-how-to-avoid-it) -- Multi-app database connection management
- [API Keys Guide 2025](https://dev.to/hamd_writer_8c77d9c88c188/api-keys-the-complete-2025-guide-to-security-management-and-best-practices-3980) -- Key storage, rotation, scoping best practices
- [WebSocket vs SSE vs Polling](https://potapov.me/en/make/websocket-sse-longpolling-realtime) -- SSE recommended for dashboards; heartbeat and reconnection requirements
- Blisko codebase: `apps/api/src/services/queue.ts` (1321 lines, 10 job types), `apps/admin/src/lib/auth.ts` (in-memory sessions), `apps/api/src/services/metrics.ts` (buffer management), `apps/api/src/db/index.ts` (connection config without explicit pool size)

---
*Pitfalls research for: Blisko Admin Dashboard*
*Researched: 2026-03-26*
