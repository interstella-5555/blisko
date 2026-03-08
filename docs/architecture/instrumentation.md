# Instrumentation & Observability — Design

**Ticket:** [BLI-69](https://linear.app/blisko/issue/BLI-69/instrumentation-zbieranie-metryk-uzycia-api-per-user)
**Date:** 2026-03-08

## Goal

Monitor API endpoint performance, detect slow/overloaded endpoints, maintain audit trail for GDPR compliance, and provide AI-readable system health data.

## Architecture

### Data Storage

Separate `metrics` PostgreSQL schema — isolated from application data, ready for future extraction to dedicated DB.

**`metrics.request_events`** — raw per-request events, 30-day retention:

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial PK | |
| `timestamp` | timestamptz NOT NULL | when |
| `requestId` | text NOT NULL | nanoid, correlates logs + mobile error reports |
| `method` | text NOT NULL | GET/POST |
| `endpoint` | text NOT NULL | tRPC procedure name or HTTP path |
| `userId` | uuid \| null | null = pre-auth |
| `durationMs` | integer NOT NULL | response time |
| `statusCode` | smallint NOT NULL | HTTP status |
| `appVersion` | text \| null | from X-App-Version header |
| `platform` | text \| null | "iOS 18.2" / "Android 15" |
| `authProvider` | text \| null | email-otp/google/apple/linkedin/facebook |
| `sessionId` | text \| null | links requests to session |
| `ipHash` | text \| null | SHA256(ip + salt), not raw IP |
| `userAgent` | text \| null | shortened |
| `errorMessage` | text \| null | truncated ~200 chars, errors only |

**Indexes:** `(timestamp)`, `(endpoint, timestamp)`, `(userId, timestamp)`

**`metrics.daily_summaries`** — aggregated data, kept forever:

Per endpoint per day: count, avg, p50, p95, p99, error_count.

**`metrics.slo_targets`** — performance targets:

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `endpoint` | text \| null | null = global target |
| `metricType` | text NOT NULL | 'p95', 'p99', 'error_rate' |
| `thresholdMs` | integer \| null | for latency targets |
| `thresholdPct` | numeric \| null | for error_rate (0-100) |
| `createdAt` | timestamptz | |

### Data Collection

**Single module:** `apps/api/src/services/metrics.ts`

Exports:
- `metricsMiddleware()` — Hono middleware, plugged in once in `index.ts`
- `flushMetrics()` — for graceful shutdown and tests
- `getBufferSize()` — diagnostics

**Flow:**
```
Request → Hono middleware (start timer)
  → route handler (tRPC / HTTP)
  → middleware (stop timer, push event to buffer)
  → every 10s or 500 items → batch INSERT into metrics.request_events
```

**Endpoint naming:**
- tRPC: `profiles.me`, `waves.send` (procedure name)
- HTTP: `/api/auth/get-session`, `/health` (path)

**Data sources:**
- `durationMs` — `performance.now()` start/end
- `userId` — from auth context
- `authProvider` — lazy lookup from session → account
- `appVersion` / `platform` — from headers (`X-App-Version`, User-Agent parse)
- `requestId` — generated nanoid, added to `X-Request-Id` response header
- `ipHash` — `SHA256(ip + env.IP_HASH_SALT)`
- `errorMessage` — from error handler, truncated

**Buffer safety:**
- Hard cap: 5000 elements. If flush fails and buffer grows, oldest events are dropped with `console.warn`
- Flush in `try/catch` — DB error doesn't crash server
- `clearInterval` + final flush on graceful shutdown
- Flush on threshold (500 items) OR timer (10s), whichever comes first

### API Endpoints

**`GET /api/metrics/summary`** — AI-readable system health (IP rate limited, no auth):
```json
{
  "period": "last_1h",
  "overview": { "totalRequests": 1423, "errorRate": 0.02, "p50": 45, "p95": 210, "p99": 890 },
  "slowest": [{ "endpoint": "messages.getConversations", "p95": 450, "count": 89 }],
  "errors": [{ "endpoint": "waves.send", "count": 3, "lastError": "TIMEOUT" }],
  "sloBreaches": [{ "endpoint": "profiles.me", "target": "p95 < 200ms", "actual": 340 }]
}
```

**`GET /metrics`** — Prometheus text format (prom-client):
- `http_request_duration_ms` histogram (buckets: 10, 50, 100, 250, 500, 1000, 2500, 5000)
- `http_requests_total` counter (labels: endpoint, status, method)
- `http_errors_total` counter
- Default Node.js metrics (memory, event loop)

### Mobile Error Reporting

Mobile app extracts `X-Request-Id` from response headers and displays it on error screens. Users can report this ID for debugging — Claude traces the exact request in `metrics.request_events`.

## Milestones

### Milestone 1a — Foundation (schema + module + middleware)
- `metrics` schema in Postgres + migration
- `metrics.ts` module (buffer, flush, hard cap)
- Hono middleware collecting all fields
- `requestId` in response header

### Milestone 1b — API endpoints
- `/api/metrics/summary` (AI-readable JSON)
- `/metrics` (Prometheus)
- `slo_targets` table + default global targets

### Milestone 1c — Mobile error reporting
- Mobile extracts `requestId` from response header
- Shows it on error screen for bug reports

### Milestone 2a — Deeper insight
- Fields: `targetUserId`, `actionType`, `dbQueryCount`
- Drizzle query timing (logger/wrapper)
- BullMQ queue metrics (job duration, queue depth, failure rate)

### Milestone 2b — Intelligent monitoring
- WebSocket monitoring (connections, throughput, auth failures)
- Dependency health pings (DB, Redis, S3 latency)
- Anomaly detection (rate of change, not just thresholds)

### Milestone 2c — Automation + dashboard
- Retention cron: raw → daily_summaries after 30 days
- Scheduled Claude monitoring (hourly cron)
- Dashboard in admin panel (BLI-63)

## Compliance

- 30-day raw event retention satisfies GDPR Art. 32/33 audit trail requirements
- IP addresses stored as SHA256 hash (not raw) for privacy
- `userId + timestamp + endpoint` enables Art. 15 data access auditing
- Future `targetUserId` field enables "who accessed my data" queries
- Verify retention policy with lawyer
