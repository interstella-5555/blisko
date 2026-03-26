# Blisko Admin Dashboard

## What This Is

An admin dashboard for Blisko (admin.blisko.app) that provides full operational and product visibility into the backend, plus a programmatic API that gives Claude Code power to perform admin operations. Built as a TanStack Start app in the existing monorepo, with direct database and Redis connections.

## Core Value

See what's happening in the backend at a glance and act on it — both as a human via the dashboard and as Claude Code via the admin API.

## Requirements

### Validated

- ✓ Admin app scaffolded with TanStack Start + Tailwind — existing
- ✓ OTP-based email authentication — existing
- ✓ Deployed on Railway at admin.blisko.app — existing

### Active

- [ ] BullMQ job monitoring — queue health, job states, retry failed jobs
- [ ] Ops dashboards — error rates, latency charts, throughput
- [ ] User/product metrics — signups, waves, conversations, activity
- [ ] Real-time event stream — live feed of backend activity
- [ ] In-panel alerting — configurable alerts for error spikes, queue backlogs
- [ ] Direct DB + Redis connections from admin app (Drizzle, Bun RedisClient)
- [ ] Claude Code admin API — API key auth, full read/write operations
- [ ] Allowlist UI — toggle which API endpoints Claude Code can access
- [ ] Claude Code skill — auto-generated skill teaching Claude how to use the admin API

### Out of Scope

- External alerting (email, push) — deferred, in-panel only for now
- Role-based access control — single admin role for now, allowlist UI covers API access
- Admin app mobile layout — desktop-only is fine
- Real-time collaboration — single admin user expected

## Context

- Admin app already exists at `apps/admin/` with auth (OTP via email), empty dashboard, deployed on Railway
- Main API has Prometheus metrics (`/metrics`), JSON summary (`/api/metrics/summary`), BullMQ queues in `apps/api/src/services/queue.ts`
- Queue metrics already tracked in `apps/api/src/services/queue-metrics.ts`
- Existing monitoring docs in `docs/architecture/instrumentation.md`
- Admin app uses Nitro for server-side, can add API routes at `src/routes/api/`
- Shared package `@repo/shared` provides types, validators, enums
- DB schema at `apps/api/src/db/schema.ts`, can be imported from admin app via workspace

## Constraints

- **Stack**: TanStack Start + Tailwind (already chosen), Nitro server routes for API
- **Auth**: OTP email login for dashboard, separate API key auth for Claude Code endpoints
- **Data**: Direct PostgreSQL (Drizzle) and Redis (Bun RedisClient) connections — same databases as main API
- **Deployment**: Railway, same project as other services
- **Security**: API key for Claude Code must be stored as Railway env var, never in code. Allowlist state persisted in DB.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Admin API in admin app (not main API) | Separation of concerns — admin endpoints don't belong in user-facing API | — Pending |
| Direct DB connection (not proxy via API) | Admin needs queries the API doesn't expose — user search, job inspection, aggregate stats | — Pending |
| Allowlist UI for Claude Code endpoints | Granular control over what Claude can do, adjustable without code changes | — Pending |
| In-panel alerting only (for now) | Keep scope manageable, add email/push escalation later | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-26 after initialization*
