# Requirements: Blisko Admin Dashboard

**Defined:** 2026-03-26
**Core Value:** See what's happening in the backend at a glance and act on it

## v1 Requirements

Match monitoring screen with togglable live feed. The first thing you see after login — real-time insight into AI match processing.

### Foundation

- [x] **FOUN-01**: Drizzle schema extracted to packages/db as a shared workspace package (used by both api and admin)
- [x] **FOUN-01a**: Admin app connects to PostgreSQL via Drizzle using shared schema from packages/db
- [x] **FOUN-02**: Admin app connects to Redis via Bun RedisClient
- [x] **FOUN-03**: Admin app instantiates BullMQ Queue for read-only job inspection
- [x] **FOUN-04**: Connection pool sizing is explicit and documented (won't exhaust shared DB connections)
- [x] **FOUN-05**: Admin sessions persist across Railway redeploys (not in-memory Map)

### Match Monitoring

- [ ] **MTCH-01**: Dashboard shows overview of recent match analyses — pairs analyzed, scores, completion status
- [x] **MTCH-02**: User can see match analysis details: who was paired, match score, AI reasoning summary, time taken
- [ ] **MTCH-03**: User can see queue state for analyze-pair jobs: waiting, active, completed, failed counts
- [ ] **MTCH-04**: User can inspect a failed match analysis — error message, stack trace, job data
- [ ] **MTCH-05**: User can retry a failed match analysis job
- [ ] **MTCH-06**: User can see profiling jobs alongside match jobs (generate-profiling-question, generate-profile-ai)

### Live Feed

- [ ] **FEED-01**: Togglable real-time event stream showing match/profiling activity as it happens
- [ ] **FEED-02**: Events include: pair analysis started, pair analysis completed (with score), pair analysis failed, profiling jobs
- [ ] **FEED-03**: Feed can be paused/resumed without losing position
- [ ] **FEED-04**: Feed shows human-readable summaries (e.g. "Anna → Marek: 82% match" not raw job IDs)
- [ ] **FEED-05**: Feed auto-scrolls to latest but allows scrolling back through history

### Navigation & Layout

- [x] **NAVI-01**: Dashboard replaces "Panel w budowie" placeholder after login
- [ ] **NAVI-02**: Clean, functional layout — sidebar or top nav for future sections, main content area for match monitoring

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Ops Dashboards

- **OPS-01**: Error rate, latency (p50/p95/p99), throughput charts with time windows
- **OPS-02**: SLO breach indicators (existing slo_targets data)
- **OPS-03**: Slowest endpoints ranking
- **OPS-04**: Top errors ranking
- **OPS-05**: WebSocket connection stats

### Queue Management

- **QMGM-01**: Queue pause/resume (emergency brake for AI costs)
- **QMGM-02**: Bulk clean completed/failed jobs
- **QMGM-03**: Job promote (delayed → waiting)

### User & Product Metrics

- **USER-01**: User lookup by email/name/ID with profile, account status, wave/conversation counts
- **USER-02**: Product metrics dashboard — signups, DAU, waves, conversations over time
- **USER-03**: User activity timeline — chronological API calls, waves, messages for a specific user

### Claude Code Integration

- **CLDE-01**: API key auth for programmatic access (Bearer token, constant-time comparison)
- **CLDE-02**: Admin API endpoints for read/write operations
- **CLDE-03**: Allowlist UI — toggle which endpoints Claude Code can access, persisted in DB
- **CLDE-04**: Auto-generated Claude Code skill describing available endpoints

### Alerting

- **ALRT-01**: Configurable in-panel alerts (error rate spike, queue backlog, no completions)
- **ALRT-02**: Alert rule storage in DB
- **ALRT-03**: External escalation (email/push) — future

## Out of Scope

| Feature | Reason |
|---------|--------|
| Message content viewing | Privacy violation — show metadata only, never content |
| Mobile-responsive layout | Desktop-only admin usage |
| Role-based access control | Single admin user, allowlist UI covers API access |
| Custom SQL query runner | SQL injection risk, too dangerous without guardrails |
| Full Prometheus/Grafana integration | Already have /metrics endpoint for advanced queries |
| Content moderation tools | Private DMs, no public feed to moderate at current scale |
| Audit log | Single admin, git history + deploy logs suffice |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUN-01 | Phase 1 | Complete |
| FOUN-01a | Phase 1 | Complete |
| FOUN-02 | Phase 1 | Complete |
| FOUN-03 | Phase 1 | Complete |
| FOUN-04 | Phase 1 | Complete |
| FOUN-05 | Phase 1 | Complete |
| MTCH-01 | Phase 1 | Pending |
| MTCH-02 | Phase 1 | Complete |
| MTCH-03 | Phase 1 | Pending |
| MTCH-04 | Phase 2 | Pending |
| MTCH-05 | Phase 2 | Pending |
| MTCH-06 | Phase 2 | Pending |
| FEED-01 | Phase 3 | Pending |
| FEED-02 | Phase 3 | Pending |
| FEED-03 | Phase 3 | Pending |
| FEED-04 | Phase 3 | Pending |
| FEED-05 | Phase 3 | Pending |
| NAVI-01 | Phase 1 | Complete |
| NAVI-02 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-26 after roadmap creation*
