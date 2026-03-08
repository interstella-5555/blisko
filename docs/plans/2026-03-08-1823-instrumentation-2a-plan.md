# Instrumentation 2a — Deeper Insight — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enrich per-request metrics with DB query tracking (count + duration), target user/group context for GDPR auditing, and add BullMQ queue observability to summary + Prometheus endpoints.

**Architecture:** AsyncLocalStorage tracks per-request DB query count and duration via a monkey-patch on `postgres.js`'s `client.unsafe()` (the method Drizzle uses internally for all queries). tRPC procedures enrich the existing `requestMeta` WeakMap with `targetUserId`/`targetGroupId`. BullMQ event listeners collect in-memory job stats exposed through existing metrics endpoints.

**Tech Stack:** `AsyncLocalStorage` (Bun-compatible), `postgres.js` v3 instrumentation, BullMQ event listeners, `prom-client`

**Design Doc:** `docs/plans/2026-03-08-1823-instrumentation-2a-design.md`

---

## Sub-issue 2a-1: Schema + ALS + Drizzle Query Tracking

### Task 1: Add columns to schema

**Files:**
- Modify: `apps/api/src/db/schema.ts:381-405`

**Step 1: Add four new columns and two indexes**

In the `requestEvents` table definition, add after `errorMessage` (line 398):

```ts
    targetUserId: text("target_user_id"),
    targetGroupId: text("target_group_id"),
    dbQueryCount: integer("db_query_count"),
    dbDurationMs: integer("db_duration_ms"),
```

In the indexes array (line 400-404), add two more entries:

```ts
    index("idx_re_target_user_ts").on(table.targetUserId, table.timestamp),
    index("idx_re_target_group").on(table.targetGroupId),
```

**Step 2: Generate migration**

Run: `pnpm --filter @repo/api db:generate -- --name=add_deeper_insight_columns`

Expected: New `.sql` file in `apps/api/drizzle/` with 4 `ADD COLUMN` + 2 `CREATE INDEX`.

**Step 3: Review generated SQL**

Read the generated file. Verify no unexpected changes. Should be purely additive — non-interactive.

**Step 4: Commit**

```
Add deeper insight columns to request_events schema (BLI-69)
```

---

### Task 2: Create AsyncLocalStorage query tracker

**Files:**
- Create: `apps/api/src/services/query-tracker.ts`

**Step 1: Write the module**

```ts
import { AsyncLocalStorage } from "node:async_hooks";

interface QueryContext {
  queryCount: number;
  dbDurationMs: number;
}

export const queryTracker = new AsyncLocalStorage<QueryContext>();

export function createQueryContext(): QueryContext {
  return { queryCount: 0, dbDurationMs: 0 };
}

export function recordQuery(durationMs: number): void {
  const ctx = queryTracker.getStore();
  if (ctx) {
    ctx.queryCount++;
    ctx.dbDurationMs += durationMs;
  }
}

export function getQueryStats(): QueryContext | null {
  return queryTracker.getStore() ?? null;
}
```

**Step 2: Commit**

```
Add AsyncLocalStorage query tracker (BLI-69)
```

---

### Task 3: Instrument postgres client for query timing

**Files:**
- Modify: `apps/api/src/db/index.ts`

**Context:** Drizzle's `Logger` interface only has `logQuery()` which fires _before_ execution — no post-execution hook. To measure actual query duration, we monkey-patch `client.unsafe()`, which is the method `drizzle-orm/postgres-js` uses internally for all query execution.

**Step 1: Add query instrumentation**

Replace `apps/api/src/db/index.ts` contents with:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { recordQuery } from "@/services/query-tracker";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString);

// Instrument client.unsafe() to track query count + duration per request.
// drizzle-orm/postgres-js calls client.unsafe() for all queries.
// We wrap it to record timing via AsyncLocalStorage (query-tracker.ts).
const originalUnsafe = client.unsafe.bind(client);

