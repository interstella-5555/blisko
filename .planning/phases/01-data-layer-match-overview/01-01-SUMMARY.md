---
phase: 01-data-layer-match-overview
plan: 01
subsystem: database
tags: [drizzle, postgres, workspace, monorepo, shared-package]

# Dependency graph
requires: []
provides:
  - "@repo/db workspace package with createDb factory, full Drizzle schema, and preparedName helper"
  - "API refactored to import schema from @repo/db (transparent to all existing consumers)"
  - "Admin Dockerfile ready to build with packages/db"
affects: [01-02, 01-03, 01-06]

# Tech tracking
tech-stack:
  added: ["@repo/db workspace package"]
  patterns: ["createDb factory for multi-app database instantiation", "shared schema via workspace package"]

key-files:
  created:
    - packages/db/package.json
    - packages/db/tsconfig.json
    - packages/db/src/index.ts
    - packages/db/src/schema.ts
    - packages/db/src/prepare.ts
  modified:
    - apps/api/src/db/index.ts
    - apps/api/package.json
    - apps/api/drizzle.config.ts
    - apps/api/src/services/metrics.ts
    - apps/admin/Dockerfile
    - bun.lock

key-decisions:
  - "createDb factory returns both db and client to allow per-app instrumentation (API monkey-patches client.unsafe)"
  - "Schema copied verbatim -- no modifications to table definitions during extraction"
  - "drizzle.config.ts updated to point at packages/db/src/schema.ts for migration generation"

patterns-established:
  - "Shared DB package: import { createDb, schema } from '@repo/db' for any app needing database access"
  - "API instrumentation stays in apps/api/src/db/index.ts, not in the shared package"

requirements-completed: [FOUN-01, FOUN-04]

# Metrics
duration: 4min
completed: 2026-03-26
---

# Phase 01 Plan 01: Extract Drizzle Schema Summary

**Shared @repo/db workspace package with createDb factory enabling both API and admin to use identical Drizzle schema**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-26T18:48:23Z
- **Completed:** 2026-03-26T18:52:50Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Created @repo/db workspace package with createDb factory, schema (36 exports), and preparedName helper
- Refactored API to import from @repo/db while preserving query instrumentation
- Updated admin Dockerfile to copy packages/db in both deps and build stages
- All 32 existing API tests pass after refactor

## Task Commits

Each task was committed atomically:

1. **Task 1: Create packages/db shared workspace package** - `6fc04bd` (feat)
2. **Task 2: Refactor API to import from @repo/db + update Dockerfile** - `1779cbe` (refactor)

## Files Created/Modified
- `packages/db/package.json` - @repo/db workspace package definition
- `packages/db/tsconfig.json` - TypeScript config for shared DB package
- `packages/db/src/index.ts` - createDb factory function with schema and preparedName re-exports
- `packages/db/src/schema.ts` - Full Drizzle schema (copied verbatim from apps/api)
- `packages/db/src/prepare.ts` - Prepared statement name deduplication helper
- `apps/api/src/db/index.ts` - Rewritten to use createDb from @repo/db with instrumentation
- `apps/api/package.json` - Added @repo/db workspace dependency
- `apps/api/drizzle.config.ts` - Schema path updated to packages/db/src/schema.ts
- `apps/api/src/services/metrics.ts` - Import path fix for NewRequestEvent type
- `apps/admin/Dockerfile` - Added COPY for packages/db in deps and build stages
- `bun.lock` - Updated with new workspace links

## Decisions Made
- createDb factory returns `{ db, client }` so consumers can instrument the postgres client (API needs this for query tracking, admin won't)
- Deleted apps/api/src/db/schema.ts and prepare.ts entirely rather than keeping re-export stubs -- all API imports go through @/db/index.ts which re-exports from @repo/db
- Updated drizzle.config.ts to use relative path to packages/db/src/schema.ts so migration generation still works

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated drizzle.config.ts schema path**
- **Found during:** Task 2 (API refactor)
- **Issue:** drizzle.config.ts pointed at `./src/db/schema.ts` which was deleted -- drizzle-kit generate would fail
- **Fix:** Updated path to `../../packages/db/src/schema.ts`
- **Files modified:** apps/api/drizzle.config.ts
- **Verification:** Path resolves correctly from apps/api/ directory
- **Committed in:** 1779cbe (Task 2 commit)

**2. [Rule 3 - Blocking] Fixed metrics.ts direct import of NewRequestEvent**
- **Found during:** Task 2 (API refactor)
- **Issue:** apps/api/src/services/metrics.ts imported `NewRequestEvent` from `@/db/schema` -- file no longer exists
- **Fix:** Added `NewRequestEvent` type re-export to @/db/index.ts, updated metrics.ts import to `@/db`
- **Files modified:** apps/api/src/db/index.ts, apps/api/src/services/metrics.ts
- **Verification:** bun run api:test passes (32/32 tests)
- **Committed in:** 1779cbe (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary to prevent build failures after schema file deletion. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- @repo/db is ready for admin app to depend on (plan 01-03 will add it as a dependency and create admin's own Drizzle instance with max: 3)
- All subsequent plans can import schema from @repo/db
- API functionality fully preserved -- transparent refactor

## Self-Check: PASSED

All files verified present/deleted as claimed. Both commit hashes confirmed in git log.

---
*Phase: 01-data-layer-match-overview*
*Completed: 2026-03-26*
