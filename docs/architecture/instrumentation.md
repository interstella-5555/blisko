# Instrumentation & Observability

> v1 — AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-11 — Added `metrics.ai_calls` sibling table for per-call OpenAI cost tracking (BLI-174). See `ai-cost-tracking.md`.

## Terminology & Product Alignment

| PRODUCT.md term | Code term | Metrics term |
|-----------------|-----------|-------------|
| Ping | Wave (`waves.send`, `waves.respond`) | `endpoint: "waves.send"` in `request_events` |
| Profile match (%) | Connection analysis | `endpoint: "profiles.getNearby"`, `targetUserId` |
| Status match | Status matching job | BullMQ queue metrics (`bullmq_jobs_total`) |
| Nearby / Map | `profiles.getNearby` | `endpoint: "profiles.getNearby"` |
| Group | Group conversation | `targetGroupId` column on `request_events` |

## Data Storage

#### What

Metrics live in a separate PostgreSQL schema (`metrics`) alongside the application database. Two tables: `request_events` (raw per-request data) and `slo_targets` (performance thresholds).

#### Why

Separate schema isolates observability data from application data. Different retention policies, different query patterns, different access controls. Ready for future extraction to a dedicated database without touching application tables.

#### Config

Schema created via Drizzle migration: `const metricsSchema = pgSchema("metrics")`.

### `metrics.request_events`

Raw per-request events. Target retention: 30 days.

| Column | Type | Nullable | Source |
|--------|------|----------|--------|
| `id` | serial PK | no | Auto-increment |
| `timestamp` | timestamptz | no | `new Date()` at event creation |
| `request_id` | text | no | `crypto.randomUUID()`, returned in `X-Request-Id` response header |
| `method` | text | no | `c.req.method` (GET/POST) |
| `endpoint` | text | no | tRPC: procedure name (`waves.send`), HTTP: path (`/api/auth/get-session`) |
| `user_id` | text | yes | From auth context via `requestMeta` WeakMap. Null for pre-auth requests. |
| `duration_ms` | integer | no | `performance.now()` start/end difference, rounded to nearest ms |
| `status_code` | smallint | no | HTTP status. 500 if handler threw. |
| `app_version` | text | yes | `X-App-Version` request header |
| `platform` | text | yes | Parsed from User-Agent: `iOS 18.2`, `Android 15` |
| `auth_provider` | text | yes | Not currently populated (reserved for email-otp/google/apple/linkedin/facebook) |
| `session_id` | text | yes | From auth context via `requestMeta` WeakMap |
| `ip_hash` | text | yes | `SHA256(clientIp + IP_HASH_SALT)` using Bun's CryptoHasher. Never raw IP. |
| `user_agent` | text | yes | Truncated to 200 chars |
| `error_message` | text | yes | Truncated to 200 chars, errors only |
| `target_user_id` | text | yes | Set by procedures acting on another user (waves, messages, blocks) via `setTargetUserId()` |
| `target_group_id` | text | yes | Set by group procedures via `setTargetGroupId()` |
| `db_query_count` | integer | yes | Count of DB queries in this request (from `queryTracker` AsyncLocalStorage) |
| `db_duration_ms` | integer | yes | Total DB time in this request (from `queryTracker`) |

**Indexes:** `(timestamp)`, `(endpoint, timestamp)`, `(user_id, timestamp)`, `(target_user_id, timestamp)`, `(target_group_id)`.

### `metrics.slo_targets`

Performance targets for SLO breach detection.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `id` | serial PK | no | |
| `endpoint` | text | yes | Null = global target applying to all endpoints |
| `metric_type` | text | no | `'p95'`, `'p99'`, or `'error_rate'` |
| `threshold_ms` | integer | yes | For latency targets (e.g. 500 for p95 < 500ms) |
| `threshold_pct` | numeric | yes | For error_rate (0-100, e.g. 5.0 for < 5%) |
| `created_at` | timestamptz | yes | Defaults to now |

**Default SLO targets:** p95 < 500ms global, error_rate < 5% global.

### `metrics.ai_calls`

