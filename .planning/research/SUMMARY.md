# Project Research Summary

**Project:** Blisko Admin Dashboard — Charting, Real-time, BullMQ Monitoring, API Keys
**Domain:** Internal operational admin dashboard for a social proximity app backend
**Researched:** 2026-03-26
**Confidence:** HIGH

## Executive Summary

The Blisko admin dashboard is primarily a **frontend for data that already exists** — the API already computes metrics summaries, exposes BullMQ queue state, and publishes real-time events to Redis pub/sub. The core work is plumbing connections (Drizzle, Bun RedisClient, BullMQ Queue class) into a TanStack Start server-side layer, then rendering the data in a human-readable dashboard and a programmatic API for Claude Code. Research confirms the existing admin app scaffold (OTP auth, TanStack Start, Tailwind) is the right base — no framework changes are needed.

The recommended approach is a shared data layer (`~/lib/data/`) consumed by both SSR dashboard pages and file-based API routes, with auth enforced at the edge via separate mechanisms: OTP sessions for humans and a static API key with allowlist for Claude Code. Real-time streaming uses SSE (not WebSocket), subscribing read-only to the existing `ws-events` Redis pub/sub channel so no changes to the main API are required. Six new production dependencies cover all requirements: recharts (charts), bullmq (queue inspection), @bull-board/api + @bull-board/h3 (queue debug UI), drizzle-orm, and postgres.

The critical risks are infrastructure-level: the admin app shares the same PostgreSQL and Redis instances as the main API, so misconfiguring the connection pool (default 10 connections) or hammering BullMQ with aggressive polling will degrade user-facing features in production. The in-memory session store (already present in the scaffold) must be moved to Redis or PostgreSQL before building real features on top of it — it loses all sessions on every Railway deploy. Every write and destructive operation (retry jobs, drain queue) must go through confirmation gates from day one, because the Claude Code programmatic API removes the human hesitation that normally prevents accidents.

## Key Findings

### Recommended Stack

The stack is almost entirely extensions of what already exists in the monorepo — not new choices. Recharts 3.x (released March 2026) is the consensus React charting library, used directly with Tailwind CSS rather than abstracted through shadcn/ui or Tremor which would require bootstrapping their full component systems. Real-time data flows via Server-Sent Events using native browser `EventSource` and TanStack Start server routes returning `ReadableStream` — no library needed. BullMQ queue inspection uses the existing BullMQ `Queue` class getter API (`getJobCounts`, `getJobs`) with an optional bull-board h3 UI embedded at a sub-path. API key auth is ~20-line custom middleware using `crypto.timingSafeEqual` — no auth library adds value for a single-consumer machine-to-machine API.

**Core technologies:**
- Recharts 3.8.0: SVG-based React charts — composable API, tree-shakable, largest React charting ecosystem, no abstraction layer needed
- SSE (web standard): server-to-client real-time streaming — auto-reconnects, simpler than WebSocket for read-only admin feeds
- BullMQ Queue API (existing 5.69.2): `getJobCounts` / `getJobs` for queue inspection — already a monorepo dependency
- @bull-board/h3 6.20.6: embedded queue debug UI — polished retry/delete/inspect UI without building it from scratch
- Drizzle ORM (existing 0.45.1): PostgreSQL queries — imports schema from `apps/api/src/db/schema.ts` via workspace path
- Custom Bearer middleware: API key auth for Claude Code — `crypto.timingSafeEqual`, SHA-256 hash stored in Railway env var

### Expected Features

The dashboard has strong MVP clarity. Most high-value features require minimal new code because data infrastructure already exists (`getMetricsSummary()`, `getWsStats()`, `queue.getJobCounts()`). The main effort is building the frontend views, not creating data pipelines.

**Must have (table stakes):**
- BullMQ queue overview (job counts by state, recent failures, per-type breakdown) — replaces CLI queue-monitor
- Job inspection and retry — the primary reason an admin opens a queue dashboard
- Ops health overview (error rate, p50/p95/p99 latency, throughput) — surfaces existing `getMetricsSummary()` data
- SLO breach display — surfaces existing `checkSloBreaches()` data as red/green indicators
- Slowest endpoints and top errors ranking — surfaces existing `getSlowestEndpoints()` / `getTopErrors()` data
- User lookup (by email/name/ID, with profile, auth providers, wave/conversation counts) — essential for production debugging
- WebSocket status (active connections, subscriptions, auth attempts) — surfaces existing `getWsStats()` data
- API key auth for Claude Code — static Bearer token, constant-time comparison

