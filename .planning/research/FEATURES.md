# Feature Landscape

**Domain:** Admin dashboard for a social proximity / messaging app (Blisko)
**Researched:** 2026-03-26

## Table Stakes

Features the admin dashboard must have, otherwise it adds no value over the existing CLI monitors and raw Prometheus endpoint.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **BullMQ queue overview** | Already have a CLI queue-monitor; dashboard must at minimum match it: job counts by state (waiting/active/delayed/failed/completed), recent completed/failed jobs, avg/p95 durations per job type | Medium | Use BullMQ's `Queue` API (`getJobCounts`, `getJobs`). Single queue `ai-jobs` with 10 job types simplifies this. Current CLI already does this but requires terminal access |
| **Job inspection & detail view** | Seeing a failed job's data, stack trace, and attempt history is the primary reason admins go to a queue dashboard | Low | `job.data`, `job.failedReason`, `job.stacktrace`, `job.attemptsMade`. Already available in BullMQ Job objects |
| **Retry failed jobs** | Without retry, admin must SSH or use CLI to recover. This is the single most requested BullMQ UI action | Low | `job.retry()`. Must be behind confirmation UI. Bull Board sets `allowRetries: true` for this |
| **Clean (bulk remove) jobs** | Failed jobs accumulate in Redis (`removeOnFail: { count: 100 }` keeps 100). Need bulk cleanup | Low | `queue.clean(grace, limit, 'failed')`. Expose for failed/completed states |
| **Ops health overview** | Error rate, p50/p95/p99 latency, request throughput. Already computed in `metrics-summary.ts` — just needs a frontend | Medium | Existing `getMetricsSummary()` returns everything needed. Add time-series charts (last 1h/6h/24h/7d windows) |
| **SLO breach display** | Already have `slo_targets` table and `checkSloBreaches()`. Breaches should be visible at a glance on dashboard home | Low | Surface existing data. Red/green indicators per SLO target |
| **Slowest endpoints ranking** | Already computed in `getSlowestEndpoints()`. Top 10 by p95 with request count | Low | Render existing data as a sorted table |
| **Top errors ranking** | Already computed in `getTopErrors()`. Grouped by endpoint + status + message | Low | Render existing data. Link to related request events |
| **User lookup** | Find a user by email/name/ID. View their profile, account status, auth providers, wave/conversation counts. Cannot debug production issues without this | Medium | Direct DB query via Drizzle. Join `user` + `profiles` + `account` tables. Must respect soft-delete visibility |
| **WebSocket status** | Active connections, subscriptions, auth attempts, rate limit hits. Already tracked in `ws-metrics.ts` | Low | Surface existing `getWsStats()` data |
| **API key auth for Claude Code** | Programmatic access is a core requirement. Static API key in Railway env var, validated via middleware | Low | Header-based (`Authorization: Bearer <key>`), constant-time comparison. Single key for now |
| **Admin session auth (OTP)** | Already implemented. Email OTP login with allowlisted emails | Done | Existing at `apps/admin/src/lib/auth.ts`. In-memory session store |

## Differentiators