Per-call OpenAI telemetry. Every Vercel AI SDK call through `withAiLogging()` is logged here. 7-day retention, batch-flushed every 15s via the `flush-ai-calls` maintenance job. Schema and indexes documented in `database.md`. Full data flow, wrapper design, and admin dashboard in `ai-cost-tracking.md`.

Key columns: `job_name`, `model`, `prompt_tokens`, `completion_tokens`, `estimated_cost_usd`, `user_id`, `target_user_id`, `duration_ms`, `status`, `error_message`. User references are nullified on GDPR anonymization — same pattern as `request_events`.

### Not implemented: `daily_summaries`

The design doc planned a `daily_summaries` table for aggregated data kept forever, but it is not yet in the schema. Raw `request_events` data is the only storage currently.

## Data Collection

#### What

A single Hono middleware (`metricsMiddleware()` from `apps/api/src/services/metrics.ts`) wraps every request. It starts a `performance.now()` timer, creates a `requestId`, runs the handler inside an `AsyncLocalStorage` context for query tracking, then pushes a complete event to an in-memory buffer.

#### Why

Single middleware means every request is instrumented automatically — no per-route opt-in. Buffer-then-batch-insert avoids per-request DB writes which would double query count and add latency to every response.

#### Config

- **Buffer flush threshold:** 500 items (flushes immediately when reached)
- **Buffer flush interval:** 10 seconds (timer-based)
- **Buffer hard cap:** 5000 items
- **Skipped paths:** `/metrics`, `/api/metrics/summary` (self-referential, would create infinite growth)

### Endpoint Naming Convention

- **tRPC procedures:** Strip `/trpc/` prefix, use procedure name directly. `POST /trpc/waves.send` becomes `waves.send`.
- **HTTP routes:** Use raw path. `GET /api/auth/get-session` stays as `/api/auth/get-session`.

### Data Sources

| Field | How collected |
|-------|---------------|
| `durationMs` | `performance.now()` delta between middleware entry and `finally` block |
| `requestId` | `crypto.randomUUID()`, set as `X-Request-Id` response header and stored in `requestMeta` WeakMap |
| `userId` | tRPC context sets `meta.userId` on the `requestMeta` WeakMap keyed by the raw `Request` object |
| `sessionId` | Same mechanism as `userId` |
| `appVersion` | `X-App-Version` request header (set by mobile client) |
| `platform` | Regex parse of User-Agent: `/iOS\s+([\d.]+)/` or `/Android\s+([\d.]+)/` |
| `ipHash` | `SHA256(ip + IP_HASH_SALT)` via `Bun.CryptoHasher`. IP from `X-Forwarded-For` (first entry) or `X-Real-IP`. |
| `errorMessage` | Caught in `try/catch` wrapping `next()`, truncated to 200 chars |
| `targetUserId` | Set explicitly by procedures via `setTargetUserId(ctx.req, id)` |
| `targetGroupId` | Set explicitly by procedures via `setTargetGroupId(ctx.req, id)` |
| `dbQueryCount` / `dbDurationMs` | `AsyncLocalStorage` context + `recordQuery(durationMs)` called from the DB query monkey-patch |

### Request Metadata Sharing (Hono <-> tRPC)

A `WeakMap<Request, metadata>` (`requestMeta`) bridges the Hono middleware and tRPC context. The Hono middleware creates the entry with `requestId`; tRPC middleware enriches it with `userId`, `sessionId`; procedures add `targetUserId`/`targetGroupId`. The `finally` block reads it all back. Using `WeakMap` ensures automatic cleanup when the `Request` is garbage collected.

### Buffer Safety

- **Hard cap:** When buffer reaches 5000 items, the oldest 10% (500 events) are dropped with a `console.warn`. Prevents unbounded memory growth if flush fails repeatedly.
- **Flush isolation:** `try/catch` around the DB insert — a flush failure does not crash the server or affect request handling.
- **Graceful shutdown:** `stopFlushTimer()` clears the interval; `flushMetrics()` is called for a final drain.
- **Flush guard:** `isFlushing` boolean prevents concurrent flush attempts (buffer is spliced before insert, so no double-processing).