function instrumentedUnsafe(query: string, parameters?: unknown[], queryOptions?: unknown) {
  const start = performance.now();
  const pending = originalUnsafe(query, parameters, queryOptions);

  // Wrap .then() on the PendingQuery to record timing after execution
  const origThen = pending.then.bind(pending);
  pending.then = function patchedThen(onfulfilled?: unknown, onrejected?: unknown) {
    return origThen(
      (val: unknown) => {
        recordQuery(Math.round(performance.now() - start));
        return typeof onfulfilled === "function" ? onfulfilled(val) : val;
      },
      (err: unknown) => {
        recordQuery(Math.round(performance.now() - start));
        if (typeof onrejected === "function") return onrejected(err);
        throw err;
      },
    );
  } as typeof pending.then;

  // Also wrap .values() for prepared statement paths
  const origValues = pending.values.bind(pending);
  pending.values = function patchedValues() {
    const valuesPending = origValues();
    const valOrigThen = valuesPending.then.bind(valuesPending);
    valuesPending.then = function patchedValuesThen(onfulfilled?: unknown, onrejected?: unknown) {
      return valOrigThen(
        (val: unknown) => {
          recordQuery(Math.round(performance.now() - start));
          return typeof onfulfilled === "function" ? onfulfilled(val) : val;
        },
        (err: unknown) => {
          recordQuery(Math.round(performance.now() - start));
          if (typeof onrejected === "function") return onrejected(err);
          throw err;
        },
      );
    } as typeof valuesPending.then;
    return valuesPending;
  } as typeof pending.values;

  return pending;
}

// @ts-expect-error — monkey-patching for query instrumentation
client.unsafe = instrumentedUnsafe;

export const db = drizzle(client, { schema });
export { schema };
export { preparedName } from "./prepare";
```

**Step 2: Verify the API still starts**

Run: `cd apps/api && timeout 5 bun run src/index.ts 2>&1 || true`

Expected: Server starts without errors (will timeout after 5s, that's fine).

**Step 3: Commit**

```
Instrument postgres client for query timing (BLI-69)
```

---

### Task 4: Integrate query tracker into metrics middleware

**Files:**
- Modify: `apps/api/src/services/metrics.ts:113-163`

**Step 1: Import query tracker**

At the top of `metrics.ts`, add:

```ts
import { createQueryContext, getQueryStats, queryTracker } from "@/services/query-tracker";
```

**Step 2: Wrap handler in ALS context**

In `metricsMiddleware()`, modify the middleware function to wrap `next()` in `queryTracker.run()`. Replace lines 115-163 (the returned async function) with:

```ts
  return async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (SKIP_PATHS.has(path)) {
      await next();
      return;
    }

    const start = performance.now();
    const requestId = crypto.randomUUID();
    c.header("X-Request-Id", requestId);
    requestMeta.set(c.req.raw, { requestId });

    let errMsg: string | null = null;
    const queryContext = createQueryContext();

    try {
      await queryTracker.run(queryContext, () => next());
    } catch (err) {
      errMsg = truncate(err instanceof Error ? err.message : String(err), 200);
      throw err;
    } finally {
      const durationMs = Math.round(performance.now() - start);
      const meta = requestMeta.get(c.req.raw);
      const queryStats = getQueryStats() ?? queryContext;

      const endpoint = extractEndpoint(c);
      const statusCode = errMsg ? 500 : c.res.status;
      const labels = { method: c.req.method, endpoint, status_code: String(statusCode) };

      httpRequestDuration.observe(labels, durationMs);
      httpRequestsTotal.inc(labels);

      pushEvent({
        timestamp: new Date(),
        requestId,
        method: c.req.method,
        endpoint,
        userId: meta?.userId ?? null,
        durationMs,
        statusCode,
        appVersion: c.req.header("x-app-version") ?? null,
        platform: parsePlatform(c.req.header("user-agent")),
        authProvider: null,
        sessionId: meta?.sessionId ?? null,
        ipHash: hashIp(getClientIp(c)),
        userAgent: truncate(c.req.header("user-agent"), 200),
        errorMessage: errMsg,
        targetUserId: meta?.targetUserId ?? null,
        targetGroupId: meta?.targetGroupId ?? null,
        dbQueryCount: queryStats.queryCount || null,
        dbDurationMs: queryStats.dbDurationMs || null,
      });
      requestMeta.delete(c.req.raw);
    }
  };
```

**Step 3: Extend the `requestMeta` WeakMap type**

Update the WeakMap type (lines 68-75) to include target fields:

```ts
export const requestMeta = new WeakMap<
  Request,
  {
    requestId: string;
    userId?: string;
    sessionId?: string;
    targetUserId?: string;
    targetGroupId?: string;
  }
