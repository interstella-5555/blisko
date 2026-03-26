---
phase: 01-data-layer-match-overview
plan: 05
subsystem: ui
tags: [sidebar, navigation, better-auth, otp, shadcn, tailwind, tanstack-router, admin-dashboard]

# Dependency graph
requires:
  - phase: 01-03
    provides: "Better Auth client (auth-client.ts), authed layout route (_authed.tsx), auth-session server function"
  - phase: 01-04
    provides: "shadcn/ui components (button, input, label, sidebar), CSS variables, lucide-react icons"
provides:
  - "Dark sidebar navigation with Matches active and Ops/Users/API disabled"
  - "Better Auth OTP login page replacing old custom fetch calls"
  - "Dashboard route shell at /_authed/dashboard ready for Plan 06 content"
  - "Authed layout wrapping children with SidebarProvider + AppSidebar"
affects: [01-06]

# Tech tracking
tech-stack:
  added: []
  patterns: ["AppSidebar component with nav items and user email footer", "SidebarProvider wrapping authed layout for sidebar state management"]

key-files:
  created:
    - apps/admin/src/components/app-sidebar.tsx
    - apps/admin/src/routes/_authed/dashboard.tsx
  modified:
    - apps/admin/src/routes/_authed.tsx
    - apps/admin/src/routes/login.tsx
    - apps/admin/src/styles/app.css

key-decisions:
  - "Nav items use disabled + cursor-not-allowed for Ops/Users/API (not links) since those routes don't exist yet"
  - "Login page Polish copy uses ASCII-safe characters (no diacritics) matching UI-SPEC: Wyslij kod, Weryfikacja, Zmien adres email"
  - "Dashboard shell at /_authed/dashboard is intentionally minimal (Plan 06 fills it with match data)"

patterns-established:
  - "AppSidebar receives email from route context, uses authClient.signOut() for logout"
  - "Authed layout: SidebarProvider > AppSidebar + main.flex-1 > Outlet"
  - "Login flow: authClient.emailOtp.sendVerificationOtp() then authClient.emailOtp.verifyEmail()"

requirements-completed: [NAVI-02]

# Metrics
duration: 11min
completed: 2026-03-26
---

# Phase 01 Plan 05: Sidebar Layout + Login + Dashboard Shell Summary

**Dark sidebar navigation with Matches active, Better Auth OTP login replacing custom fetch calls, and dashboard route shell under authed layout**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-26T19:18:11Z
- **Completed:** 2026-03-26T19:29:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Built dark sidebar (bg-slate-900) with Matches active, Ops/Users/API disabled with tooltip "Dostepne wkrotce"
- Rebuilt login page with Better Auth OTP flow (authClient.emailOtp) and shadcn Button/Input/Label components
- Created dashboard shell at /_authed/dashboard ready for Plan 06 match data
- Deleted old "Panel w budowie" placeholder and removed all legacy login CSS classes

## Task Commits

Each task was committed atomically:

1. **Task 1: Build sidebar component + update authed layout** - `4fffe0e` (feat)
2. **Task 2: Rebuild login page + create dashboard shell + delete old placeholder** - `f4cf039` (feat)

## Files Created/Modified
- `apps/admin/src/components/app-sidebar.tsx` - Sidebar with nav items, user email footer, logout via authClient.signOut()
- `apps/admin/src/routes/_authed.tsx` - Wraps Outlet with SidebarProvider + AppSidebar, passes email from route context
- `apps/admin/src/routes/login.tsx` - Better Auth OTP login with shadcn components (replaced custom fetch calls)
- `apps/admin/src/routes/_authed/dashboard.tsx` - Dashboard page shell for Plan 06 to fill
- `apps/admin/src/routes/dashboard.tsx` - Deleted (old "Panel w budowie" placeholder)
- `apps/admin/src/styles/app.css` - Removed old .login-page, .login-card, .form-group, .btn, .btn-link CSS classes

## Decisions Made
- Nav items for Ops, Users, API are disabled buttons (not links) since those routes don't exist yet -- prevents navigation to undefined routes
- Login page Polish copy uses ASCII-safe characters matching the UI-SPEC (no diacritics in code)
- Dashboard shell is intentionally a minimal placeholder ("Analiza matchow" heading + "Ladowanie danych...") -- Plan 06 will replace it with match overview content

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Plans 03 and 04 were executed by parallel agents on separate worktrees. Cherry-picked their commits (a8b98f1, cb4ebc1, 25e63e5) to get dependency files (auth-client.ts, _authed.tsx, sidebar.tsx, shadcn components) before starting plan execution. Package.json merge conflict resolved by combining both sets of dependencies.

## User Setup Required
None - no external service configuration required.

## Known Stubs

1. **Dashboard content placeholder** - `apps/admin/src/routes/_authed/dashboard.tsx` line 10: "Ladowanie danych..." -- intentional, Plan 06 will fill with match overview data

## Next Phase Readiness
- Sidebar + layout complete -- Plan 06 can add match data content to the dashboard shell
- All navigation infrastructure in place for future Ops/Users/API routes
- Login fully functional with Better Auth OTP flow

## Self-Check: PASSED

---
*Phase: 01-data-layer-match-overview*
*Completed: 2026-03-26*
