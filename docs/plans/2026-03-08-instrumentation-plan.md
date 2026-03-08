# Instrumentation & Observability — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add API request metrics (latency, errors, per-endpoint) with buffered Postgres storage, AI-readable summary endpoint, Prometheus endpoint, and mobile request ID error reporting.

**Architecture:** Hono middleware measures request timing + metadata → in-memory buffer → batch INSERT to `metrics` Postgres schema every 10s/500 items. tRPC context enriches events with userId. AI queries system health via `/api/metrics/summary`. Mobile displays `X-Request-Id` on error screens.

**Tech Stack:** Hono middleware, Drizzle ORM `pgSchema`, `prom-client`, `crypto.randomUUID()`

**Design Doc:** `docs/plans/2026-03-08-instrumentation-design.md`

---

## Milestone 1a: Foundation (schema + module + middleware)

### Task 1: Create metrics schema file

**Files:**
- Create: `apps/api/src/db/metrics-schema.ts`

**Step 1: Create the schema file**

```ts
import { index, integer, numeric, pgSchema, serial, smallint, text, timestamp } from "drizzle-orm/pg-core";

export const metricsSchema = pgSchema("metrics");

export const requestEvents = metricsSchema.table(
  "request_events",
  {
    id: serial("id").primaryKey(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    requestId: text("request_id").notNull(),
    method: text("method").notNull(),
    endpoint: text("endpoint").notNull(),
    userId: text("user_id"),
    durationMs: integer("duration_ms").notNull(),
    statusCode: smallint("status_code").notNull(),
    appVersion: text("app_version"),
    platform: text("platform"),
    authProvider: text("auth_provider"),
    sessionId: text("session_id"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("idx_re_timestamp").on(table.timestamp),
    index("idx_re_endpoint_ts").on(table.endpoint, table.timestamp),
    index("idx_re_user_ts").on(table.userId, table.timestamp),
  ],
);

export const sloTargets = metricsSchema.table("slo_targets", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint"),
  metricType: text("metric_type").notNull(),
  thresholdMs: integer("threshold_ms"),
  thresholdPct: numeric("threshold_pct"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type NewRequestEvent = typeof requestEvents.$inferInsert;
```

**Step 2: Update drizzle config to include new schema**

Modify `apps/api/drizzle.config.ts` — change `schema` from a string to an array:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./src/db/schema.ts", "./src/db/metrics-schema.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

**Step 3: Generate migration**

```bash
cd apps/api && npx drizzle-kit generate --name=add-metrics-schema
```

**Step 4: Review generated SQL**

Check `apps/api/drizzle/0008_add-metrics-schema.sql`. It should contain:
- `CREATE SCHEMA "metrics"`
- `CREATE TABLE "metrics"."request_events"` with all columns
- `CREATE TABLE "metrics"."slo_targets"`
- Three indexes on `request_events`

If drizzle-kit doesn't generate `CREATE SCHEMA`, create a custom migration:
```bash
cd apps/api && npx drizzle-kit generate --custom --name=add-metrics-schema
```
And write the SQL manually with `CREATE SCHEMA IF NOT EXISTS "metrics";` before the table definitions.

**Step 5: Apply migration locally**

```bash
cd apps/api && npx drizzle-kit migrate
```

**Step 6: Commit**

```
Add metrics schema with request_events and slo_targets tables (BLI-69)
```

---

### Task 2: Create metrics service module

**Files:**
- Create: `apps/api/src/services/metrics.ts`
- Create: `apps/api/__tests__/metrics.test.ts`

**Step 1: Write buffer unit tests**

```ts
// apps/api/__tests__/metrics.test.ts
import { describe, expect, it, beforeEach, mock } from "bun:test";

// We'll test buffer logic by importing internals
// For now, test the public API
describe("metrics buffer", () => {
  it("getBufferSize returns 0 initially", async () => {
    const { getBufferSize } = await import("@/services/metrics");
    expect(getBufferSize()).toBe(0);
  });
});
```

Run: `cd apps/api && bun test __tests__/metrics.test.ts`

Expected: PASS (basic sanity check — full buffer tests come after implementation)

**Step 2: Implement the metrics service module**

Create `apps/api/src/services/metrics.ts`:

```ts
import type { Context, MiddlewareHandler } from "hono";
import { db } from "@/db";
import { requestEvents, type NewRequestEvent } from "@/db/metrics-schema";

// --- Config ---

const BUFFER_HARD_CAP = 5000;
const FLUSH_THRESHOLD = 500;
const FLUSH_INTERVAL_MS = 10_000;
const SKIP_PATHS = new Set(["/metrics", "/api/metrics/summary"]);

// --- Buffer state ---

let buffer: NewRequestEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let isFlushing = false;

// --- Buffer management ---

export function getBufferSize(): number {
  return buffer.length;
}

export async function flushMetrics(): Promise<number> {
  if (buffer.length === 0 || isFlushing) return 0;
  isFlushing = true;
  const batch = buffer.splice(0);
  try {
    await db.insert(requestEvents).values(batch);
    return batch.length;
  } catch (error) {
    console.warn(
      `[metrics] flush failed (${batch.length} events):`,
      error instanceof Error ? error.message : error,
    );
    // Drop on failure — prevents memory growth when DB is unhealthy
    return 0;
  } finally {
    isFlushing = false;
  }
}

function pushEvent(event: NewRequestEvent): void {
  if (buffer.length >= BUFFER_HARD_CAP) {
    const dropCount = Math.floor(BUFFER_HARD_CAP * 0.1);
    buffer.splice(0, dropCount);
    console.warn(`[metrics] buffer at cap, dropped ${dropCount} oldest events`);
  }
  buffer.push(event);
  if (buffer.length >= FLUSH_THRESHOLD) {
    flushMetrics();
  }
}

function startFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushMetrics();
  }, FLUSH_INTERVAL_MS);
}

export function stopFlushTimer(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

// --- Request metadata sharing (Hono ↔ tRPC) ---

export const requestMeta = new WeakMap<
  Request,
  {
    requestId: string;
    userId?: string;
    sessionId?: string;
  }
>();

// --- Helpers ---

function extractEndpoint(c: Context): string {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith("/trpc/")) {
    return path.slice(6);
  }
  return path;
}

function parsePlatform(ua: string | undefined): string | null {
  if (!ua) return null;
  const iosMatch = ua.match(/iOS\s+([\d.]+)/);
  if (iosMatch) return `iOS ${iosMatch[1]}`;
  const androidMatch = ua.match(/Android\s+([\d.]+)/);
  if (androidMatch) return `Android ${androidMatch[1]}`;
  return null;
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT || "dev-salt";
  return new Bun.CryptoHasher("sha256").update(ip + salt).digest("hex");
}

function getClientIp(c: Context): string | null {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? null;
}

function truncate(str: string | undefined, max: number): string | null {
  if (!str) return null;
  return str.length > max ? str.slice(0, max) : str;
}

// --- Hono Middleware ---

export function metricsMiddleware(): MiddlewareHandler {
  startFlushTimer();
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
    try {
      await next();
    } catch (err) {
      errMsg = truncate(err instanceof Error ? err.message : String(err), 200);
      throw err;
    } finally {
      const durationMs = Math.round(performance.now() - start);
      const meta = requestMeta.get(c.req.raw);

      pushEvent({
        timestamp: new Date(),
        requestId,
        method: c.req.method,
        endpoint: extractEndpoint(c),
        userId: meta?.userId ?? null,
        durationMs,
        statusCode: errMsg ? 500 : c.res.status,
        appVersion: c.req.header("x-app-version") ?? null,
        platform: parsePlatform(c.req.header("user-agent")),
        authProvider: null,
        sessionId: meta?.sessionId ?? null,
        ipHash: hashIp(getClientIp(c)),
        userAgent: truncate(c.req.header("user-agent"), 200),
        errorMessage: errMsg,
      });
      requestMeta.delete(c.req.raw);
    }
  };
}
```

**Step 3: Run tests**

```bash
cd apps/api && bun test __tests__/metrics.test.ts
```

**Step 4: Typecheck**

```bash
pnpm --filter @repo/api typecheck
```

**Step 5: Commit**

```
Add metrics service module with buffered event collection (BLI-69)
```

---

### Task 3: Wire up middleware and enrich with userId