Features that go beyond basic monitoring. Not strictly required for launch, but significantly increase the dashboard's value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Real-time event stream** | Live feed of backend activity: waves sent/accepted, messages, new signups, AI jobs completing. Turns the dashboard from "check periodically" to "leave open and watch" | High | Subscribe to Redis pub/sub channels the API already publishes to (`publishEvent` in `redis-bridge.ts`). SSE or WebSocket from admin server. Need to aggregate 16+ event types into a unified admin feed |
| **Queue pause/resume** | Emergency brake for runaway AI jobs (e.g. OpenAI billing spike). BullMQ supports `queue.pause()` / `queue.resume()` | Low | Critical for cost control. Single button with confirmation. Global pause on the `ai-jobs` queue |
| **Job promote (delayed -> waiting)** | Push delayed jobs to run immediately. Useful when debugging or after fixing an issue | Low | `job.promote()`. Only applicable to delayed jobs |
| **Time-series charts** | Latency/error/throughput over time with zoomable windows. Transforms raw numbers into trend visibility | High | Need to query `request_events` table with time bucketing (`date_trunc`). Consider downsampled materialized views for longer windows. Use a charting library (Recharts or similar) |
| **Product metrics dashboard** | Signups over time, daily active users, waves sent/accepted ratio, conversations created, messages per day, AI analysis completion rate | Medium | All derivable from existing DB tables with aggregate queries. Useful for product decisions but not operational monitoring |
| **Endpoint allowlist UI for Claude Code** | Toggle which API endpoints Claude Code can access. Adjustable without code changes | Medium | Persisted in DB (new table). Admin UI with toggle switches per endpoint. Middleware checks allowlist before executing Claude Code requests |
| **Claude Code auto-generated skill** | Export available (allowlisted) endpoints as a Claude Code skill file so Claude automatically knows what the admin API can do | Medium | Generate markdown/JSON describing endpoints, params, examples. Downloadable or served at a well-known URL |
| **In-panel alerting** | Configurable alerts: "error rate > 5% for 5 min", "queue depth > 50", "no completed jobs in 10 min". Visual banner + optional sound | High | Needs a polling/evaluation loop on the server, alert rule storage in DB, WebSocket push to dashboard. Build incrementally: start with SLO breach alerts (already computed), then add custom rules |
| **User activity timeline** | For a specific user: chronological view of their API calls, waves, messages, AI analyses. Debug "what happened to user X" | Medium | Query `request_events` filtered by `userId`, join with waves/messages. Pagination needed |
| **Chatbot status & control** | See if chatbot is running, which seed users are paused (login-based 5 min pause), override acceptance thresholds | Medium | Chatbot runs as separate service. Need health check endpoint or Redis-based status. Complements existing `chatbot-monitor` CLI |
| **Feature gates management** | Existing `feature_gates` table. UI to enable/disable features without redeploying | Low | CRUD on `feature_gates` table. Already has schema support |
| **Seed user management** | Trigger scatter operations, view seed user distribution on a map, see chatbot response stats per user | Medium | Useful for demo/testing but not production ops. Calls existing scatter scripts |

## Anti-Features

Features to explicitly NOT build. Either out of scope, premature, or actively harmful.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Content moderation tools** | Blisko connects people in real life; messages are private DMs and group chats, not public content. No feed to moderate. Over-engineering for current scale (~250 seed users + early adopters) | Add a reports/flags system later if user complaints emerge. For now, admin user lookup + activity timeline is sufficient |
| **Role-based access control** | Single admin user (Karol). RBAC adds complexity for zero current value. The allowlist UI for Claude Code API handles the only real access-control need | Revisit when/if there are multiple admins or moderators. Keep email allowlist for now |
| **Mobile-responsive layout** | Desktop-only admin usage. Responsive design doubles CSS work for a dashboard you only check from your laptop | State explicitly: desktop-only. Min-width ~1200px |
| **Real-time collaboration** | No concurrent admin editors. Live cursors, presence, conflict resolution all unnecessary | Single admin user assumption documented in PROJECT.md |
| **External alerting (email/push/Slack)** | Adds entire notification pipeline for a 1-person admin. In-panel alerts sufficient for now | In-panel only. If you're not looking at the dashboard, the alert can wait. Add email escalation as a future milestone |
| **Full Prometheus/Grafana integration** | Already have `/metrics` Prometheus endpoint. Building Grafana-like query builder in the admin app is massive scope creep | Use the existing Prometheus endpoint if you need advanced queries. Admin dashboard shows curated views |
| **Audit log for admin actions** | At current scale (1 admin, 250 users), knowing who did what is obvious — it was you. Audit logging adds write overhead to every admin action | Add when team grows. For now, git history + Railway deploy logs provide an audit trail |
| **Data export/GDPR tools in admin** | Already handled by the API's `data-export.ts` service and `export-user-data` queue job. Duplicating in admin creates two code paths | Trigger data export via admin API if needed. View export status in user detail page |
| **Custom SQL query runner** | SQL injection risk, accidental `DELETE FROM`, production DB connected directly. Too dangerous without guardrails | Build specific query views for each need. User lookup, metrics, job inspection cover 95% of cases |
| **Message content viewing** | Privacy violation. Admins should not read private messages. Goes against app's trust model | Show message metadata (counts, timestamps, participants) but never content. Conversations exist to connect people, not to be surveilled |

## Feature Dependencies

```
Admin session auth (OTP) [DONE]
  |
  +-- Ops health overview --> Time-series charts
  |     |
  |     +-- SLO breach display --> In-panel alerting
  |     +-- Slowest endpoints
  |     +-- Top errors
  |
  +-- BullMQ queue overview --> Job inspection --> Retry failed jobs
  |     |                                    +--> Clean jobs
  |     +-- Queue pause/resume
  |     +-- Job promote
  |
  +-- WebSocket status
  |
  +-- User lookup --> User activity timeline
  |
  +-- Product metrics dashboard
  |
  +-- Real-time event stream (independent, reads Redis pub/sub)
  |
  +-- API key auth --> Endpoint allowlist UI --> Claude Code auto-skill
  |
  +-- Feature gates management (independent, CRUD on existing table)
  |
  +-- Chatbot status & control
```

