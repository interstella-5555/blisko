# Roadmap: Blisko Admin Dashboard

## Overview

Deliver a match monitoring dashboard at admin.blisko.app in three phases. Phase 1 wires up the data layer and renders the first real screen -- match analyses overview with queue health, replacing the "Panel w budowie" placeholder. Phase 2 adds interactive operations: failure inspection, job retry, and profiling job visibility. Phase 3 layers on a togglable live feed streaming match and profiling events in real time. Each phase delivers something you can see and verify on the live site.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Data Layer & Match Overview** - Wire DB/Redis/BullMQ connections and render the match monitoring screen with queue health
- [ ] **Phase 2: Match Operations** - Add failure inspection, job retry, and profiling job visibility
- [ ] **Phase 3: Live Feed** - Togglable real-time event stream of match and profiling activity

## Phase Details

### Phase 1: Data Layer & Match Overview
**Goal**: Admin logs into admin.blisko.app and sees a real match monitoring dashboard with recent analyses and queue health instead of a placeholder
**Depends on**: Nothing (first phase)
**Requirements**: FOUN-01, FOUN-01a, FOUN-02, FOUN-03, FOUN-04, FOUN-05, MTCH-01, MTCH-02, MTCH-03, NAVI-01, NAVI-02
**Success Criteria** (what must be TRUE):
  1. Admin logs into admin.blisko.app and lands on the match monitoring screen (not "Panel w budowie")
  2. Dashboard shows a table/list of recent match analyses with pairs, scores, completion status, and expandable detail (AI reasoning, time taken)
  3. Dashboard shows analyze-pair queue state: waiting, active, completed, and failed job counts
  4. Admin session survives a Railway redeploy (not lost on restart)
  5. Page layout has navigation structure ready for future sections (sidebar or top nav)
**Plans**: 6 plans

Plans:
- [x] 01-01-PLAN.md -- Extract Drizzle schema to packages/db shared workspace package
- [x] 01-02-PLAN.md -- Add triggeredBy + BullMQ lifecycle telemetry to queue jobs and connectionAnalyses table
- [ ] 01-03-PLAN.md -- Replace custom auth with Better Auth + add DB/Redis/BullMQ connections
- [ ] 01-04-PLAN.md -- Initialize shadcn/ui and install UI component primitives
- [ ] 01-05-PLAN.md -- Build sidebar layout, rebuild login page, create dashboard shell
- [ ] 01-06-PLAN.md -- Build match monitoring dashboard (table, queue health, detail sheet with telemetry)

**UI hint**: yes

### Phase 2: Match Operations
**Goal**: Admin can investigate match failures, retry jobs, and see profiling jobs alongside match analyses
**Depends on**: Phase 1
**Requirements**: MTCH-04, MTCH-05, MTCH-06
**Success Criteria** (what must be TRUE):
  1. Admin can click a failed match analysis and see the error message, stack trace, and original job data
  2. Admin can retry a failed match analysis job with a single click and see it re-enter the queue
  3. Profiling jobs (generate-profiling-question, generate-profile-ai) appear in the monitoring view alongside match jobs
**Plans**: TBD
**UI hint**: yes

### Phase 3: Live Feed
**Goal**: Admin can toggle on a real-time event stream and watch match/profiling activity as it happens
**Depends on**: Phase 2
**Requirements**: FEED-01, FEED-02, FEED-03, FEED-04, FEED-05
**Success Criteria** (what must be TRUE):
  1. Admin can toggle a live feed panel on/off on the match monitoring screen
  2. Feed shows events as they happen: analysis started, completed (with score), failed, and profiling jobs
  3. Events display human-readable summaries (e.g. "Anna -> Marek: 82% match") not raw job IDs
  4. Admin can pause/resume the feed without losing their scroll position, and the feed auto-scrolls to latest when unpaused
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Layer & Match Overview | 1/6 | In Progress|  |
| 2. Match Operations | 0/0 | Not started | - |
| 3. Live Feed | 0/0 | Not started | - |