## Query Tracking

#### What

`AsyncLocalStorage<QueryContext>` in `apps/api/src/services/query-tracker.ts`. Each request runs inside `queryTracker.run(context, () => next())`. Any DB query calls `recordQuery(durationMs)` which increments `queryCount` and accumulates `dbDurationMs` on the current context.

#### Why

Per-request DB query count and total DB time enable detecting N+1 query patterns and slow-DB-bound endpoints without external APM tooling.

#### Config

- Context shape: `{ queryCount: number, dbDurationMs: number }`
- No maximum — counters grow for the lifetime of the request.

## API Endpoints

### `GET /api/metrics/summary`

AI-readable JSON system health overview. Rate limited: 30 req/min per IP.

**Query parameter:** `?window=24` (hours, default 24).

**Response shape:**

```json
{
  "windowHours": 24,
  "since": "2026-04-05T10:00:00.000Z",
  "overview": {
    "totalRequests": 1423,
    "errorRate": 2.01,
    "p50": 45,
    "p95": 210,
    "p99": 890
  },
  "slowest": [
    { "endpoint": "messages.getConversations", "requestCount": 89, "p95": 450, "p50": 120 }
  ],
  "errors": [
    { "endpoint": "waves.send", "statusCode": 500, "errorMessage": "TIMEOUT", "errorCount": 3 }
  ],
  "sloBreaches": [
    { "endpoint": "profiles.me", "metricType": "p95", "threshold": 500, "actual": 640 }
  ],
  "queues": [
    { "name": "main", "completed": 450, "failed": 2, "waiting": 3, "active": 1, "delayed": 0, "avgDurationMs": 1200, "p95DurationMs": 3500 }
  ],
  "websocket": {
    "activeConnections": 12,
    "activeSubscriptions": 48,
    "auth": { "success": 200, "failed": 3 },
    "inbound": { "auth": 200, "typing": 1500, "subscribe": 50 },
    "outbound": { "newMessage": 3200, "typing": 1400 },
    "rateLimitHits": { "global": 0, "typing": 5 }
  }
}
```

Sections: `overview` (aggregated from `request_events`), `slowest` (top 10 by p95), `errors` (top 10 by count, status >= 500), `sloBreaches` (compared against `slo_targets` table), `queues` (BullMQ in-memory stats + live depth from Redis), `websocket` (in-memory counters).

### `GET /metrics`

Prometheus text format via `prom-client`. Rate limited: 30 req/min per IP.

**HTTP metrics:**

| Metric | Type | Labels | Buckets |
|--------|------|--------|---------|
| `http_request_duration_ms` | Histogram | `method`, `endpoint`, `status_code` | 10, 25, 50, 100, 200, 500, 1000, 2500, 5000 |
| `http_requests_total` | Counter | `method`, `endpoint`, `status_code` | — |

**BullMQ metrics:**

| Metric | Type | Labels | Buckets |
|--------|------|--------|---------|
| `bullmq_jobs_total` | Counter | `queue`, `status` | — |
| `bullmq_job_duration_ms` | Histogram | `queue` | 100, 500, 1000, 2500, 5000, 10000, 30000, 60000 |
| `bullmq_queue_depth` | Gauge | `queue`, `state` | — |

**WebSocket metrics:**

| Metric | Type | Labels |
|--------|------|--------|
| `ws_connections_active` | Gauge | — |
| `ws_subscriptions_active` | Gauge | — |
| `ws_auth_total` | Counter | `result` (success/failed) |
| `ws_events_inbound_total` | Counter | `type` (auth/typing/subscribe) |
| `ws_events_outbound_total` | Counter | `event_type` (newMessage/typing/newWave/...) |
| `ws_rate_limit_hits_total` | Counter | `limit` (global/typing) |

## BullMQ Queue Metrics

In-memory stats tracked in `apps/api/src/services/queue-metrics.ts`. Each completed job records its duration; failed jobs increment a counter. Stats are per queue name.