**Should have (differentiators):**
- Queue pause/resume — emergency brake for runaway AI jobs hitting OpenAI billing; low complexity, high value
- Real-time event stream via SSE — subscribes to existing `ws-events` Redis channel, zero API changes needed
- Time-series charts — latency/error trends with time windows; needs date-bucketed queries but has the data
- Product metrics dashboard — signups, DAU, wave ratios, all derivable from existing tables
- Endpoint allowlist UI for Claude Code — toggles which API endpoints the programmatic API can call
- Feature gates management — CRUD on existing `feature_gates` table, already has schema

**Defer (v2+):**
- In-panel alerting with custom rules — build after SLO breach display and time-series charts are stable
- User activity timeline — lower priority than user lookup; add as detail view later
- Claude Code auto-skill generation — depends on allowlist being stable
- Chatbot status and control — low operational urgency, nice-to-have

### Architecture Approach

The architecture is a single TanStack Start server serving two audiences through a shared data layer: human admins via SSR dashboard pages (OTP session auth) and Claude Code via JSON API routes (API key auth). All database, Redis, and BullMQ queries live in `~/lib/data/` — dashboard server functions and API routes import from the same functions, preventing duplication. Auth is enforced at the edge (TanStack Router `beforeLoad` for dashboard, `validateApiKey` guard for API routes). The allowlist (which endpoints Claude Code can call) is stored in a new `admin_api_allowlist` table, cached in memory, and defaults to deny for new endpoints.

**Major components:**
1. Dashboard Pages (`/dashboard/*`) — SSR pages for human admins; consume server functions from data layer
2. Admin API Routes (`/api/v1/*`) — JSON endpoints for Claude Code; enforce API key + allowlist before calling data layer
3. Data Layer (`~/lib/data/`) — shared plain async functions for DB/Redis/BullMQ; single source of truth for all queries
4. API Key Auth (`~/lib/api-auth.ts`) — Bearer token validation against hashed env var; ~20 lines
5. Allowlist (`~/lib/allowlist.ts`) — DB-backed endpoint permission system with in-memory cache; default-deny
6. SSE Bridge (`/api/events`) — subscribes to existing Redis `ws-events` channel, streams to dashboard via `EventSource`

### Critical Pitfalls

1. **Connection pool exhaustion** — admin app adds a second Drizzle pool to the same PostgreSQL Railway uses for the main API (97 connection limit). Fix: set `postgres(url, { max: 3 })` in admin's `db.ts` during Phase 1. Document the connection budget.

2. **BullMQ polling hammers Redis** — `getJobCounts()` and `getJobs()` each execute multiple Redis commands. At 2-second intervals with multiple open tabs, monitoring competes with job workers. Fix: poll no faster than 10s, use BullMQ's built-in `getMetrics()` for pre-aggregated counters, cache results server-side.

3. **In-memory sessions lost on redeploy** — existing admin scaffold stores OTP sessions in a `Map`. Railway auto-deploys on every push, logging out the admin. Fix: migrate session storage to Redis (`SETEX` with TTL) or a PostgreSQL `sessions` table in Phase 1 before building real features.

4. **Destructive operations without confirmation gates** — `queue.obliterate()`, mass retry, and user deletion have large blast radii. Claude Code calling these in a loop would be catastrophic. Fix: classify all operations into read/write/destructive tiers from Phase 1. Allowlist must default to read-only; write endpoints require explicit opt-in.

5. **Telemetry queries killing the database** — aggregate queries on `request_events` (an append-only table growing by ~500K rows/day at moderate traffic) default to sequential scans. Fix: ensure time-partitioned index on `timestamp` exists before building any charts; pre-aggregate metrics into hourly rollup tables before Phase 2 goes to production.

## Implications for Roadmap

Based on combined research, four phases map cleanly to the dependency chains and pitfall prevention timeline.

### Phase 1: Foundation and Operational Visibility

