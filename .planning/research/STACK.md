# Technology Stack

**Project:** Blisko Admin Dashboard — Charting, Real-time, BullMQ Monitoring, API Keys
**Researched:** 2026-03-26

## Recommended Stack

### Charting & Visualization

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Recharts | ^3.8.0 | Line, area, bar charts for metrics dashboards | React-native composable API, tree-shakable, SVG-based. Largest React charting ecosystem (24.8K GitHub stars). Actively maintained — 3.8.0 released March 6, 2026. Declarative JSX components align with the rest of the codebase. No wrapper abstraction — direct Recharts components mean no lock-in to a higher-level framework like Tremor or shadcn/ui charts. |

**Confidence: HIGH** — Recharts 3.x is the consensus pick for React admin dashboards in 2025-2026. Verified via npm (3.8.0 published 18 days ago), multiple comparison articles, and community adoption.

**Approach:** Use Recharts directly with Tailwind CSS for container styling. Do NOT use shadcn/ui chart wrappers or Tremor — they add abstraction layers that make it harder to customize chart internals (tooltips, axes, custom shapes) and would require bootstrapping the entire shadcn/ui system (Radix, CSS variables, component registry) into the admin app which currently runs plain Tailwind. Recharts + Tailwind is sufficient and keeps the dependency surface small.

Chart types needed:
- **Area charts** — latency percentiles over time (p50, p95, p99)
- **Bar charts** — request counts by endpoint, job counts by queue/status
- **Line charts** — error rates, throughput trends
- **Composed charts** — overlay error rate on request volume

### Real-time Data Streaming

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Server-Sent Events (SSE) | Web standard | Server-to-client event streaming for live dashboards | One-directional (server pushes to client), auto-reconnect built into `EventSource` API, works through proxies/CDNs. Simpler than WebSocket for read-only admin feeds. No library needed — native browser API + standard `ReadableStream` on server. |
| TanStack Start server routes | (existing) | SSE endpoint implementation | Admin already uses TanStack Start with `createFileRoute` server handlers. SSE endpoints are standard GET handlers returning a `Response` with a `ReadableStream` body. No additional framework needed. |

**Confidence: HIGH** — SSE is a web standard, TanStack Start server routes support returning streaming Response objects natively. The `h3-v2` version (2.0.1-rc.16) used by `@tanstack/start-server-core` includes the SSE injection fix (CVE-2026-33128, fixed in rc.15).

**Implementation pattern:**
```typescript
// routes/api/events.ts — SSE endpoint
export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            const push = (event: string, data: unknown) => {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };
            // Subscribe to Redis pub/sub or poll metrics
            // Clean up on client disconnect
            request.signal.addEventListener("abort", () => { /* cleanup */ });
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
```

**Client-side:** Native `EventSource` API. No library needed. For React integration, a simple `useEventSource` hook wrapping `EventSource` with cleanup on unmount.

**Why NOT WebSocket:** The admin already has WebSocket infrastructure in the main API (for mobile real-time). But admin dashboard is read-only streaming — SSE is simpler, auto-reconnects, and doesn't require a separate WS server in the admin app. WebSocket would be overkill.

### BullMQ Monitoring

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| BullMQ (direct Queue API) | 5.69.2 (existing) | `getJobCounts()`, `getJobs()` for queue inspection | Already a dependency in the monorepo. The `Queue` class provides `getJobCounts('wait', 'active', 'completed', 'failed', 'delayed')` and `getJobs(['failed'], 0, 100)` for paginated job listing. No additional library needed for programmatic access. |
| `@bull-board/h3` + `@bull-board/api` | ^6.20.6 | Optional: embedded bull-board UI at `/admin/queues` | H3 adapter exists for Nitro-based apps. Provides polished queue inspector UI with retry/delete/promote actions out of the box. Latest: 6.20.6 (published 6 days ago). |

**Confidence: HIGH** — BullMQ's `Queue` class getter API is stable and well-documented. bull-board h3 adapter is actively maintained.

**Recommended approach — two layers:**

1. **Custom dashboard cards** using BullMQ's `Queue.getJobCounts()` directly. The admin app connects to the same Redis as the API. Create a TanStack Start server handler that instantiates a read-only `Queue` and returns job counts + recent failed jobs. Display as cards/charts in the custom dashboard.

2. **bull-board as escape hatch** — embed `@bull-board/h3` at a sub-path (e.g., `/admin/queues`) for detailed job inspection, retry, and debugging. This gives a full-featured queue UI without building it from scratch. Protected behind the existing OTP session auth.