- **Duration buffer:** Last 1000 durations kept (ring buffer with splice). Used for percentile calculations in `/api/metrics/summary`.
- **Prometheus:** `recordJobCompleted()` and `recordJobFailed()` update both in-memory stats and Prometheus counters/histograms.
- **Live queue depth:** Fetched from Redis (`queue.getJobCounts()`) on each `/api/metrics/summary` call. Updates `bullmq_queue_depth` gauge.

## WebSocket Metrics

In-memory counters in `apps/api/src/services/ws-metrics.ts`. Every WS event (connect, disconnect, auth, inbound, outbound, rate limit hit) updates both local counters and Prometheus gauges/counters.

Hooks are wired into `apps/api/src/ws/handler.ts`:
- **open/close:** `wsConnected()` / `wsDisconnected(subscriptionCount)` — adjusts active connection and subscription gauges.
- **auth:** `wsAuthResult(success)` — tracks success/failure.
- **inbound:** `wsInbound(type)` — counts by message type (auth, typing, subscribe).
- **outbound:** `wsOutbound(eventType, recipientCount)` — counts by event type, multiplied by recipients.
- **rate limit:** `wsRateLimitHit(limitName)` — counts dropped messages by limit category (global, typing).

## Mobile Error Reporting

The mobile app extracts the `X-Request-Id` header from API responses and displays it on error screens. Users can report this ID for debugging — it maps directly to a row in `metrics.request_events` for exact request tracing.

## Error Tracking (Bugsink)

Server-side crashes are captured by `@sentry/bun` and sent to a self-hosted Bugsink instance (Sentry-SDK-compatible, separate Railway project — see `infrastructure.md`). Bugsink has a project per app: `blisko-api` and `blisko-chatbot` so far; mobile/admin/website/design will follow as separate tickets.

Bugsink complements `metrics.request_events` and Prometheus, it does not replace them. Request events answer "what happened across the fleet" (latencies, error rates, SLO breaches). Bugsink answers "give me the stack trace and full request context for this one crash".

### Init

| App | Module | Init point |
|-----|--------|------------|
| `apps/api` | `src/services/sentry.ts` | First import in `src/index.ts` (before `Hono`) |
| `apps/chatbot` | `src/sentry.ts` | First import in `src/index.ts` (before any other module) |

`initSentry()` is a no-op when `SENTRY_DSN` is unset, so local dev stays silent unless the env var is explicitly exported.

### Init contract

| Option | Value | Why |
|--------|-------|-----|
| `tracesSampleRate` | `0` | Bugsink does not support traces. Performance is covered by Prometheus + `request_events`. |
| `sendDefaultPii` | `true` | Bugsink is self-hosted, so the per-event `request.headers`, query string, and user IP stay inside our infra. Improves debug context. |
| `environment` | `RAILWAY_ENVIRONMENT_NAME` or `"local"` | Lets us filter by Railway env in Bugsink UI. |
| `release` | `RAILWAY_DEPLOYMENT_ID` if present | Tracks first-seen / regressions per deploy. |
| `beforeSend` (api only) | Strips `authorization`, `cookie`, `x-internal-secret` headers | `sendDefaultPii: true` would otherwise leak session bearer tokens and the shared secret protecting `POST /internal/ai-log`. Chatbot doesn't expose HTTP, so no header scrubbing needed. |

### Capture sites

**`apps/api`:**

| Site | File | Tags |
|------|------|------|
| Hono `app.onError` (unhandled HTTP errors outside tRPC) | `src/index.ts` | `source: hono.onError`, `method`, `path` |
| `trpcServer` `onError` callback, filtered to `INTERNAL_SERVER_ERROR` | `src/index.ts` | `source: trpc`, `path`, `type` |
| BullMQ `worker.on("failed")` after final retry attempt | `src/services/queue-shared.ts` | `queue`, `jobType`; extras: `jobId`, `attemptsMade` |

The tRPC filter skips client errors (`BAD_REQUEST`, `UNAUTHORIZED`, validation, etc.) so the dashboard isn't drowned in expected user mistakes. Only server-side bugs surface.

The BullMQ guard checks `attemptsMade >= opts.attempts` before sending — intermediate failures BullMQ will retry are not reported, only true terminal failures.

