# Phase 1: Data Layer & Match Overview - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 01-data-layer-match-overview
**Areas discussed:** Shared schema strategy, Auth approach, Match overview layout, Navigation structure

---

## Shared Schema Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Extract to packages/db | Move schema + db factory to shared workspace package. Both api and admin import from @repo/db. | ✓ |
| Direct cross-workspace import | Admin imports directly from apps/api/src/db/. Quick but tight coupling. | |
| Schema-only package | Extract only schema.ts, each app creates own Drizzle instance locally. | |

**User's choice:** Extract to packages/db
**Notes:** Clean separation, single source of truth

| Option | Description | Selected |
|--------|-------------|----------|
| Factory function | packages/db exports createDb(config), each app calls with own pool size | ✓ |
| Separate instances, no factory | packages/db exports only schema + types, each app writes own setup | |
| You decide | Let Claude pick | |

**User's choice:** Factory function
**Notes:** API gets default pool, admin gets max: 3

| Option | Description | Selected |
|--------|-------------|----------|
| Keep instrumentation in api only | Clean separation — admin gets simple db, api adds wrapper | ✓ |
| Make opt-in in factory | Add instrument option to createDb() | |

**User's choice:** Keep in api only
**Notes:** User asked to see what the instrumentation does first, then agreed to keep it API-specific

---

## Auth Approach

*User raised this area organically: "a moze powinnismy uzyc tego samego mechanizmu logowania co w blisko z better auth"*

| Option | Description | Selected |
|--------|-------------|----------|
| Better Auth + admin flag | Use same Better Auth as main app, DB-backed sessions, admin users marked | ✓ |
| Keep custom OTP, fix sessions | Keep standalone OTP, move sessionStore to Redis | |
| Better Auth + email allowlist env | Better Auth for login, ADMIN_EMAILS env for access | |

**User's choice:** Better Auth + admin flag
**Notes:** User pointed out Better Auth has OTP support (used in mobile app already)

| Option | Description | Selected |
|--------|-------------|----------|
| isAdmin column | Add boolean column to user table | |
| ADMIN_EMAILS env var | Keep existing env var approach | ✓ |
| Separate admin_users table | New table with admin email + role | |

**User's choice:** ADMIN_EMAILS env var
**Notes:** No migration needed, easy to change on Railway

| Option | Description | Selected |
|--------|-------------|----------|
| Keep login UI, swap backend | Replace auth.ts with Better Auth calls behind same UI | |
| Rebuild with Better Auth defaults | Use Better Auth's OTP flow end-to-end | ✓ |

**User's choice:** Rebuild with Better Auth defaults

---

## Match Overview Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Table with expandable rows | Click to expand row for details | |
| Card grid | Each analysis as a card | |
| Split view | Left list, right detail panel | |

**User's choice:** Table layout, but NOT expandable rows — slide-in Sheet panel from the right instead (shadcn Sheet component)

| Option | Description | Selected |
|--------|-------------|----------|
| Full analysis details | Both users, score, AI reasoning, profile hashes, timestamps, telemetry | ✓ |
| Minimal — score + reasoning only | Just pair, score, snippet, status | |
| You decide | Claude designs panel content | |

**User's choice:** Full analysis details
**Notes:** User specifically wants maximum telemetry — lifecycle timing, trigger source, status durations

| Option | Description | Selected |
|--------|-------------|----------|
| Paginated table | 25-50 rows, server-side pagination | ✓ |
| Infinite scroll | Continuous scrolling | |

**User's choice:** Paginated table
**Notes:** User initially asked about infinite scroll for live mode — clarified that live feed is Phase 3 (separate panel)

| Option | Description | Selected |
|--------|-------------|----------|
| Chronological only | Newest first, no filters | ✓ |
| Basic filters | Filter by status, sort by score/date | |

**User's choice:** Chronological only

| Option | Description | Selected |
|--------|-------------|----------|
| shadcn/ui | Add shadcn/ui to admin app for Table, Sheet, Badge | ✓ |
| Custom Tailwind components | Build from scratch | |

**User's choice:** shadcn/ui

| Option | Description | Selected |
|--------|-------------|----------|
| BullMQ built-in telemetry | Show timing, attempts, errors from BullMQ | |
| Add trigger source too | Also add triggeredBy field to job data | ✓ |

**User's choice:** Add trigger source too
**Notes:** User wants to know what triggered each analysis (wave:send, profile:update, script:scatter)

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-refresh every 10-30s | Polling for queue health counts | ✓ |
| Manual refresh button | Load on page load, click to update | |

**User's choice:** Auto-refresh every 10-30s

---

## Navigation Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Sidebar | Fixed left sidebar with icon + label | ✓ |
| Top nav bar | Horizontal navigation | |
| Minimal | No persistent nav in Phase 1 | |

**User's choice:** Sidebar

| Option | Description | Selected |
|--------|-------------|----------|
| Only Matches | Just the active section | |
| Show placeholders (disabled) | All planned sections, greyed out | ✓ |

**User's choice:** Show placeholders (disabled)

| Option | Description | Selected |
|--------|-------------|----------|
| Dark sidebar, light content | Dark/slate sidebar, white content area | ✓ |
| All light | White sidebar with border | |

**User's choice:** Dark sidebar, light content

---

## Claude's Discretion

- Exact polling interval for queue health (10s vs 30s)
- shadcn/ui component selection beyond Table/Sheet/Badge
- Page size (25 or 50)
- Sidebar section labels and icons

## Deferred Ideas

None — discussion stayed within phase scope
