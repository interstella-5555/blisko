# Architecture Patterns

**Domain:** Admin dashboard for social proximity app backend
**Researched:** 2026-03-26

## Recommended Architecture

The admin dashboard is a TanStack Start app (Nitro server) that connects directly to the same PostgreSQL and Redis instances as the main API. It serves two audiences through a single server: human admins via SSR dashboard pages, and Claude Code via a programmatic JSON API. Both share the same server-side data access layer but have separate authentication mechanisms.

```
                              +-------------------+
                              |  admin.blisko.app  |
                              |  (TanStack Start)  |
                              +--------+----------+
                                       |
                    +------------------+------------------+
                    |                                     |
            Dashboard (SSR)                      Admin API (JSON)
            OTP session auth                     API key auth (Bearer)
            /dashboard/*                         /api/v1/*
                    |                                     |
                    +------------------+------------------+
                                       |
                              Server-Side Layer
                         +-----+------+------+-----+
                         |     |      |      |     |
                        DB   Redis  BullMQ  SSE  Allowlist
                         |     |      |      |     |
                    +----+-----+------+------+-----+----+
                    |                                    |
              PostgreSQL                            Redis
              (same as API)                    (same as API)
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Dashboard Pages** | SSR pages for human admins. Metrics charts, queue inspector, user browser, event feed. | Server functions (data layer) |
| **Admin API Routes** | JSON endpoints at `/api/v1/*` for Claude Code. CRUD operations, queue management, bulk actions. | Data layer, Allowlist |
| **Data Layer (`~/lib/data/`)** | Shared server-side functions for DB queries, Redis reads, BullMQ inspection. Imported by both dashboard pages and API routes. | PostgreSQL (Drizzle), Redis (Bun RedisClient), BullMQ (Queue class) |
| **Auth Layer (`~/lib/auth.ts`)** | In-memory OTP session store for dashboard. Existing implementation, no changes needed. | Resend (email), in-memory store |
| **API Key Auth (`~/lib/api-auth.ts`)** | Bearer token validation for admin API. Checks `ADMIN_API_KEY` env var. | Railway env var |
| **Allowlist (`~/lib/allowlist.ts`)** | Controls which API endpoints Claude Code can call. Persisted in DB, cached in memory. | PostgreSQL (allowlist table) |
| **SSE Bridge (`~/routes/api/events.ts`)** | Server-Sent Events endpoint. Subscribes to Redis pub/sub and streams backend events to dashboard. | Redis pub/sub, EventSource (client) |

### Key Design Principle: Shared Data Layer, Separate Auth

The data layer is the core abstraction. Dashboard pages call it via `createServerFn()`, API routes call the same functions directly. This means:

1. **One query implementation** -- no duplication between dashboard and API.
2. **Auth is at the edge** -- dashboard routes check OTP session in `beforeLoad`, API routes check Bearer token in a middleware/guard function.
3. **Allowlist only applies to API routes** -- dashboard pages are unrestricted (authenticated admin has full access).

## Data Flow

### Dashboard Page Load (Human Admin)

```
Browser GET /dashboard/queues
  -> TanStack Router beforeLoad: getAuthSession() checks OTP cookie
  -> If not authenticated: redirect to /login
  -> If authenticated: createServerFn fetches queue data
     -> Data layer: BullMQ Queue.getJobCounts() + Queue.getJobs()
     -> Data layer: Redis GET for queue-specific keys
  -> SSR renders page with data
  -> Client hydrates, sets up polling interval (5-10s) or SSE
```

### Admin API Request (Claude Code)

```
Claude Code: GET /api/v1/queues/ai-jobs/stats
  -> API route handler reads Authorization: Bearer <key>
  -> Validates key matches ADMIN_API_KEY env var
  -> Checks allowlist: is "queues.stats" enabled?
  -> If blocked: 403 Forbidden
  -> If allowed: calls data layer getQueueStats()
  -> Returns JSON response
```

### Real-Time Event Stream (SSE)

```
Dashboard client: new EventSource("/api/events")
  -> Server route creates ReadableStream
  -> Server subscribes to Redis pub/sub channel "admin-events"
  -> API publishes events (new wave, job complete, error) to "admin-events"
     (This is a NEW Redis channel separate from "ws-events" used by mobile)
  -> Server encodes events as SSE format, pushes via controller.enqueue()
  -> Client receives events, updates dashboard panels in real-time
  -> On disconnect: cleanup Redis subscription
```

**Important: The admin does NOT tap into the existing `ws-events` channel.** It subscribes to a dedicated `admin-events` channel. The main API publishes to both channels when relevant events occur (or the admin subscribes to `ws-events` read-only and filters). The simpler approach: admin subscribes to the existing `ws-events` channel read-only and transforms events for dashboard display.

### Allowlist Check Flow

```
API request arrives
  -> Parse endpoint identifier from URL (e.g., "queues.retry", "users.list")
  -> Check in-memory cache: Map<string, boolean>
  -> If cache miss: query DB admin_api_allowlist table, populate cache
  -> If endpoint disabled: return 403 { error: "Endpoint not allowed" }
  -> If endpoint enabled: proceed to handler
```

Cache invalidation: When the allowlist UI updates a row, clear the in-memory cache. Since admin is single-instance, no cross-replica sync needed.

## Component Architecture Detail

### 1. Database Connection (`~/lib/db.ts`)

The admin app creates its own Drizzle instance pointing at the same `DATABASE_URL`. It imports the schema from the API's schema file via workspace package resolution.

```typescript
// apps/admin/src/lib/db.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../../api/src/db/schema";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
export { schema };
```

**Why not import from `@repo/api`?** The API package is not set up as a shared workspace package -- it's an app. Importing schema via relative path or creating a shared `@repo/db` package are both viable. The relative path is simpler for now; extract to a shared package if a third consumer appears.

**Alternative (cleaner):** Extract `apps/api/src/db/schema.ts` into `packages/shared/src/schema.ts` or `packages/db/`. This is a larger refactor but would be cleaner long-term. For the admin milestone, relative import is pragmatic.

### 2. Redis Connection (`~/lib/redis.ts`)

```typescript
// apps/admin/src/lib/redis.ts
import { RedisClient } from "bun";

let client: RedisClient | null = null;

export function getRedis(): RedisClient {
  if (!client) {
    client = new RedisClient(process.env.REDIS_URL!);
  }
  return client;
}
```

Uses Bun's built-in `RedisClient` per project convention (`infra/bun-redis` rule). No ioredis dependency.

### 3. BullMQ Queue Inspector (`~/lib/data/queues.ts`)

BullMQ's `Queue` class provides read-only inspection without needing a `Worker`. The admin instantiates a `Queue("ai-jobs", { connection })` and uses getter methods:

- `getJobCounts("waiting", "active", "delayed", "failed", "completed")` -- overview counts
- `getJobs(["failed"], 0, 50)` -- list failed jobs with data, error info
- `getJobs(["active"], 0, 20)` -- see what's running now
- `getJobs(["delayed"], 0, 20)` -- see scheduled/retried jobs
- `queue.retryJobs({ state: "failed" })` -- retry all failed (write operation, allowlist-gated)
- Individual `job.retry()` -- retry specific job
- Individual `job.remove()` -- remove stuck job

**Connection:** BullMQ uses ioredis internally (its own dependency). This is fine -- ioredis is BullMQ's internal concern, not ours. We pass the same connection config derived from `REDIS_URL`.

```typescript
// apps/admin/src/lib/data/queues.ts
import { Queue } from "bullmq";

function getConnectionConfig() {
  const url = new URL(process.env.REDIS_URL!);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}

let _queue: Queue | null = null;

export function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue("ai-jobs", { connection: getConnectionConfig() });
  }
  return _queue;
}
```

### 4. Data Layer Functions (`~/lib/data/`)

Organized by domain, these are plain async functions that run server-side only.

```
~/lib/data/
  queues.ts      -- BullMQ job inspection, retry, removal
  metrics.ts     -- Request event aggregation (replicates metrics-summary.ts queries)
  users.ts       -- User search, profile inspection, account actions
  events.ts      -- Recent event log queries
  allowlist.ts   -- CRUD for API endpoint allowlist
```

**Why replicate metrics queries instead of calling the API's `/api/metrics/summary`?** Direct DB access is faster, more flexible (custom time windows, filters), and avoids HTTP round-trips + rate limiting. The admin should own its queries.

### 5. Server Functions for Dashboard (`~/lib/data/*.server.ts`)

TanStack Start `createServerFn` wrappers that call the data layer. These are what dashboard pages import.

```typescript
// ~/lib/server-fns/queues.ts
import { createServerFn } from "@tanstack/react-start";

export const getQueueOverview = createServerFn().handler(async () => {
  const { getQueueStats } = await import("~/lib/data/queues");
  return getQueueStats();
});

export const retryFailedJob = createServerFn({ method: "POST" })
  .validator((input: { jobId: string }) => input)
  .handler(async ({ data }) => {
    const { retryJob } = await import("~/lib/data/queues");
    return retryJob(data.jobId);
  });
```

### 6. API Routes (`~/routes/api/v1/`)

File-based API routes using TanStack Start's server route pattern. Each route file defines handlers for HTTP methods.

```
~/routes/api/v1/
  queues/
    index.ts              -- GET: list queues overview
    $queueName/
      jobs.ts             -- GET: list jobs by state
      retry.ts            -- POST: retry failed jobs
  metrics/
    summary.ts            -- GET: metrics overview
    endpoints.ts          -- GET: per-endpoint breakdown
  users/
    index.ts              -- GET: search/list users
    $userId.ts            -- GET: user detail
  events/
    stream.ts             -- GET: SSE event stream (no allowlist -- streaming)
  allowlist/
    index.ts              -- GET: list, POST: update
  health.ts               -- GET: admin service health
```

**Route pattern:**

```typescript
// ~/routes/api/v1/queues/index.ts
export const Route = createFileRoute("/api/v1/queues")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { validateApiKey } = await import("~/lib/api-auth");
        const { checkAllowlist } = await import("~/lib/allowlist");

        const authError = validateApiKey(request);
        if (authError) return authError;

        const allowed = await checkAllowlist("queues.list");
        if (!allowed) return Response.json({ error: "Endpoint not allowed" }, { status: 403 });

        const { getQueueOverview } = await import("~/lib/data/queues");
        const data = await getQueueOverview();
        return Response.json(data);
      },
    },
  },
});
```

### 7. API Key Authentication (`~/lib/api-auth.ts`)

Simple Bearer token check against environment variable. No database involvement.

```typescript
export function validateApiKey(request: Request): Response | null {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }
  const key = auth.slice(7);
  if (key !== process.env.ADMIN_API_KEY) {
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }
  return null; // Auth passed
}
```

**Why not a more complex auth system?** Single admin user, single API consumer (Claude Code). A static API key stored as a Railway env var is appropriate. If multi-user API access is needed later, upgrade to JWT or session-based API auth.

### 8. Allowlist System (`~/lib/allowlist.ts`)

Database-backed list of API endpoint identifiers with enabled/disabled state.

**Schema (new table):**

```sql
CREATE TABLE admin_api_allowlist (
  endpoint TEXT PRIMARY KEY,           -- e.g., "queues.list", "users.delete"
  enabled BOOLEAN NOT NULL DEFAULT true,
  description TEXT,                     -- human-readable description
  category TEXT NOT NULL DEFAULT 'general', -- grouping for UI
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Behavior:**
- On first deploy, seed with all known endpoints (all enabled by default).
- Admin UI shows grouped list with toggles.
- Toggling updates DB + clears in-memory cache.
- API routes check allowlist before executing. If endpoint not in table, deny by default (fail-closed).

### 9. SSE Event Stream (`~/routes/api/events.ts`)

The SSE endpoint subscribes to Redis pub/sub and streams events to connected dashboard clients.

```typescript
export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Auth check (OTP session cookie OR API key)
        const { getAuthFromRequest } = await import("~/lib/auth-helpers");
        if (!getAuthFromRequest(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            const { RedisClient } = require("bun");
            const sub = new RedisClient(process.env.REDIS_URL!);

            // Subscribe to the existing ws-events channel (read-only)
            sub.subscribe("ws-events", (message: string) => {
              controller.enqueue(
                encoder.encode(`data: ${message}\n\n`)
              );
            });

            // Heartbeat every 30s to keep connection alive
            const heartbeat = setInterval(() => {
              controller.enqueue(encoder.encode(": heartbeat\n\n"));
            }, 30000);

            // Cleanup on disconnect
            request.signal.addEventListener("abort", () => {
              clearInterval(heartbeat);
              sub.close();
            });
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        });
      },
    },
  },
});
```

**Design choice: Subscribe to existing `ws-events` channel.** The main API already publishes all real-time events (new wave, new message, analysis ready, etc.) to this Redis channel. The admin just subscribes read-only and transforms events for dashboard display. No changes to the main API needed.

## Patterns to Follow

### Pattern 1: Data Layer as Single Source of Truth

**What:** All database queries and Redis reads live in `~/lib/data/`. Dashboard server functions and API routes both import from here. Never duplicate a query.

**When:** Any time you need data from PostgreSQL or Redis.

**Example:**
```typescript
// ~/lib/data/metrics.ts -- shared data function
export async function getErrorRate(since: Date, endpoint?: string) {
  // ... Drizzle query
}

// ~/lib/server-fns/metrics.ts -- dashboard consumption
export const fetchErrorRate = createServerFn()
  .validator((input: { hours: number }) => input)
  .handler(async ({ data }) => {
    const { getErrorRate } = await import("~/lib/data/metrics");
    const since = new Date(Date.now() - data.hours * 3600000);
    return getErrorRate(since);
  });

// ~/routes/api/v1/metrics/errors.ts -- API consumption
GET: async ({ request }) => {
  // ... auth + allowlist check
  const { getErrorRate } = await import("~/lib/data/metrics");
  const since = new Date(Date.now() - 24 * 3600000);
  return Response.json(await getErrorRate(since));
}
```

### Pattern 2: Guard-Then-Execute for API Routes

**What:** Every API route follows the same pattern: validate auth, check allowlist, execute, return JSON.

**When:** All `/api/v1/*` routes.

**Example:**
```typescript
GET: async ({ request }) => {
  // 1. Auth
  const authError = validateApiKey(request);
  if (authError) return authError;

  // 2. Allowlist
  const allowed = await checkAllowlist("endpoint.identifier");
  if (!allowed) return Response.json({ error: "Not allowed" }, { status: 403 });

  // 3. Execute
  const data = await someDataFunction();

  // 4. Return
  return Response.json({ ok: true, data });
}
```

This could be extracted into a helper:

```typescript
export async function withApiAuth(
  request: Request,
  endpoint: string,
  handler: () => Promise<unknown>
): Promise<Response> {
  const authError = validateApiKey(request);
  if (authError) return authError;

  const allowed = await checkAllowlist(endpoint);
  if (!allowed) {
    return Response.json({ error: `Endpoint "${endpoint}" not allowed` }, { status: 403 });
  }

  const data = await handler();
  return Response.json({ ok: true, data });
}
```

### Pattern 3: Lazy Initialization for Connections

**What:** Database, Redis, and BullMQ connections are lazily initialized on first use, stored in module-level variables.

**When:** All server-side connection setup.

**Why:** Avoids connection errors during build/import time. Matches existing patterns in the API codebase.

### Pattern 4: Import Schema via Workspace Resolution

**What:** The admin app imports the Drizzle schema from the API app's source code, not from a separate package.

**When:** Any admin query needs to reference table definitions.

**Implementation:** Add a path alias or workspace dependency:

```json
// apps/admin/tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "~/*": ["./src/*"],
      "@db/*": ["../api/src/db/*"]
    }
  }
}
```

Then import:
```typescript
import * as schema from "@db/schema";
```

**Caveat:** This creates a build-time coupling between admin and API. If the schema changes, admin must be rebuilt. This is acceptable -- schema changes already require coordinated deploys.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Proxying Through the Main API

**What:** Making the admin dashboard call the main API's HTTP endpoints instead of querying the database directly.

**Why bad:** Adds latency, creates circular dependencies, subjects admin queries to user-facing rate limits, and limits query flexibility. The admin needs queries the API doesn't expose (user search, job inspection, aggregate stats across all users).

**Instead:** Direct database and Redis connections from the admin server.

### Anti-Pattern 2: Sharing the Auth System

**What:** Using Better Auth (the main API's auth system) for admin authentication.

**Why bad:** Admin auth is fundamentally different -- it's an allowlisted email OTP flow for a handful of admins, not a user registration system. Mixing them creates confusion and risk (admin sessions appearing in user session tables).

**Instead:** Keep the existing standalone in-memory OTP auth for dashboard access. Use a separate API key mechanism for programmatic access.

### Anti-Pattern 3: WebSocket for Admin Real-Time

**What:** Using WebSocket instead of SSE for the admin's real-time event feed.

**Why bad:** WebSocket adds complexity (connection management, reconnection logic, state tracking) for a one-directional data flow. The admin event feed is server-to-client only -- SSE is the correct tool. SSE also reconnects automatically via `EventSource`.

**Instead:** SSE endpoint that subscribes to Redis pub/sub.

### Anti-Pattern 4: Separate Database for Admin State

**What:** Creating a separate database for admin-specific tables (allowlist, admin sessions, etc.).

**Why bad:** Adds infrastructure complexity, another connection to manage, another thing to back up. The admin's state is small (one allowlist table, perhaps an audit log later).

**Instead:** Add admin tables to the existing PostgreSQL database. Use a separate schema (`admin`) to keep them organized, similar to how metrics uses the `metrics` schema.

### Anti-Pattern 5: Complex RBAC Before It's Needed

**What:** Building role-based access control, permissions matrices, or multi-tenant admin from the start.

**Why bad:** Single admin user, two consumers (human + Claude Code). RBAC adds weeks of work for zero current value.

**Instead:** Email allowlist (ADMIN_EMAILS env var) for dashboard access. Single API key for programmatic access. Allowlist UI for endpoint-level control. Upgrade to RBAC only if multi-admin with different permission levels is needed.

## Scalability Considerations

| Concern | Current (1 admin) | At 3-5 admins | At 10+ admins |
|---------|-------------------|---------------|---------------|
| Auth | In-memory OTP, single API key | In-memory OTP, per-user API keys stored in DB | Move to proper auth (Better Auth admin instance or similar) |
| Sessions | In-memory Map | In-memory Map (fine for single replica) | Redis-backed sessions |
| SSE connections | 1-2 concurrent | 3-5 concurrent | Add connection pooling, consider fan-out |
| DB queries | Direct queries, no caching | Add query result caching (TTL 5-10s) | Read replica for admin queries |
| Allowlist | In-memory cache, DB-backed | Same (cache invalidation is instant in single replica) | Redis-backed cache for multi-replica |

The current architecture is explicitly designed for single-admin use. The PROJECT.md confirms "single admin user expected" and multi-admin is out of scope. The architecture is simple to extend later if needed.

## Suggested Build Order

Components have natural dependencies. Build in this order:

### Phase 1: Foundation (must be first)

1. **Database connection** (`~/lib/db.ts`) -- everything else needs this
2. **Redis connection** (`~/lib/redis.ts`) -- queue inspection and SSE need this
3. **Schema import resolution** -- configure tsconfig paths or workspace link
4. **API key auth** (`~/lib/api-auth.ts`) -- API routes need this

**Rationale:** These are infrastructure primitives. Nothing else works without them. Small, testable, independent.

### Phase 2: Data Layer + First Dashboard Pages

1. **Queue data functions** (`~/lib/data/queues.ts`) -- highest-value visibility
2. **Metrics data functions** (`~/lib/data/metrics.ts`) -- reuse existing query patterns from `metrics-summary.ts`
3. **Queue dashboard page** -- first visible output, validates the full stack
4. **Metrics dashboard page** -- second visible output

**Rationale:** Queue monitoring is the highest-priority feature. Metrics reuses proven query patterns. Building both validates the data layer pattern end-to-end.

### Phase 3: Admin API

1. **API route structure** (`/api/v1/`) -- file structure, auth middleware
2. **Allowlist table + migration** -- DB schema for endpoint control
3. **Allowlist logic** (`~/lib/allowlist.ts`) -- check + cache
4. **Queue API routes** -- first API endpoints, validates auth + allowlist
5. **Metrics API routes**

**Rationale:** API routes depend on auth and allowlist being ready. Building API after dashboard ensures the data layer is stable before exposing it programmatically.

### Phase 4: Real-Time + Polish

1. **SSE event stream** -- subscribes to Redis pub/sub
2. **Event feed dashboard page** -- consumes SSE stream
3. **Allowlist management UI** -- admin can toggle endpoints
4. **User browser pages** -- search, inspect, act on users
5. **Claude Code skill generation** -- auto-generated docs for Claude to use the API

**Rationale:** SSE is higher complexity and depends on Redis being proven. Allowlist UI is only useful after API routes exist. User browser is lower priority than ops visibility. Skill generation comes last because the API must be stable first.

## File Structure

```
apps/admin/src/
  lib/
    db.ts                    -- Drizzle instance (PostgreSQL)
    redis.ts                 -- Bun RedisClient instance
    auth.ts                  -- OTP auth (existing, no changes)
    auth-session.ts          -- Session helper (existing)
    api-auth.ts              -- API key validation (new)
    allowlist.ts             -- Allowlist check + cache (new)
    email.ts                 -- Email sending (existing)
    rate-limit.ts            -- Rate limiter (existing)
    data/
      queues.ts              -- BullMQ queue inspection
      metrics.ts             -- Request metrics aggregation
      users.ts               -- User queries
      events.ts              -- Event log queries
      allowlist.ts           -- Allowlist CRUD
    server-fns/
      queues.ts              -- createServerFn wrappers for queue data
      metrics.ts             -- createServerFn wrappers for metrics
      users.ts               -- createServerFn wrappers for user data
      allowlist.ts           -- createServerFn wrappers for allowlist
  routes/
    __root.tsx               -- Root layout (existing)
    index.tsx                -- Redirect (existing)
    login.tsx                -- OTP login (existing)
    dashboard.tsx            -- Dashboard layout/shell (extend existing)
    dashboard/
      index.tsx              -- Overview page (summary cards)
      queues.tsx             -- Queue monitoring
      metrics.tsx            -- Error rates, latency charts
      users.tsx              -- User browser
      events.tsx             -- Live event feed (SSE consumer)
      allowlist.tsx          -- API endpoint allowlist management
    api/
      request-otp.ts         -- OTP request (existing)
      verify-otp.ts          -- OTP verify (existing)
      logout.ts              -- Logout (existing)
      events.ts              -- SSE event stream (new)
      v1/
        queues/
          index.ts           -- Queue overview
          $queueName/
            jobs.ts          -- Jobs by state
            retry.ts         -- Retry failed jobs
        metrics/
          summary.ts         -- Metrics overview
          endpoints.ts       -- Per-endpoint breakdown
        users/
          index.ts           -- User search/list
          $userId.ts         -- User detail + actions
        allowlist/
          index.ts           -- List + update allowlist
        health.ts            -- Service health check
  styles/
    app.css                  -- Tailwind base (existing)
  router.tsx                 -- Router config (existing)
  routeTree.gen.ts           -- Auto-generated route tree
```

## Infrastructure Notes

**Railway deployment:** The admin app is already deployed as a separate Railway service (`admin`). It needs `DATABASE_URL`, `REDIS_URL`, `ADMIN_EMAILS`, `RESEND_API_KEY`, and the new `ADMIN_API_KEY` environment variables.

**Dockerfile:** Already exists and works. Adding `drizzle-orm` and `postgres` dependencies will be picked up automatically by the build.

**New dependencies needed:**
- `drizzle-orm` -- database queries
- `postgres` -- PostgreSQL driver
- `bullmq` -- queue inspection (brings ioredis as transitive dep)
- No new Redis dependency -- using Bun's built-in `RedisClient`

**Schema access:** The Dockerfile copies `apps/api/package.json` in the deps stage but not the source code. If importing schema via relative path, the build stage needs to also copy `apps/api/src/db/schema.ts`. Alternatively, move schema to `packages/shared/` or `packages/db/`.

## Sources

- [TanStack Start Server Routes docs](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes) -- HIGH confidence
- [TanStack Start Server Functions docs](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions) -- HIGH confidence
- [BullMQ Job Getters docs](https://docs.bullmq.io/guide/jobs/getters) -- HIGH confidence
- [BullMQ Queue API reference](https://api.docs.bullmq.io/classes/v5.Queue.html) -- HIGH confidence
- [Nitro SSE / h3 event streams](https://github.com/nitrojs/nitro/issues/2374) -- MEDIUM confidence (pattern verified via community examples)
- Existing codebase: `apps/admin/src/`, `apps/api/src/services/queue.ts`, `apps/api/src/services/metrics-summary.ts`, `packages/dev-cli/src/queue-monitor.ts` -- HIGH confidence (direct code review)

---

*Architecture analysis: 2026-03-26*
