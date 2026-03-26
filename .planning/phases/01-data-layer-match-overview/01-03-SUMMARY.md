---
phase: 01-data-layer-match-overview
plan: 03
subsystem: auth
tags: [better-auth, drizzle, bullmq, redis, otp, session, tanstack-start]

# Dependency graph
requires:
  - phase: 01-01
    provides: "@repo/db workspace package with createDb factory and Drizzle schema"
provides:
  - "Better Auth OTP login with DB-backed sessions for admin app"
  - "Admin DB connection via @repo/db with max: 3 pool"
  - "Bun RedisClient instance for direct Redis operations"
  - "BullMQ Queue instance for ai-jobs inspection"
  - "Auth-protected pathless layout route (_authed.tsx)"
  - "Auth client (auth-client.ts) for client-side login UI"
affects: [01-05, 01-06]

# Tech tracking
tech-stack:
  added: ["better-auth (emailOTP + tanstackStartCookies)", "bullmq (read-only Queue for job inspection)"]
  patterns: ["Better Auth catch-all handler via /api/auth/$ route", "getAuthSession server function with allowlist defense-in-depth", "Lazy singleton pattern for Redis and Queue connections"]

key-files:
  created:
    - apps/admin/src/lib/db.ts
    - apps/admin/src/lib/redis.ts
    - apps/admin/src/lib/queue.ts
    - apps/admin/src/lib/auth-client.ts
    - apps/admin/src/routes/api/auth/$.ts
    - apps/admin/src/routes/_authed.tsx
  modified:
    - apps/admin/package.json
    - apps/admin/src/lib/auth.ts
    - apps/admin/src/lib/auth-session.ts
    - bun.lock

key-decisions:
  - "Better Auth with tanstackStartCookies as last plugin for proper cookie handling in TanStack Start"
  - "Admin email allowlist checked at both OTP send time and session validation (defense in depth)"
  - "Lazy singleton pattern for Redis and Queue to avoid connecting at import time"

patterns-established:
  - "Admin auth: Better Auth catch-all at /api/auth/$, session check via getAuthSession server function"
  - "Data connections: db from @repo/db (max:3), getRedis() for Bun RedisClient, getQueue() for BullMQ"
  - "Route protection: _authed.tsx pathless layout with beforeLoad redirect"

requirements-completed: [FOUN-01a, FOUN-02, FOUN-03, FOUN-05]

# Metrics
duration: 5min
completed: 2026-03-26
---

# Phase 01 Plan 03: Better Auth + Data Layer Summary

**Better Auth OTP login replacing custom in-memory auth, with DB (max:3), Bun RedisClient, and BullMQ Queue connections for admin app**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-26T18:58:05Z
- **Completed:** 2026-03-26T19:02:59Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Replaced custom in-memory OTP auth with Better Auth (DB-backed sessions surviving Railway redeploys)
- Added data layer connections: PostgreSQL via @repo/db (max: 3), Bun RedisClient, BullMQ Queue for ai-jobs
- Created auth-protected pathless layout route for dashboard protection
- Deleted 3 old custom auth API routes (request-otp, verify-otp, logout)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add dependencies + create DB, Redis, queue, and auth modules** - `a8b98f1` (feat)
2. **Task 2: Add Better Auth handler route + authed layout + delete old API routes** - `cb4ebc1` (feat)

## Files Created/Modified
- `apps/admin/package.json` - Added better-auth, @repo/db, bullmq, drizzle-orm, postgres dependencies
- `apps/admin/src/lib/auth.ts` - Rewritten from custom OTP to Better Auth with emailOTP + tanstackStartCookies
- `apps/admin/src/lib/auth-client.ts` - Client-side Better Auth instance with emailOTPClient plugin
- `apps/admin/src/lib/auth-session.ts` - Rewritten to use auth.api.getSession with allowlist validation
- `apps/admin/src/lib/db.ts` - Admin Drizzle instance via @repo/db with max: 3 pool
- `apps/admin/src/lib/redis.ts` - Lazy Bun RedisClient singleton for direct Redis operations
- `apps/admin/src/lib/queue.ts` - Lazy BullMQ Queue singleton for ai-jobs inspection
- `apps/admin/src/routes/api/auth/$.ts` - Better Auth catch-all handler (GET + POST)
- `apps/admin/src/routes/_authed.tsx` - Auth-protected pathless layout route
- `bun.lock` - Updated with new dependencies

## Decisions Made
- Used `tanstackStartCookies()` as last plugin per Pitfall 8 from research — ensures proper cookie handling in TanStack Start's SSR context
- Admin email allowlist is checked twice: once at OTP send time (prevents sending codes to non-admins) and once at session validation (defense in depth if allowlist changes after session creation)
- Redis and Queue use lazy singleton pattern (connect on first use, not at import time) to avoid connection overhead when not needed
- Auth-session uses `getRequestHeader("cookie")` and constructs a Headers object for Better Auth's `getSession` API

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used workspace:* for @repo/db dependency**
- **Found during:** Task 1 (adding dependencies)
- **Issue:** `bun add @repo/db` tried to fetch from npm registry (404). The package is a local workspace package.
- **Fix:** Added `"@repo/db": "workspace:*"` manually to package.json instead of using `bun add`
- **Files modified:** apps/admin/package.json
- **Verification:** `bun install` succeeded, workspace link resolved
- **Committed in:** a8b98f1 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Trivial — different mechanism to add the same dependency. No scope creep.

## Issues Encountered
None

## User Setup Required
None - Better Auth shares the existing user/session tables and BETTER_AUTH_SECRET env var already configured on Railway. ADMIN_EMAILS env var already exists.

## Next Phase Readiness
- Auth foundation complete — login page (Plan 05) can use auth-client.ts for OTP flow
- Data connections ready — match dashboard (Plan 06) can query connectionAnalyses via db and inspect queue via getQueue()
- Auth-protected layout ready — dashboard routes can be nested under _authed

## Self-Check: PASSED

All files verified present/deleted as claimed. Both commit hashes confirmed in git log.

---
*Phase: 01-data-layer-match-overview*
*Completed: 2026-03-26*