**Files:**
- Modify: `apps/api/src/index.ts` (add middleware import + registration)
- Modify: `apps/api/src/trpc/context.ts` (enrich requestMeta with userId)

**Step 1: Add metrics middleware to index.ts**

Add import at top of `apps/api/src/index.ts`:
```ts
import { metricsMiddleware } from "./services/metrics";
```

Register as the FIRST middleware (before logger and cors), after `const app = new Hono();`:
```ts
const app = new Hono();

// Metrics — must be first to capture full request duration
app.use("*", metricsMiddleware());

// Middleware
app.use("*", logger());
app.use("*", cors({ ... }));
```

**Step 2: Enrich tRPC context with userId**

In `apps/api/src/trpc/context.ts`, add import:
```ts
import { requestMeta } from "@/services/metrics";
```

After resolving `userId` (before `return`), add enrichment:
```ts
  // Enrich metrics event with userId
  if (userId) {
    const meta = requestMeta.get(opts.req);
    if (meta) {
      meta.userId = userId;
    }
  }

  return {
    userId,
    db,
  };
```

**Step 3: Add IP_HASH_SALT to .env**

Add to `apps/api/.env`:
```
IP_HASH_SALT=dev-salt-change-in-production
```

**Step 4: Test locally**

Start the API (`cd apps/api && pnpm dev`), make a request to `/health`, check:
1. Response has `X-Request-Id` header
2. No errors in console
3. After 10s, `[metrics]` messages should NOT appear (means flush worked silently)

**Step 5: Typecheck + lint**

```bash
pnpm --filter @repo/api typecheck
npx @biomejs/biome check apps/api/src
```

**Step 6: Commit**

```
Wire up metrics middleware and enrich events with userId (BLI-69)
```

---

### Task 4: Set IP_HASH_SALT on Railway

**Step 1: Generate a random salt**

```bash
openssl rand -hex 32
```

**Step 2: Set on Railway**

Use Railway MCP tool `set-variables` to add `IP_HASH_SALT` to the api service.

**Step 3: Redeploy**

Push to main or trigger redeploy to apply the new env var.

---

## Milestone 1b: API Endpoints

### Task 5: Seed default SLO targets

**Files:**
- Create: `apps/api/scripts/seed-slo-targets.ts`
- Modify: root `package.json` (add script)
- Modify: `apps/api/package.json` (add script)

**Step 1: Create seed script**

```ts
// apps/api/scripts/seed-slo-targets.ts
import { db } from "../src/db";
import { sloTargets } from "../src/db/metrics-schema";

const defaults = [
  // Global: all endpoints should respond under 500ms at p95
  { endpoint: null, metricType: "p95", thresholdMs: 500 },
  // Global: error rate under 5%
  { endpoint: null, metricType: "error_rate", thresholdPct: "5" },
  // Hot paths
  { endpoint: "profiles.me", metricType: "p95", thresholdMs: 200 },
  { endpoint: "profiles.getNearbyUsers", metricType: "p95", thresholdMs: 300 },
  { endpoint: "messages.getConversations", metricType: "p95", thresholdMs: 300 },
  { endpoint: "waves.send", metricType: "p95", thresholdMs: 200 },
  { endpoint: "waves.getReceived", metricType: "p95", thresholdMs: 200 },
];

console.log("Seeding SLO targets...");
for (const target of defaults) {
  await db.insert(sloTargets).values(target).onConflictDoNothing();
  console.log(`  ${target.endpoint ?? "(global)"} ${target.metricType} ${target.thresholdMs ?? target.thresholdPct}`);
}
console.log("Done.");
process.exit(0);
```

**Step 2: Add scripts**

In `apps/api/package.json`:
```json
"seed:slo": "bun run scripts/seed-slo-targets.ts"
```

In root `package.json`:
```json
"api:seed:slo": "pnpm --filter @repo/api seed:slo"
```

**Step 3: Run locally**

```bash
pnpm api:seed:slo
```

**Step 4: Run on production**

Either via Railway console or by including in the pre-deploy command for a one-time run.

**Step 5: Commit**

```
Add SLO targets seed script with default thresholds (BLI-69)
```

---

### Task 6: Add /api/metrics/summary endpoint