**Why NOT bull-board alone:** bull-board provides a standalone UI, not embeddable chart data for a unified dashboard. The custom dashboard cards integrate queue health into the overall admin view alongside latency charts and user metrics. bull-board supplements for deep-dive debugging.

**BullMQ Queue API surface (relevant methods):**
- `queue.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed')` — returns `{ wait: number, active: number, ... }`
- `queue.getJobs(['failed'], start, end, asc)` — paginated job listing by status
- `queue.getJobLogs(jobId)` — logs for a specific job
- Supported states: `completed`, `failed`, `delayed`, `active`, `wait`, `waiting-children`, `prioritized`, `paused`, `repeat`

### API Key Authentication (Claude Code Programmatic Access)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Custom middleware (no library) | N/A | API key validation for programmatic endpoints | Simple `Authorization: Bearer <key>` check against hashed key stored in Railway env var. The admin app already has custom auth (OTP + session store in memory). Adding an API key check is a ~20-line middleware. No library needed — `crypto.timingSafeEqual` for comparison, SHA-256 hash stored server-side. |

**Confidence: HIGH** — API key auth for internal/admin APIs is a solved pattern. No library adds value over a simple middleware.

**Design:**
- API key generated once, stored as `ADMIN_API_KEY_HASH` (SHA-256) in Railway env vars
- The raw key is given to Claude Code via environment or `.claude/CLAUDE.md`
- Admin API routes under `/api/admin/*` check `Authorization: Bearer <key>` header
- Timing-safe comparison using `crypto.timingSafeEqual`
- Rate limiting reuses the existing `checkRateLimit` utility from `~/lib/rate-limit`
- Allowlist state: which endpoints Claude Code can access, persisted in DB (a simple table: `admin_api_allowlist` with `endpoint` + `enabled` columns)

**Why NOT OAuth/JWT:** This is a single-client API (Claude Code). OAuth adds complexity for zero benefit. JWT's statelessness provides no advantage when there's one consumer and revocation is done by rotating the env var.

### Database Access

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Drizzle ORM | 0.45.1 (existing) | Query PostgreSQL for metrics, user data, queue stats | Already the ORM across the monorepo. Admin app imports schema from `apps/api/src/db/schema.ts` via workspace. Direct DB connection using same `DATABASE_URL`. |
| `postgres` | 3.4.0 (existing) | PostgreSQL client driver | Already used by the API. Admin app needs its own connection pool. |

**Confidence: HIGH** — Existing stack, no new dependencies.

**Note:** The admin app currently has NO database connection. Adding Drizzle requires:
1. Add `drizzle-orm` and `postgres` as dependencies in `apps/admin/package.json`
2. Create `apps/admin/src/lib/db.ts` mirroring the API's pattern
3. Use the same `DATABASE_URL` env var (already available on Railway)