Key dependency chains:
- BullMQ overview must exist before job inspection, retry, clean, pause/resume make sense
- Ops health overview before time-series charts (charts are the visual upgrade of the same data)
- API key auth before allowlist UI (can't restrict what doesn't exist yet)
- Allowlist UI before auto-skill (skill describes what's allowlisted)
- User lookup before activity timeline (timeline is detail view of a looked-up user)
- SLO breach display before alerting (alerting generalizes the breach concept)

## MVP Recommendation

Prioritize (Phase 1 -- operational visibility):
1. **Ops health overview** -- surface existing `getMetricsSummary()` with basic charts. Immediate value, low effort since data layer exists
2. **BullMQ queue overview + job inspection + retry** -- replace CLI queue monitor. Core operational need
3. **User lookup** -- can't debug user issues without it
4. **WebSocket status** -- one card on the dashboard, trivial to add
5. **API key auth** -- unblocks Claude Code integration in subsequent phase

Defer to Phase 2 (enhanced monitoring):
- **Time-series charts** -- needs time-bucketed queries, charting library, more frontend work
- **Queue pause/resume, clean, promote** -- useful but not critical for day-1
- **Real-time event stream** -- high complexity, nice-to-have
- **Product metrics dashboard** -- useful but can be derived ad-hoc from DB queries for now

Defer to Phase 3 (Claude Code integration + polish):
- **Endpoint allowlist UI** -- requires API key auth from Phase 1
- **Claude Code auto-skill** -- requires allowlist from Phase 2
- **In-panel alerting** -- requires time-series charts and SLO infrastructure from Phase 2
- **User activity timeline** -- requires user lookup from Phase 1

## Blisko-Specific Considerations

The feature recommendations account for Blisko's unique characteristics:

1. **Single BullMQ queue** -- all 10 job types go through `ai-jobs`. Dashboard can be simpler than multi-queue solutions. Job type filtering within the single queue is the key UX need.

2. **Existing metrics infrastructure** -- `request_events` table, `queue-metrics.ts`, `ws-metrics.ts`, `prometheus.ts`, `metrics-summary.ts` already compute most aggregates. The admin dashboard is primarily a **frontend for existing data**, not a new data pipeline.

3. **Direct DB access** -- admin app connects to the same PostgreSQL and Redis as the main API. No proxy layer needed, but be careful about query performance (time-series queries on `request_events` could be heavy -- add appropriate `WHERE timestamp > ...` filters and consider partitioning later).

4. **250 seed users + early adopters** -- scale is tiny. No need for sampling, downsampling, or complex aggregation pipelines. Direct queries work fine.

5. **AI job costs** -- queue pause/resume is a differentiator because runaway AI jobs directly hit OpenAI billing. This feature has outsized value relative to complexity.

6. **Privacy model** -- Blisko facilitates real-world meetings. Message content is private by design. Admin tools should show metadata (exists, count, timestamps) but never content.

## Sources

- [Bull Board GitHub](https://github.com/felixmosh/bull-board) -- open-source BullMQ dashboard, feature reference
- [Taskforce.sh](https://taskforce.sh/) -- commercial BullMQ dashboard, feature benchmark
- [Durabull](https://durabull.io/) -- modern BullMQ dashboard with worker tracking
- [Upqueue.io](https://upqueue.io/) -- BullMQ monitoring with alerting features
- [OneUptime: How to Monitor BullMQ with Bull Board](https://oneuptime.com/blog/post/2026-01-21-bullmq-bull-board/view) -- integration patterns
- [API Key Management Best Practices 2025](https://multitaskai.com/blog/api-key-management-best-practices/) -- scoped permissions, allowlist patterns
- [API Keys: Complete 2025 Guide](https://dev.to/hamd_writer_8c77d9c88c188/api-keys-the-complete-2025-guide-to-security-management-and-best-practices-3980) -- auth patterns
- Existing codebase: `apps/api/src/services/queue.ts`, `queue-metrics.ts`, `metrics-summary.ts`, `prometheus.ts`, `ws-metrics.ts`, `packages/dev-cli/src/queue-monitor.ts`
