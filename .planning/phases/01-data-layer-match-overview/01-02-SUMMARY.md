---
phase: 01-data-layer-match-overview
plan: 02
subsystem: database
tags: [drizzle, postgres, bullmq, telemetry, queue, connection-analyses]

# Dependency graph
requires:
  - "01-01: @repo/db shared schema package (connectionAnalyses table definition)"
provides:
  - "triggered_by + BullMQ lifecycle telemetry columns on connectionAnalyses table"
  - "triggeredBy field flowing through all analyze-pair enqueue paths"
  - "Worker persists job metadata (jobId, enqueuedAt, processedAt, processDurationMs, waitDurationMs, attemptsMade) to DB"
affects: [01-04, 01-05, 01-06]

# Tech tracking
tech-stack:
  added: []
  patterns: ["BullMQ job telemetry persistence pattern — extract job.id/timestamp/processedOn/attemptsMade and write alongside business data"]

key-files:
  created:
    - apps/api/drizzle/0017_add_telemetry_to_analyses.sql
  modified:
    - packages/db/src/schema.ts
    - apps/api/src/services/queue.ts
    - apps/api/src/trpc/procedures/waves.ts
    - apps/api/src/trpc/procedures/profiles.ts

key-decisions:
  - "All 7 telemetry columns nullable — existing rows lack data, T2 fast-path has no triggeredBy source"
  - "processDurationMs computed via performance.now() delta from handler start, not BullMQ finishedOn (more accurate, available before DB write)"
  - "T2 quick-score also persists telemetry alongside T3 full analysis — consistent data for admin dashboard"

patterns-established:
  - "Trigger tracking: every enqueue call site passes a triggeredBy string (wave:send, profile:update, profile:requestAnalysis)"
  - "Telemetry spread pattern: build telemetry object once, spread into both .values() and .onConflictDoUpdate().set()"

requirements-completed: [MTCH-02]

# Metrics
duration: 6min
completed: 2026-03-26
---

# Phase 01 Plan 02: Triggered-by + BullMQ Telemetry Summary

**triggered_by field and BullMQ lifecycle telemetry (job ID, enqueue/process timestamps, durations, attempts) persisted to connectionAnalyses for admin dashboard job tracing**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-26T18:57:22Z
- **Completed:** 2026-03-26T19:04:05Z
- **Tasks:** 2
- **Files modified:** 7 (4 source + 3 migration/meta)

## Accomplishments
- Added 7 nullable columns to connectionAnalyses: triggered_by, job_id, enqueued_at, processed_at, process_duration_ms, wait_duration_ms, attempts_made
- Wired triggeredBy through all enqueue paths: enqueuePairAnalysis, enqueueUserPairAnalysis, promotePairAnalysis, safeEnqueuePairJob
- Worker persists BullMQ job metadata in both T3 (full analysis) and T2 (quick-score) upsert paths
- All 32 API tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add telemetry columns + generate migration** - `19f2d0b` (feat)
2. **Task 2: Wire triggeredBy + persist telemetry in worker** - `73d6c08` (feat)

## Files Created/Modified
- `packages/db/src/schema.ts` - 7 new nullable columns on connectionAnalyses table
- `apps/api/drizzle/0017_add_telemetry_to_analyses.sql` - ALTER TABLE migration for all 7 columns
- `apps/api/drizzle/meta/0017_snapshot.json` - Drizzle migration snapshot
- `apps/api/drizzle/meta/_journal.json` - Updated migration journal
- `apps/api/src/services/queue.ts` - triggeredBy in job interfaces, telemetry persistence in T3 and T2 workers
- `apps/api/src/trpc/procedures/waves.ts` - promotePairAnalysis with "wave:send" trigger
- `apps/api/src/trpc/procedures/profiles.ts` - enqueueUserPairAnalysis with "profile:update", enqueuePairAnalysis with "profile:requestAnalysis"

## Decisions Made
- All telemetry columns are nullable because existing rows have no data and T2 quick-score jobs don't carry a triggeredBy from the originating call site
- processDurationMs uses performance.now() from handler start (t0) rather than BullMQ's finishedOn — more accurate since it's computed before the DB write completes
- getDetailedAnalysis promotePairAnalysis call also passes "profile:requestAnalysis" for consistency (extra call site not in plan but follows same pattern)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added telemetry to T2 quick-score worker path**
- **Found during:** Task 2
- **Issue:** processQuickScore didn't receive the Job object, so it couldn't extract BullMQ metadata
- **Fix:** Updated processQuickScore signature to accept Job<QuickScoreJob>, built telemetry object, spread into both T2 upsert paths
- **Files modified:** apps/api/src/services/queue.ts
- **Verification:** grep confirms enqueuedAt and processDurationMs appear twice in queue.ts (once for T3, once for T2)
- **Committed in:** 73d6c08 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added triggeredBy to getDetailedAnalysis promotePairAnalysis call**
- **Found during:** Task 2
- **Issue:** profiles.ts getDetailedAnalysis also calls promotePairAnalysis but plan didn't list it as a call site to update
- **Fix:** Added "profile:requestAnalysis" triggeredBy to that call for consistent trigger tracking
- **Files modified:** apps/api/src/trpc/procedures/profiles.ts
- **Committed in:** 73d6c08 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 missing critical functionality)
**Impact on plan:** Both ensure completeness — all connectionAnalyses write paths now include telemetry. No scope creep.

## Issues Encountered
- Worktree did not have plan 01-01 changes (packages/db) — fast-forwarded to include them before starting
- Worktree lacked node_modules — ran bun install before migration generation

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- connectionAnalyses table now has all telemetry columns needed for admin dashboard match overview sheet panel
- Admin queries (plan 01-05, 01-06) can read triggered_by and BullMQ lifecycle data directly from the DB
- Migration must run on production via Railway post-deploy hook before admin dashboard can display telemetry

## Self-Check: PASSED

All files verified present. Both commit hashes confirmed in git log.

---
*Phase: 01-data-layer-match-overview*
*Completed: 2026-03-26*