### Redis Access

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Bun RedisClient | Built-in | Redis pub/sub for SSE events, BullMQ queue reads | Per project rules (`infra/bun-redis`), use Bun's native `RedisClient`. Already used in the API. Admin subscribes to the same Redis for real-time events. |
| BullMQ Queue (read-only) | 5.69.2 (existing) | Queue inspection via ioredis (BullMQ's internal dep) | BullMQ's `Queue` class needs ioredis connection config. ioredis is already bundled as BullMQ's dependency — no new install, just import `Queue` from `bullmq`. |

**Confidence: HIGH** — Existing patterns from the API codebase.

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | 0.561.0 (existing) | Icons for dashboard UI | Already in the monorepo. Status icons, navigation, action buttons. |

**Date formatting:** Use `Intl.DateTimeFormat` (built-in) and Recharts' `tickFormatter` prop for chart axis labels. No date library needed — the admin dashboard formats timestamps and relative times, which `Intl` handles natively. The monorepo has no date library, and adding one for chart labels is unnecessary.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Charting | Recharts 3.x | Tremor | Built on Recharts anyway. Adds Radix UI dependency. Tailwind component library overkill for an admin dashboard that already has its own styling patterns. High-level API hides chart internals needed for custom metric visualizations. |
| Charting | Recharts 3.x | shadcn/ui Charts | Copy-paste components — nice for prototyping but requires bootstrapping shadcn/ui infrastructure (CSS variables, component registry, Radix). The admin app uses plain Tailwind. Adding shadcn means committing to their conventions across the admin app. |
| Charting | Recharts 3.x | Chart.js (react-chartjs-2) | Canvas-based (not SVG), harder to style with Tailwind/CSS. React integration is a wrapper, not native React components. Tanner Linsley (TanStack) has moved away from it. |
| Charting | Recharts 3.x | Apache ECharts | Powerful but heavy. Imperative API doesn't match React's declarative model. Overkill for an admin dashboard with fewer than 10 chart types. |
| Charting | Recharts 3.x | Visx | Too low-level. Requires writing significant D3-style code for basic charts. Great for custom visualizations, but admin dashboard needs standard chart types fast. |
| Real-time | SSE | WebSocket | Overkill for one-directional server-to-admin streaming. Requires WebSocket server setup in admin app. SSE auto-reconnects, works through HTTP proxies. |
| Real-time | SSE | Polling (setInterval) | Works but wasteful. 1-second polling creates 3,600 requests/hour per open tab. SSE pushes only when data changes. |
| Queue UI | BullMQ API + bull-board | Taskforce.sh | Hosted SaaS, paid. Unnecessary when bull-board is free and self-hosted. |
| Queue UI | BullMQ API + bull-board | QueueDash | Smaller community, less maintained than bull-board. bull-board has 6.20.6 published days ago. |
| API Auth | Custom middleware | Passport.js | Massive dependency for a single-purpose API key check. Passport is designed for multi-strategy auth flows, not a Bearer token comparison. |
| API Auth | Custom middleware | Better Auth | Already used in main API for user auth. But admin API key is a different concern — it's machine-to-machine, not user sessions. Adding Better Auth would conflate two auth domains. |
| Date formatting | Intl.DateTimeFormat (built-in) | date-fns | Not in the monorepo. Adding a dependency for chart axis labels is unnecessary when `Intl.DateTimeFormat` and Recharts' `tickFormatter` handle it natively. |

## Dependencies to Add

```bash
# In apps/admin/
# Charting
bun add recharts

# BullMQ monitoring (read-only queue access + optional UI)
bun add bullmq @bull-board/api @bull-board/h3

# Database (same driver as API)
bun add drizzle-orm postgres
```

**No new dev dependencies needed** — TypeScript, Vite, React types are already present.

**Total new production dependencies: 6** (recharts, bullmq, @bull-board/api, @bull-board/h3, drizzle-orm, postgres). Of these, bullmq/drizzle-orm/postgres are already in the monorepo lockfile — just need adding to `apps/admin/package.json`.

**Zero-dep additions:** SSE (web standard), API key auth (custom middleware), date formatting (Intl built-in), icons (lucide-react already present), Redis (Bun built-in).

## Security Notes

- **h3 SSE vulnerability (CVE-2026-33128):** The `h3` version bundled with Nitro 3.0.0 is 2.0.1-rc.2, which is vulnerable to SSE injection via unsanitized newlines. However, TanStack Start server routes use `@tanstack/start-server-core` which depends on `h3-v2` at 2.0.1-rc.16 (patched). SSE endpoints implemented via TanStack Start's `createFileRoute` server handlers use the patched h3. Avoid implementing SSE via raw Nitro event handlers until Nitro updates its h3 dependency.

- **API key storage:** Hash the key with SHA-256 before storing in env vars. The raw key is only known to the admin and Claude Code. Use `crypto.timingSafeEqual` for comparison to prevent timing attacks.

- **Database connection from admin:** Same credentials as the API. No separate DB user needed — both services run in the same Railway project with the same `DATABASE_URL`.

- **bull-board auth:** The h3 adapter must be wrapped with session auth middleware so it is not publicly accessible. Verify session cookie before serving bull-board routes.

## Sources

- [Recharts npm](https://www.npmjs.com/package/recharts) — version 3.8.0, published March 6, 2026
- [Recharts GitHub releases](https://github.com/recharts/recharts/releases) — active development cadence
- [bull-board GitHub](https://github.com/felixmosh/bull-board) — queue inspector, v6.20.6
- [@bull-board/h3 npm](https://www.npmjs.com/package/@bull-board/h3) — H3/Nitro adapter, v6.20.6
- [BullMQ Queue getters docs](https://docs.bullmq.io/guide/jobs/getters) — getJobCounts, getJobs API
- [TanStack Start server routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes) — SSE via standard Response + ReadableStream
- [h3 CVE-2026-33128](https://github.com/advisories/GHSA-22cc-p3c6-wpvm) — SSE injection fix in 2.0.1-rc.15
- [shadcn/ui TanStack Start installation](https://ui.shadcn.com/docs/installation/tanstack) — verified TanStack Start support exists but not recommended for this project
- [LogRocket React chart libraries 2025](https://blog.logrocket.com/best-react-chart-libraries-2025/) — ecosystem comparison
- [Embeddable React chart libraries comparison](https://embeddable.com/blog/react-chart-libraries) — Recharts vs alternatives