**Files:**
- Modify: `apps/api/src/index.ts` (add route)
- Create: `apps/api/src/services/metrics-summary.ts` (query logic)

**Step 1: Create summary query module**

```ts
// apps/api/src/services/metrics-summary.ts
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requestEvents, sloTargets } from "@/db/metrics-schema";

export async function getMetricsSummary(periodMinutes = 60) {
  const since = new Date(Date.now() - periodMinutes * 60 * 1000).toISOString();

  // Overview: total, error rate, percentiles
  const [overview] = await db.execute(sql`
    SELECT
      count(*)::int AS "totalRequests",
      round(count(*) FILTER (WHERE status_code >= 400)::numeric / GREATEST(count(*), 1) * 100, 2) AS "errorRate",
      coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms)::int, 0) AS p50,
      coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::int, 0) AS p95,
      coalesce(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms)::int, 0) AS p99
    FROM metrics.request_events
    WHERE timestamp > ${since}::timestamptz
  `);

  // Slowest endpoints by p95
  const slowest = await db.execute(sql`
    SELECT
      endpoint,
      count(*)::int AS count,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::int AS p95
    FROM metrics.request_events
    WHERE timestamp > ${since}::timestamptz
    GROUP BY endpoint
    ORDER BY p95 DESC
    LIMIT 10
  `);

  // Endpoints with errors
  const errors = await db.execute(sql`
    SELECT
      endpoint,
      count(*)::int AS count,
      (array_agg(error_message ORDER BY timestamp DESC))[1] AS "lastError"
    FROM metrics.request_events
    WHERE timestamp > ${since}::timestamptz AND status_code >= 400
    GROUP BY endpoint
    ORDER BY count DESC
    LIMIT 10
  `);

  // SLO breaches
  const sloBreaches = await db.execute(sql`
    SELECT
      st.endpoint,
      st.metric_type AS "metricType",
      st.threshold_ms AS "thresholdMs",
      percentile_cont(
        CASE st.metric_type WHEN 'p95' THEN 0.95 WHEN 'p99' THEN 0.99 ELSE 0.95 END
      ) WITHIN GROUP (ORDER BY re.duration_ms)::int AS actual
    FROM metrics.slo_targets st
    CROSS JOIN metrics.request_events re
    WHERE re.timestamp > ${since}::timestamptz
      AND st.metric_type IN ('p95', 'p99')
      AND (st.endpoint IS NULL OR re.endpoint = st.endpoint)
    GROUP BY st.id, st.endpoint, st.metric_type, st.threshold_ms
    HAVING percentile_cont(
      CASE st.metric_type WHEN 'p95' THEN 0.95 WHEN 'p99' THEN 0.99 ELSE 0.95 END
    ) WITHIN GROUP (ORDER BY re.duration_ms) > st.threshold_ms
  `);

  return {
    period: `last_${periodMinutes}m`,
    overview: overview ?? { totalRequests: 0, errorRate: 0, p50: 0, p95: 0, p99: 0 },
    slowest,
    errors,
    sloBreaches,
  };
}
```

**Step 2: Add route in index.ts**

After the health check endpoint in `apps/api/src/index.ts`:

```ts
import { getMetricsSummary } from "./services/metrics-summary";

// Metrics summary (AI-readable, IP rate limited)
app.get("/api/metrics/summary", honoRateLimit("global"), async (c) => {
  const minutes = Number(c.req.query("minutes")) || 60;
  const summary = await getMetricsSummary(minutes);
  return c.json(summary);
});
```

**Step 3: Test locally**

```bash
curl http://localhost:3000/api/metrics/summary | jq
```

Should return JSON with overview, slowest, errors, sloBreaches arrays. Initially all zeros/empty.

**Step 4: Typecheck**

```bash
pnpm --filter @repo/api typecheck
```

**Step 5: Commit**

```
Add /api/metrics/summary endpoint for AI-readable system health (BLI-69)
```

---

### Task 7: Add /metrics Prometheus endpoint

**Files:**
- Modify: `apps/api/package.json` (add prom-client)
- Create: `apps/api/src/services/prometheus.ts`
- Modify: `apps/api/src/services/metrics.ts` (record to prom-client)
- Modify: `apps/api/src/index.ts` (add /metrics route)