>();
```

**Step 4: Add helper functions for target enrichment**

Add after the WeakMap definition:

```ts
export function setTargetUserId(req: Request, targetUserId: string): void {
  const meta = requestMeta.get(req);
  if (meta) {
    meta.targetUserId = targetUserId;
  }
}

export function setTargetGroupId(req: Request, targetGroupId: string): void {
  const meta = requestMeta.get(req);
  if (meta) {
    meta.targetGroupId = targetGroupId;
  }
}
```

**Step 5: Verify typecheck passes**

Run: `pnpm --filter @repo/api typecheck`

Expected: 0 errors. The `NewRequestEvent` type is inferred from schema, so adding columns to schema automatically adds them to the type.

**Step 6: Commit**

```
Integrate query tracker and target enrichment into metrics middleware (BLI-69)
```

---

### Task 5: Write test for query tracking

**Files:**
- Create: `apps/api/__tests__/query-tracker.test.ts`

**Step 1: Write the test**

```ts
import { describe, expect, it } from "vitest";
import { createQueryContext, getQueryStats, queryTracker, recordQuery } from "../src/services/query-tracker";

describe("query-tracker", () => {
  it("tracks query count and duration within ALS context", async () => {
    const ctx = createQueryContext();

    await queryTracker.run(ctx, async () => {
      recordQuery(10);
      recordQuery(25);
      recordQuery(5);

      const stats = getQueryStats();
      expect(stats).not.toBeNull();
      expect(stats!.queryCount).toBe(3);
      expect(stats!.dbDurationMs).toBe(40);
    });
  });

  it("returns null outside ALS context", () => {
    const stats = getQueryStats();
    expect(stats).toBeNull();
  });

  it("does not leak between contexts", async () => {
    const ctx1 = createQueryContext();
    const ctx2 = createQueryContext();

    await Promise.all([
      queryTracker.run(ctx1, async () => {
        recordQuery(100);
        await new Promise((r) => setTimeout(r, 10));
        expect(ctx1.queryCount).toBe(1);
      }),
      queryTracker.run(ctx2, async () => {
        recordQuery(50);
        recordQuery(50);
        await new Promise((r) => setTimeout(r, 10));
        expect(ctx2.queryCount).toBe(2);
      }),
    ]);

    expect(ctx1.queryCount).toBe(1);
    expect(ctx2.queryCount).toBe(2);
  });
});
```

**Step 2: Run tests**

Run: `pnpm --filter @repo/api test`

Expected: All pass, including new `query-tracker.test.ts`.

**Step 3: Commit**

```
Add query tracker tests (BLI-69)
```

---

### Task 6: Verify end-to-end and run checks

**Step 1: Run typecheck for API**

Run: `pnpm --filter @repo/api typecheck`

Expected: 0 errors.

**Step 2: Run biome check**

Run: `npx @biomejs/biome check .`

Expected: 0 errors.

**Step 3: Run all tests**

Run: `pnpm --filter @repo/api test`

Expected: All pass.

**Step 4: Commit any fixes if needed**

---

## Sub-issue 2a-2: Target User/Group Enrichment in tRPC Procedures

### Task 7: Add `setTargetUserId` to waves procedures

**Files:**
- Modify: `apps/api/src/trpc/procedures/waves.ts`

**Step 1: Import helper**

At the top of `waves.ts`, add:

```ts
import { setTargetUserId } from "@/services/metrics";
```

**Step 2: Add to `waves.send`**

After the input is validated and `input.toUserId` is available, add:

```ts
setTargetUserId(ctx.req.raw, input.toUserId);
```

Note: `ctx` is the tRPC context. We need access to the raw Request. Check how context exposes the raw request — it might be via `opts.ctx` in the procedure. The tRPC context currently has `{ userId, db }`. We need to also pass `req` through.

**Important:** The `TRPCContext` interface (`apps/api/src/trpc/context.ts:15-19`) currently has:

```ts
export interface TRPCContext {
  userId: string | null;
  db: typeof db;
  [key: string]: unknown;
}
```

We need to add `req: Request` to the context. Modify `createContext()` to return:

```ts
return {
  userId,
  db,
  req: opts.req,
};
```

And update the interface:

```ts
export interface TRPCContext {
  userId: string | null;
  db: typeof db;
  req: Request;
  [key: string]: unknown;
}
```

Then in `waves.send`, the enrichment becomes:

```ts
setTargetUserId(ctx.req, input.toUserId);
```

**Step 3: Add to `waves.respond`**

After retrieving the wave and getting `wave.fromUserId`:

```ts
setTargetUserId(ctx.req, wave.fromUserId);
```

**Step 4: Commit**

```
Enrich waves procedures with targetUserId (BLI-69)
```

---

### Task 8: Add `setTargetUserId` to messages procedures

**Files:**
- Modify: `apps/api/src/trpc/procedures/messages.ts`

**Step 1: Import helper**

```ts
import { setTargetGroupId, setTargetUserId } from "@/services/metrics";
```

**Step 2: Add to `messages.send`**

After determining whether the conversation is a DM or group:
- **DM:** `setTargetUserId(ctx.req, recipientUserId)` — the other participant
- **Group:** `setTargetGroupId(ctx.req, conversation.groupId)` — the group

The logic depends on how the procedure determines DM vs group. Read the procedure to find the exact point.

**Step 3: Commit**

```
Enrich messages procedures with target tracking (BLI-69)
```

---

### Task 9: Add `setTargetUserId` to profiles and groups procedures

**Files:**
- Modify: `apps/api/src/trpc/procedures/profiles.ts`
- Modify: `apps/api/src/trpc/procedures/groups.ts`

**Step 1: Profiles — `getById`**

```ts
import { setTargetUserId } from "@/services/metrics";
// In profiles.getById:
setTargetUserId(ctx.req, input.userId);
```

**Step 2: Groups — `addMember`, `removeMember`**

```ts
import { setTargetGroupId, setTargetUserId } from "@/services/metrics";
// In groups.addMember:
setTargetUserId(ctx.req, input.userId);  // who is being added
setTargetGroupId(ctx.req, input.groupId); // to which group