**`apps/chatbot`:**

| Site | Notes |
|------|-------|
| `handleWave` catch (terminal) | Tag `source: chatbot.handleWave`, includes bot name |
| `handleWave` opening-message catch (non-terminal) | Tag `source: chatbot.opening` |
| `handleMessage` catch | Tag `source: chatbot.handleMessage` |
| `pollWaves` / `pollMessages` catch | Tag `source: chatbot.pollWaves` / `chatbot.pollMessages` |
| `main().catch` (fatal, before `process.exit(1)`) | Tag `source: chatbot.main`. Awaits `Sentry.flush(2000)` before exit, otherwise the in-flight event is dropped with the process. |

### Out of scope

- No source maps yet — stack traces from `bun build` output will be against the bundled file. Add via `bugsink-cli` (Sentry-CLI compatible) when it becomes worth the effort.
- No release automation beyond passing `RAILWAY_DEPLOYMENT_ID` — no source-map upload step in CI.
- No tracing / performance — see `tracesSampleRate: 0` rationale above.
- WebSocket handler errors are not currently captured (most paths swallow via existing `wsAuthResult("failed")` / metric counters). Add specific `captureException` calls if a class of WS errors becomes a problem.

### Bugsink instance

- URL: `https://bugsink-production-2c92.up.railway.app/`
- Railway project ID: `ed637dd9-bcb7-4f0b-9a3e-2827934ade1a` (separate from the main `blisko` project so the error tracker survives outages of what it monitors)
- Per-project DSN lives only in Railway env vars on each app service. Never commit DSNs to the repo or to `apps/api/.env*`.

## GDPR / Compliance Alignment

- 30-day raw event retention satisfies GDPR Art. 32/33 audit trail requirements.
- IP addresses stored as SHA256 hash (with salt from `IP_HASH_SALT` env var), never raw — privacy by design.
- `userId + timestamp + endpoint` enables Art. 15 data access auditing.
- `targetUserId` enables "who accessed my data" queries (required for GDPR transparency).

## Impact Map

If you change this system, also check:

- **`apps/api/src/services/metrics.ts`** — Core middleware. Adding new metadata fields requires updating the `requestMeta` WeakMap interface, the `pushEvent()` call, and the `NewRequestEvent` schema type.
- **`apps/api/src/db/schema.ts`** — `requestEvents` and `sloTargets` tables in the `metrics` schema. Adding columns requires a migration.
- **`apps/api/src/services/prometheus.ts`** — All Prometheus metric definitions. New metrics need new exports + registration with the shared `registry`.
- **`apps/api/src/services/metrics-summary.ts`** — The `/api/metrics/summary` JSON builder. New data sources need new sections.
- **`apps/api/src/services/query-tracker.ts`** — DB query tracking via AsyncLocalStorage. Changes to the DB driver's instrumentation point affect accuracy.
- **`apps/api/src/services/queue-metrics.ts`** — BullMQ job stats. New queues are tracked automatically (by name).
- **`apps/api/src/services/ws-metrics.ts`** — WebSocket counters. New WS event types should call `wsInbound()`/`wsOutbound()`.
- **`apps/api/src/ws/handler.ts`** — WS metric hooks. New message types need instrumentation calls.
- **`apps/api/src/services/data-export.ts`** — GDPR data export. If metrics schema stores new PII, export service may need updating.
- **`docs/architecture/ai-cost-tracking.md`** — AI call logging pipeline, pricing map, and admin dashboard. New AI functions must be wrapped via `withAiLogging()`.
- **`apps/api/src/services/ai-log.ts` / `ai-log-buffer.ts`** — `withAiLogging` wrapper + `createBatchBuffer`-based flush pipeline.
- **`apps/api/src/services/sentry.ts` / `apps/chatbot/src/sentry.ts`** — Bugsink (Sentry SDK) init. New apps wired to Bugsink need their own Bugsink project (`POST /api/canonical/0/projects/`), DSN injected as `SENTRY_DSN` on the Railway service, and the init module imported first in their entrypoint.