**Rationale:** Infrastructure primitives must be correct before anything else is built on them. Connection pool sizing (Pitfall 1), session persistence (Pitfall 3), and operation tiers (Pitfall 3) are all Phase 1 concerns that silently corrupt later phases if missed. The highest-value user-visible feature — queue monitoring — also belongs here because it directly replaces the CLI queue-monitor and requires no charting library.

**Delivers:** Working database and Redis connections with correct pool sizing; persistent admin sessions (Redis or DB-backed); BullMQ queue overview with job inspection and retry (confirmation-gated); ops health overview cards (error rate, p95, SLO breaches); user lookup; WebSocket status card; API key auth middleware.

**Features from FEATURES.md:** BullMQ queue overview, job inspection, retry/clean, ops health overview, SLO breach display, slowest endpoints, top errors, user lookup, WebSocket status, API key auth.

**Avoids:** Connection pool exhaustion (explicit `max: 3`), in-memory session loss (move to Redis), destructive operations without gates (confirm tier from day one), PII leaking in admin DTOs.

### Phase 2: Monitoring Depth and Real-Time

**Rationale:** Time-series charts and the SSE event stream depend on Phase 1's data layer and stable DB/Redis connections. Charts need pre-aggregated queries (not raw `request_events` scans) — the schema work for rollup tables must happen before building chart UI. The SSE bridge is low-risk (reads existing Redis channel, no API changes) but higher complexity than the Phase 1 cards.

**Delivers:** Time-series latency/error/throughput charts with windowed queries; queue pause/resume button; job promote (delayed → waiting); real-time event stream via SSE; product metrics dashboard (signups, DAU, wave ratios); `metrics_hourly` rollup table seeded by cron.

**Features from FEATURES.md:** Time-series charts, queue pause/resume, job promote, real-time event stream, product metrics dashboard.

**Uses from STACK.md:** Recharts 3.8.0 for area/line/bar/composed charts; SSE via TanStack Start server routes + native `EventSource`; `getMetrics('completed'/'failed')` for pre-aggregated BullMQ counters.

**Avoids:** Telemetry queries killing the database (rollup tables, time-bounded indexes, `EXPLAIN ANALYZE` on every query), Redis polling overhead (10s poll + server-side cache), event stream memory leak (500-event client buffer, heartbeat, reconnect banner).

### Phase 3: Claude Code API and Allowlist

**Rationale:** The programmatic API depends on Phase 1 (API key auth) and benefits from Phase 2's stable data layer before exposing it programmatically. Allowlist UI depends on the API routes existing. The key security requirements (hashed key, rotation support, default-deny allowlist, startup validation) must be in place before the API is handed to Claude Code.

**Delivers:** Full `/api/v1/*` API route structure with `withApiAuth` helper; allowlist table migration and management UI; API key stored hashed in DB with `last_used_at` tracking; rate limiting on auth failures; feature gates management UI; allowlist startup validation; Claude Code skill file generation at well-known URL.

**Features from FEATURES.md:** Endpoint allowlist UI, Claude Code auto-skill, feature gates management.

**Avoids:** API key security gaps (hash in DB not env var plaintext, rotation mechanism, rate-limit on failures), allowlist bypass via default-deny + startup validation + integration tests, API key in query string.

### Phase 4: Polish and Advanced Features

**Rationale:** In-panel alerting, user activity timeline, chatbot status, and seed user management are high-value but have no blocking dependencies in earlier phases. They are cleanest to build once the core dashboard is stable and the data layer is proven.

**Delivers:** In-panel alerting for SLO breaches and queue depth thresholds; user activity timeline (API calls, waves, messages by user); chatbot status and control panel; seed user management (scatter triggers, distribution view); audit log for admin write operations.

**Features from FEATURES.md:** In-panel alerting, user activity timeline, chatbot status, seed user management, audit log.

### Phase Ordering Rationale