// In groups.removeMember:
setTargetUserId(ctx.req, input.userId);
setTargetGroupId(ctx.req, input.groupId);
```

**Step 3: Groups — `join`, `create`**

```ts
// In groups.join (after resolving groupId from invite code):
setTargetGroupId(ctx.req, groupId);

// In groups.create (after inserting group):
setTargetGroupId(ctx.req, newGroup.id);
```

**Step 4: Run typecheck**

Run: `pnpm --filter @repo/api typecheck`

Expected: 0 errors.

**Step 5: Commit**

```
Enrich profiles and groups procedures with target tracking (BLI-69)
```

---

### Task 10: Verify target enrichment end-to-end

**Step 1: Run all tests**

Run: `pnpm --filter @repo/api test`

Expected: All pass.

**Step 2: Run biome check**

Run: `npx @biomejs/biome check .`

Expected: 0 errors.

---

## Sub-issue 2a-3: BullMQ Queue Metrics

### Task 11: Create queue metrics collector

**Files:**
- Create: `apps/api/src/services/queue-metrics.ts`

**Step 1: Write the module**

```ts
import type { Queue } from "bullmq";

interface QueueStats {
  completed: number;
  failed: number;
  durations: number[];
}

const stats = new Map<string, QueueStats>();

function getOrCreate(name: string): QueueStats {
  let s = stats.get(name);
  if (!s) {
    s = { completed: 0, failed: 0, durations: [] };
    stats.set(name, s);
  }
  return s;
}

const MAX_DURATIONS = 1000;

export function recordJobCompleted(queueName: string, durationMs: number): void {
  const s = getOrCreate(queueName);
  s.completed++;
  s.durations.push(durationMs);
  if (s.durations.length > MAX_DURATIONS) {
    s.durations.splice(0, s.durations.length - MAX_DURATIONS);
  }
}

export function recordJobFailed(queueName: string): void {
  getOrCreate(queueName).failed++;
}

export function getQueueStats(): Map<string, QueueStats> {
  return stats;
}