**Step 1: Install prom-client**

```bash
cd apps/api && pnpm add prom-client
```

**Step 2: Create Prometheus module**

```ts
// apps/api/src/services/prometheus.ts
import { Registry, Histogram, Counter } from "prom-client";

export const register = new Registry();

export const httpDuration = new Histogram({
  name: "http_request_duration_ms",
  help: "HTTP request duration in milliseconds",
  labelNames: ["method", "endpoint", "status"] as const,
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register],
});

export const httpTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "endpoint", "status"] as const,
  registers: [register],
});
```

**Step 3: Record Prometheus metrics in middleware**

In `apps/api/src/services/metrics.ts`, add import:
```ts
import { httpDuration, httpTotal } from "./prometheus";
```

In the `finally` block of `metricsMiddleware`, after `pushEvent(...)`, add:
```ts
      const status = String(errMsg ? 500 : c.res.status);
      const endpoint = extractEndpoint(c);
      httpDuration.observe({ method: c.req.method, endpoint, status }, durationMs);
      httpTotal.inc({ method: c.req.method, endpoint, status });
```

**Step 4: Add /metrics route in index.ts**

```ts
import { register } from "./services/prometheus";

app.get("/metrics", async (c) => {
  const metrics = await register.metrics();
  return c.text(metrics, 200, { "Content-Type": register.contentType });
});
```

**Step 5: Test locally**

```bash
# Make some requests first
curl http://localhost:3000/health
curl http://localhost:3000/health
# Then check Prometheus metrics
curl http://localhost:3000/metrics
```

Should see `http_request_duration_ms_bucket`, `http_requests_total` with endpoint="/health" labels.

**Step 6: Typecheck**

```bash
pnpm --filter @repo/api typecheck
```

**Step 7: Commit**

```
Add /metrics Prometheus endpoint with request duration histogram (BLI-69)
```

---

## Milestone 1c: Mobile Error Reporting

### Task 8: Add X-App-Version header and capture requestId on errors

**Files:**
- Modify: `apps/mobile/src/lib/trpc.ts` (add X-App-Version header)
- Modify: `apps/mobile/app/(tabs)/_layout.tsx` (show requestId on error)
- Modify: `apps/mobile/app.json` or `apps/mobile/package.json` (check version source)

**Step 1: Add X-App-Version header to tRPC client**

In `apps/mobile/src/lib/trpc.ts`, modify `httpBatchLink.headers()` to include app version:

```ts
import Constants from "expo-constants";

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${getApiUrl()}/trpc`,
      async headers() {
        const baseHeaders: Record<string, string> = {};

        // App version for metrics
        const version = Constants.expoConfig?.version;
        if (version) {
          baseHeaders["x-app-version"] = version;
        }

        // Auth
        const { data } = await authClient.getSession();
        if (data?.session?.token) {
          return { ...baseHeaders, authorization: `Bearer ${data.session.token}` };
        }

        const token = await SecureStore.getItemAsync("blisko_session_token");
        return { ...baseHeaders, authorization: token ? `Bearer ${token}` : "" };
      },
    }),
  ],
});
```

**Step 2: Store last requestId from failed requests**

The tRPC `httpBatchLink` doesn't expose response headers directly to error handlers. Two approaches:

**Option A (simplest):** Add a custom `fetch` to `httpBatchLink` that captures the last `X-Request-Id` on error:

```ts
import { atom, useAtomValue } from "jotai";

export const lastRequestIdAtom = atom<string | null>(null);
// Store setter in module scope for access from fetch wrapper
let setLastRequestId: ((id: string | null) => void) | null = null;
export function registerRequestIdSetter(setter: (id: string | null) => void) {
  setLastRequestId = setter;
}

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${getApiUrl()}/trpc`,
      async headers() { /* ... same as above ... */ },
      fetch: async (url, options) => {
        const response = await fetch(url, options);
        if (!response.ok) {
          const requestId = response.headers.get("x-request-id");
          if (requestId && setLastRequestId) {
            setLastRequestId(requestId);
          }
        }
        return response;
      },
    }),
  ],
});
```

**Option B (if jotai not available):** Use a simple module-level variable:

```ts
let lastFailedRequestId: string | null = null;
export function getLastFailedRequestId() { return lastFailedRequestId; }

// In custom fetch:
fetch: async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    lastFailedRequestId = response.headers.get("x-request-id");
  }
  return response;
},
```

Check if jotai is a dependency in `apps/mobile/package.json` and choose the appropriate option.

**Step 3: Show requestId on error screen**

Modify `apps/mobile/app/(tabs)/_layout.tsx` around line 272:

```tsx
import { getLastFailedRequestId } from "@/lib/trpc"; // or use atom

// In the error JSX (around line 272):
if (isError && !hasCheckedProfile) {
  const requestId = getLastFailedRequestId();
  return (
    <View
      style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: colors.bg }}
    >
      <Text style={{ ...typ.body, color: colors.muted, marginBottom: 16, textAlign: "center" }}>
        Nie udało się połączyć z serwerem
      </Text>
      <Text style={{ ...typ.body, color: colors.accent }} onPress={() => refetch()}>
        Spróbuj ponownie
      </Text>
      {requestId && (
        <Text
          style={{ ...typ.caption, color: colors.muted, marginTop: 24, fontFamily: "monospace" }}
          selectable
        >
          ID: {requestId.slice(0, 8)}
        </Text>
      )}
    </View>
  );
}
```

The `selectable` prop lets users long-press to copy. We show only first 8 chars for readability — enough to search in the DB.

**Step 4: Test on simulator**

1. Set `EXPO_PUBLIC_API_URL` to a non-existent URL to force an error
2. Launch app → should see "Nie udało się połączyć z serwerem" with request ID below
3. Restore `EXPO_PUBLIC_API_URL` and verify normal flow works

**Step 5: Typecheck**

```bash
pnpm --filter @repo/mobile typecheck
```

**Step 6: Commit**

```
Show request ID on mobile error screens for debugging (BLI-69)
```

---

## Milestone 2a: Deeper Insight (future — tickets only)

Tasks for future implementation. Create as Linear sub-issues of BLI-69.

### Task 9: Drizzle query timing

Add Drizzle logger that records per-query timing. Add `dbQueryCount` field to `request_events`. Increment counter in a per-request context.

### Task 10: BullMQ queue metrics

Export queue health (waiting, active, failed, completed counts, avg job duration) to `/api/metrics/summary` and Prometheus.

### Task 11: Additional event fields

Add `targetUserId` (whose data was accessed), `actionType` (read/write/delete) to `request_events`. Populate in tRPC procedures that access other users' data.

---

## Milestone 2b: Intelligent Monitoring (future — tickets only)

### Task 12: WebSocket monitoring

Track active WS connections, message throughput, auth failures. Expose in summary endpoint.

### Task 13: Dependency health pings

Ping DB, Redis, S3 every 30s. Store latency in-memory. Include in summary endpoint.

### Task 14: Anomaly detection

Compare last hour vs previous hour per endpoint. Flag >100% increase in p95 latency or >50% increase in error rate.

---

## Milestone 2c: Automation + Dashboard (future — tickets only)

### Task 15: Retention cron

Scheduled job that aggregates raw events older than 30 days into `daily_summaries`, then deletes raw rows.

### Task 16: Scheduled Claude monitoring

Cron that calls `/api/metrics/summary` and reports SLO breaches to a channel (Slack/Discord/email).

### Task 17: Admin panel dashboard

Dashboard page in admin panel (BLI-63) with charts: request volume over time, latency percentiles, error rates, top slow endpoints.

---

## Verification Checklist

After completing milestones 1a–1c:

- [ ] `pnpm --filter @repo/api typecheck` passes
- [ ] `pnpm --filter @repo/mobile typecheck` passes
- [ ] `pnpm --filter @repo/api test` passes
- [ ] `curl https://api.blisko.app/health` returns 200 with `X-Request-Id` header
- [ ] `curl https://api.blisko.app/api/metrics/summary` returns valid JSON
- [ ] `curl https://api.blisko.app/metrics` returns Prometheus text format
- [ ] Mobile app shows request ID on error screens
- [ ] Railway logs show no `[metrics]` warnings (buffer not overflowing)
- [ ] `npx @biomejs/biome check .` — 0 errors