- Phases follow the FEATURES.md dependency chain exactly: BullMQ overview → retry/clean → pause/resume; ops overview → charts → alerting; API key auth → allowlist UI → auto-skill.
- Phase 1 is larger than typical first phases because three pitfall-prevention items (connection sizing, session persistence, operation tiers) have no visible deliverable but corrupt everything built after them if skipped.
- Phase 2 front-loads the schema work (rollup tables) that prevents Phase 2 charts from becoming Pitfall 5 (telemetry queries killing the database).
- Phase 3 separates the Claude Code API from the human dashboard deliberately — the API must be secured completely before Claude Code is given the key.
- Phase 4 is explicitly unbounded; all items are additive and can be reprioritized.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Time-series chart queries — `request_events` table schema and existing indexes need inspection before designing rollup tables. Check `apps/api/src/services/metrics.ts` buffer behavior and existing `request_events` indexes via `EXPLAIN ANALYZE` before committing to rollup strategy.
- **Phase 3:** bull-board h3 adapter integration — MEDIUM confidence on the TanStack Start / Nitro h3 adapter embedding pattern. Verify `@bull-board/h3` mounts correctly inside a `createFileRoute` server handler before committing to it.

Phases with standard patterns (skip research-phase):
- **Phase 1:** All patterns are HIGH confidence. Drizzle setup mirrors existing API pattern. BullMQ Queue getter API is stable and well-documented. SSE implementation is a web standard.
- **Phase 4:** All features are additive UX work on top of proven data layer. No new infrastructure patterns needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified via npm, official docs, and existing monorepo patterns. CVE-2026-33128 (h3 SSE injection) identified and mitigated via TanStack Start route handlers. |
| Features | HIGH | Grounded in codebase analysis — most "features" are frontends for already-working backend data. Priorities confirmed against existing CLI tools (queue-monitor, chatbot-monitor). |
| Architecture | HIGH | Patterns derived from existing `apps/admin/src/` code and TanStack Start official docs. Shared data layer pattern is well-established. Relative schema import caveat noted (Dockerfile build stage). |
| Pitfalls | HIGH | Grounded in production codebase analysis (explicit `apps/admin/src/lib/auth.ts` in-memory session issue, `apps/api/src/db/index.ts` missing explicit pool size). BullMQ docs confirm polling overhead and stalled job behavior. |

**Overall confidence:** HIGH

### Gaps to Address

- **Schema import in Dockerfile:** The admin Dockerfile copies `apps/api/package.json` but may not include `apps/api/src/db/schema.ts`. Verify the build stage before or during Phase 1 implementation. Consider extracting schema to `packages/db/` if the relative import causes build failures.
- **`request_events` index status:** Research assumes a timestamp index exists or will be needed. Verify with `\d request_events` in psql before designing Phase 2 rollup tables. If an index already exists, the rollup urgency decreases.
- **`ws-events` Redis channel event schema:** SSE bridge subscribes to the existing `ws-events` channel. Verify the event payload format by inspecting `apps/api/src/services/redis-bridge.ts` `publishEvent` calls before building the dashboard event feed parser.
- **Railway PostgreSQL `max_connections`:** Research cites 97 as the Railway default. Confirm via `SHOW max_connections` in production psql before finalizing Phase 1 connection budgets.

## Sources

### Primary (HIGH confidence)
- Recharts npm (3.8.0, published March 6, 2026) and GitHub releases — charting library selection
- BullMQ Job Getters docs — `getJobCounts`, `getJobs`, `getMetrics` API surface
- TanStack Start Server Routes and Server Functions docs — SSE pattern, `createServerFn`, file-based API routes
- h3 CVE-2026-33128 advisory — SSE injection fix in rc.15, confirmed patched in TanStack Start
- BullMQ Going to Production docs — Redis `maxmemory-policy`, connection management
- BullMQ Metrics docs — pre-aggregated per-minute counters, memory overhead
- Blisko codebase (direct review): `apps/admin/src/lib/auth.ts`, `apps/api/src/services/queue.ts`, `apps/api/src/services/metrics-summary.ts`, `apps/api/src/services/redis-bridge.ts`, `packages/dev-cli/src/queue-monitor.ts`

### Secondary (MEDIUM confidence)
- Nitro SSE / h3 event streams GitHub issues — SSE pattern via community examples, not official docs
- @bull-board/h3 npm (6.20.6, published days ago) — h3 adapter for TanStack Start embedding
- LogRocket React chart libraries 2025 and Embeddable comparison — Recharts ecosystem position

### Tertiary (LOW confidence)
- Connection pool exhaustion article — general principle applied to Railway-specific connection limits; validate with `SHOW max_connections` in production

---
*Research completed: 2026-03-26*
*Ready for roadmap: yes*