export function percentile(arr: number[], pct: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(pct * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
```

**Step 2: Commit**

```
Add queue metrics collector (BLI-69)
```

---

### Task 12: Wire BullMQ worker events to collector

**Files:**
- Modify: `apps/api/src/services/queue.ts:696-702`

**Step 1: Import collector**

At the top of `queue.ts`, add:

```ts
import { recordJobCompleted, recordJobFailed } from "./queue-metrics";
```

**Step 2: Replace worker event handlers**

Replace the `completed` and `failed` event handlers (lines 696-702) with:

```ts
  _worker.on("completed", (job) => {
    const durationMs = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
    recordJobCompleted("ai-jobs", durationMs);
    console.log(`[queue] Job ${job.id} completed (${job.data.type}) ${durationMs}ms`);
  });

  _worker.on("failed", (job, err) => {
    recordJobFailed("ai-jobs");
    console.error(`[queue] Job ${job?.id} failed:`, err.message);
  });
```

**Step 3: Export queue getter for job counts**

Add a function to get the Queue instance (for `getJobCounts()`):

```ts
export function getQueueInstance(): Queue | null {
  return _queue;
}
```

**Step 4: Commit**

```
Wire BullMQ events to queue metrics collector (BLI-69)
```

---

### Task 13: Add queue metrics to summary endpoint

**Files:**
- Modify: `apps/api/src/services/metrics-summary.ts`

**Step 1: Import queue stats**

```ts
import { getQueueStats, percentile } from "./queue-metrics";
import { getQueueInstance } from "./queue";
```

**Step 2: Add queue section to summary response**

In `getMetricsSummary()`, add `queues` to the returned object:

```ts
export async function getMetricsSummary(windowHours = DEFAULT_WINDOW_HOURS) {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const [overview, slowest, errors, sloBreaches, queues] = await Promise.all([
    getOverview(since),
    getSlowestEndpoints(since),
    getTopErrors(since),
    checkSloBreaches(since),
    getQueueSummary(),
  ]);

  return { windowHours, since: since.toISOString(), overview, slowest, errors, sloBreaches, queues };
}
```

Add the helper function:

```ts
async function getQueueSummary() {
  const allStats = getQueueStats();
  const queue = getQueueInstance();
  const results = [];

  for (const [name, s] of allStats) {
    const avgDurationMs = s.durations.length > 0 ? Math.round(s.durations.reduce((a, b) => a + b, 0) / s.durations.length) : 0;
    const p95DurationMs = Math.round(percentile(s.durations, 0.95));

    let waiting = 0;
    let active = 0;
    let delayed = 0;

    if (queue) {
      try {
        const counts = await queue.getJobCounts("waiting", "active", "delayed");
        waiting = counts.waiting ?? 0;
        active = counts.active ?? 0;
        delayed = counts.delayed ?? 0;
      } catch {
        // Redis might be unavailable
      }
    }

    results.push({
      name,
      completed: s.completed,
      failed: s.failed,
      waiting,
      active,
      delayed,
      avgDurationMs,
      p95DurationMs,
    });
  }

  return results;
}
```

**Step 3: Commit**

```
Add queue metrics to summary endpoint (BLI-69)
```

---

### Task 14: Add queue metrics to Prometheus

**Files:**
- Modify: `apps/api/src/services/prometheus.ts`

**Step 1: Add BullMQ metrics**

```ts
import { Counter, Gauge, Histogram, Registry } from "prom-client";

export const registry = new Registry();

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_ms",
  help: "HTTP request duration in milliseconds",
  labelNames: ["method", "endpoint", "status_code"] as const,
  buckets: [10, 25, 50, 100, 200, 500, 1000, 2500, 5000],
  registers: [registry],
});

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "endpoint", "status_code"] as const,
  registers: [registry],
});

// BullMQ metrics
export const bullmqJobsTotal = new Counter({
  name: "bullmq_jobs_total",
  help: "Total BullMQ jobs by queue and status",
  labelNames: ["queue", "status"] as const,
  registers: [registry],
});

export const bullmqJobDuration = new Histogram({
  name: "bullmq_job_duration_ms",
  help: "BullMQ job processing duration in milliseconds",
  labelNames: ["queue"] as const,
  buckets: [100, 500, 1000, 2500, 5000, 10000, 30000, 60000],
  registers: [registry],
});

