# Instrumentation Milestone 2a — Deeper Insight (Design)

**Ticket:** BLI-69 (milestone 2a)
**Date:** 2026-03-08
**Parent design:** `docs/architecture/instrumentation.md`

## Goal

Enrich per-request metrics with DB query tracking, target user/group context for GDPR auditing, and add BullMQ queue observability.

## Schema Changes

### New columns on `metrics.request_events`

| Column | Type | Description |
|--------|------|-------------|
| `target_user_id` | text \| null | Which user this request operated on (1-1 actions: wave, DM, profile view) |
| `target_group_id` | text \| null | Which group (group message, group management) |
| `db_query_count` | integer \| null | Number of DB queries executed during request |
| `db_duration_ms` | integer \| null | Total time spent in DB (ms) |

**Skipped:** `actionType` column — redundant with `endpoint`. Read/write categorization done at query time (`.get*`, `.list*` = read; `.send`, `.create`, `.update`, `.delete` = write).

### Indexes

- `idx_re_target_user_ts` on `(target_user_id, timestamp)` — GDPR "who accessed my data" queries
- `idx_re_target_group` on `(target_group_id)` — group access auditing

## Target User/Group Enrichment

### Approach: Explicit enrichment in tRPC procedures

Helper functions `setTargetUserId(ctx, id)` and `setTargetGroupId(ctx, id)` called in tRPC procedures that operate on other users' or groups' data. Stored in existing `requestMeta` WeakMap.

### Which procedures need enrichment

**targetUserId (1-1 actions):**
- `waves.send` → `toUserId`
- `profiles.view` (if exists) → viewed userId
- `messages.send` (DM) → recipient userId
- Any procedure accessing another user's data

**targetGroupId (group actions):**
- `messages.send` (group) → groupId
- Group management endpoints → groupId

**Both null:** Actions on self (profile update, settings change).

## DB Query Tracking via AsyncLocalStorage

### Architecture

```
Request → Hono middleware opens ALS context { queryCount: 0, dbDurationMs: 0 }
  → Drizzle custom logger: on each query, increment count + add duration
  → Response: metrics middleware reads ALS context, writes to event
```

### Implementation

- `AsyncLocalStorage<{ queryCount: number; dbDurationMs: number }>` created in metrics module
- Hono middleware wraps handler in `als.run()`
- Custom Drizzle logger (replaces default) — wraps query execution, measures `performance.now()` delta, increments ALS context
- Metrics middleware reads final values from ALS before pushing event to buffer

### Why ALS over WeakMap

Drizzle logger doesn't have access to the `Request` object, so it can't use the existing WeakMap. ALS propagates automatically through the async call chain.

## BullMQ Queue Metrics

### Data collection

- **Event listeners** on each queue (`completed`, `failed`) — in-memory counters:
  - `jobsCompleted` per queue
  - `jobsFailed` per queue
  - `jobDurations` array (for histogram/percentiles) per queue
- **On-demand snapshot** via `queue.getJobCounts()` — waiting, active, delayed, failed counts

### Exposure

**`/api/metrics/summary`** — new `queues` section:
```json
{
  "queues": [
    {
      "name": "ai-analysis",
      "completed": 142,
      "failed": 3,
      "waiting": 12,
      "active": 2,
      "avgDurationMs": 4500,
      "p95DurationMs": 8200
    }
  ]
}
```

**`/metrics` (Prometheus):**
- `bullmq_jobs_total{queue, status}` — counter (completed, failed)
- `bullmq_job_duration_ms{queue}` — histogram
- `bullmq_queue_depth{queue, state}` — gauge (waiting, active, delayed)

### No persistence

Queue metrics are point-in-time operational data, not audit trail. In-memory only, reset on restart.

## Sub-issues

| Sub-issue | Scope |
|-----------|-------|
| **2a-1** | Schema migration (4 new columns + indexes) + AsyncLocalStorage infra + Drizzle custom logger for `dbQueryCount`/`dbDurationMs` |
| **2a-2** | `targetUserId`/`targetGroupId` enrichment — helpers + add calls to tRPC procedures |
| **2a-3** | BullMQ metrics — event listeners, in-memory counters, summary endpoint section, Prometheus export |

## Non-goals (deferred)

- `daily_summaries` table — milestone 2c (retention cron)
- `authProvider` population — separate improvement
- `sessionId` population — separate improvement
