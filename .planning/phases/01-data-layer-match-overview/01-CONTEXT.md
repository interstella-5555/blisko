# Phase 1: Data Layer & Match Overview - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire DB/Redis/BullMQ connections in the admin app and render the first real match monitoring screen with queue health, replacing the "Panel w budowie" placeholder. Admin logs into admin.blisko.app via Better Auth OTP and sees a dashboard with recent match analyses and queue state.

</domain>

<decisions>
## Implementation Decisions

### Shared Schema & Data Layer
- **D-01:** Extract Drizzle schema to `packages/db` as a shared workspace package. Both `apps/api` and `apps/admin` import from `@repo/db`.
- **D-02:** `@repo/db` exports a `createDb(config)` factory function. Each app creates its own Drizzle instance with its own pool size (`api`: default, `admin`: `max: 3`).
- **D-03:** API's query instrumentation (monkey-patched `client.unsafe` for per-request timing) stays in `apps/api/src/db/`. The `@repo/db` factory returns a clean, uninstrumented Drizzle instance. Admin doesn't need request-level query tracking.

### Authentication
- **D-04:** Replace the current custom OTP auth (`apps/admin/src/lib/auth.ts`) with Better Auth's OTP plugin — same mechanism used in the mobile app. Delete the custom auth code entirely.
- **D-05:** Sessions are DB-backed via Better Auth's session table — solves FOUN-05 (sessions surviving Railway redeploys) for free.
- **D-06:** Admin access controlled via `ADMIN_EMAILS` env var (existing pattern). After Better Auth login, check if the authenticated email is in the allowlist. No schema changes needed (no `isAdmin` column).
- **D-07:** Rebuild login page using Better Auth's OTP flow end-to-end, not just swapping the backend behind the existing UI.

### Match Overview Layout
- **D-08:** Match monitoring screen uses a paginated data table (25-50 rows, server-side pagination) showing recent match analyses. Columns: pair names, match score, status, timestamp. Chronological order (newest first), no filtering/sorting in Phase 1.
- **D-09:** Clicking a table row opens a slide-in Sheet panel from the right (shadcn Sheet component) — not expandable rows.
- **D-10:** Sheet panel shows full analysis details: both user names, match score with color coding, AI reasoning (short snippet + long description), profile hashes, and comprehensive telemetry.
- **D-11:** Telemetry in the sheet panel includes all BullMQ lifecycle data: enqueued timestamp, wait time, processing time, total duration, attempts count, job ID. For failed jobs: error message and stack trace.
- **D-12:** Add a `triggeredBy` field to job data in the API (e.g. `wave:send`, `profile:update`, `script:scatter`) so the sheet panel shows what triggered each analysis. This requires modifying `queue.add()` calls in `apps/api`.
- **D-13:** Queue health summary (waiting/active/completed/failed counts for analyze-pair jobs) displayed above the table. Auto-refreshes every 10-30 seconds via polling.
- **D-14:** UI components via shadcn/ui — Table, Sheet, Badge, and other primitives. Add shadcn/ui to the admin app.

### Navigation Structure
- **D-15:** Fixed left sidebar with dark/slate background, contrasting with light content area. Classic admin dashboard pattern.
- **D-16:** Sidebar shows the active "Matches" section plus disabled/greyed-out placeholders for future sections (Ops, Users, API). Gives a sense of what's coming without suggesting unimplemented features work.
- **D-17:** Sidebar includes user email and logout button at the bottom. Uses shadcn sidebar component.

### Claude's Discretion
- Exact polling interval for queue health (10s vs 30s — pick based on performance)
- shadcn/ui component selection beyond Table/Sheet/Badge (pick what fits)
- Page size for match table pagination (25 or 50)
- Exact sidebar section labels and icons

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Data Layer
- `apps/api/src/db/schema.ts` — Source of truth for all table definitions including `connectionAnalyses`
- `apps/api/src/db/index.ts` — Current Drizzle setup with query instrumentation (to be refactored)
- `apps/api/src/db/prepare.ts` — Prepared statement naming helpers

### Queue & Jobs
- `apps/api/src/services/queue.ts` — BullMQ queue setup, all job type definitions, worker handlers
- `apps/api/src/services/queue-metrics.ts` — Queue stats tracking (completed/failed counts, duration percentiles)
- `apps/api/src/services/ai.ts` — AI analysis functions called by queue worker

### Admin App (current state)
- `apps/admin/src/lib/auth.ts` — Current custom OTP auth (to be replaced with Better Auth)
- `apps/admin/src/lib/auth-session.ts` — Session lookup via server function (to be replaced)
- `apps/admin/src/routes/dashboard.tsx` — Current "Panel w budowie" placeholder (to be replaced)
- `apps/admin/src/routes/api/` — Existing Nitro API routes (logout, request-otp, verify-otp)
- `apps/admin/package.json` — Current dependencies (no shadcn, no drizzle, no bullmq yet)

### Auth Reference
- `apps/api/src/auth.ts` — Better Auth configuration in the main API (reference for admin setup)

### Architecture Docs
- `docs/architecture/instrumentation.md` — Metrics and observability design (request_events schema, Prometheus setup)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/api/src/db/schema.ts` — Full Drizzle schema with `connectionAnalyses` table (pairs, scores, snippets, timestamps, profile hashes)
- `apps/api/src/services/queue.ts` — BullMQ queue instance (`ai-jobs`) and all job type interfaces
- `apps/api/src/auth.ts` — Better Auth configuration (email OTP, session management)
- `apps/admin/src/lib/email.ts` — Resend email helper (can be reused for Better Auth OTP emails)
- `apps/admin/src/lib/rate-limit.ts` — Rate limiting helper (keep for API routes)

### Established Patterns
- Drizzle ORM with `postgres` driver — admin will use the same via `@repo/db`
- BullMQ for async jobs with `ioredis` connection config — admin uses read-only BullMQ `Queue` instance for job inspection
- Bun `RedisClient` for direct Redis operations (pub/sub, get/set) — admin uses this for Redis connection
- Better Auth OTP flow in mobile app — same flow will be used in admin
- Nitro API routes at `src/routes/api/` — admin's server-side endpoints

### Integration Points
- `apps/admin/` connects to the same PostgreSQL database as `apps/api/` (via `DATABASE_URL`)
- `apps/admin/` connects to the same Redis instance as `apps/api/` (via `REDIS_URL`)
- BullMQ `Queue` in admin reads from the same `ai-jobs` queue the API worker processes
- Better Auth shares the `session` and `user` tables with the main API
- `triggeredBy` field addition requires changes across `apps/api/src/services/queue.ts` and all `queue.add()` call sites

</code_context>

<specifics>
## Specific Ideas

- Sheet panel should maximize telemetry: full BullMQ lifecycle timing (enqueued → waiting → active → completed/failed), trigger source, attempts, errors with stack traces
- shadcn/ui for component library (user specifically mentioned shadcn's Sheet component)
- Dark sidebar with light content area — classic admin dashboard aesthetic
- Disabled sidebar placeholders for future sections to show roadmap progress

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-data-layer-match-overview*
*Context gathered: 2026-03-26*