export const bullmqQueueDepth = new Gauge({
  name: "bullmq_queue_depth",
  help: "Current BullMQ queue depth by state",
  labelNames: ["queue", "state"] as const,
  registers: [registry],
});
```

**Step 2: Update queue-metrics.ts to report to Prometheus**

In `apps/api/src/services/queue-metrics.ts`, import and update the Prometheus metrics:

```ts
import { bullmqJobDuration, bullmqJobsTotal } from "./prometheus";
```

Update `recordJobCompleted`:

```ts
export function recordJobCompleted(queueName: string, durationMs: number): void {
  const s = getOrCreate(queueName);
  s.completed++;
  s.durations.push(durationMs);
  if (s.durations.length > MAX_DURATIONS) {
    s.durations.splice(0, s.durations.length - MAX_DURATIONS);
  }
  bullmqJobsTotal.inc({ queue: queueName, status: "completed" });
  bullmqJobDuration.observe({ queue: queueName }, durationMs);
}
```

Update `recordJobFailed`:

```ts
export function recordJobFailed(queueName: string): void {
  getOrCreate(queueName).failed++;
  bullmqJobsTotal.inc({ queue: queueName, status: "failed" });
}
```

**Step 3: Update queue depth gauge on summary request**

In `metrics-summary.ts`, update queue depth gauges when fetching counts:

```ts
import { bullmqQueueDepth } from "./prometheus";

// Inside getQueueSummary(), after getting counts:
if (queue) {
  try {
    const counts = await queue.getJobCounts("waiting", "active", "delayed");
    waiting = counts.waiting ?? 0;
    active = counts.active ?? 0;
    delayed = counts.delayed ?? 0;
    bullmqQueueDepth.set({ queue: name, state: "waiting" }, waiting);
    bullmqQueueDepth.set({ queue: name, state: "active" }, active);
    bullmqQueueDepth.set({ queue: name, state: "delayed" }, delayed);
  } catch {
    // Redis might be unavailable
  }
}
```

**Step 4: Commit**

```
Add BullMQ metrics to Prometheus export (BLI-69)
```

---

### Task 15: Write test for queue metrics

**Files:**
- Create: `apps/api/__tests__/queue-metrics.test.ts`

**Step 1: Write the test**

```ts
import { describe, expect, it } from "vitest";
import { getQueueStats, percentile, recordJobCompleted, recordJobFailed } from "../src/services/queue-metrics";

describe("queue-metrics", () => {
  it("records completed jobs with duration", () => {
    recordJobCompleted("test-queue", 100);
    recordJobCompleted("test-queue", 200);
    recordJobCompleted("test-queue", 300);

    const stats = getQueueStats().get("test-queue");
    expect(stats).toBeDefined();
    expect(stats!.completed).toBeGreaterThanOrEqual(3);
    expect(stats!.durations).toContain(100);
    expect(stats!.durations).toContain(200);
    expect(stats!.durations).toContain(300);
  });

  it("records failed jobs", () => {
    recordJobFailed("fail-queue");
    recordJobFailed("fail-queue");

    const stats = getQueueStats().get("fail-queue");
    expect(stats).toBeDefined();
    expect(stats!.failed).toBeGreaterThanOrEqual(2);
  });

  it("calculates percentiles correctly", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 0.5)).toBe(50);
    expect(percentile(values, 0.95)).toBe(100);
    expect(percentile([], 0.5)).toBe(0);
  });
});
```

**Step 2: Run tests**

Run: `pnpm --filter @repo/api test`

Expected: All pass.

**Step 3: Commit**

```
Add queue metrics tests (BLI-69)
```

---

### Task 16: Final verification

**Step 1: Run typecheck**

Run: `pnpm --filter @repo/api typecheck`

Expected: 0 errors.

**Step 2: Run biome**

Run: `npx @biomejs/biome check .`

Expected: 0 errors.

**Step 3: Run all tests**

Run: `pnpm --filter @repo/api test`

Expected: All pass.

**Step 4: Check data export**

Read `apps/api/src/services/data-export.ts` — verify new columns (`targetUserId`, `targetGroupId`, `dbQueryCount`, `dbDurationMs`) don't need to be included in GDPR data export. These are operational metrics, not user content — should be excluded.

**Step 5: Update architecture doc**

Add milestone 2a to `docs/architecture/instrumentation.md` — mark as complete with summary of what was added.
