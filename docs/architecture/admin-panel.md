# Admin Panel

> v1 — 2026-04-09.
> Updated 2026-04-09 — Admin write actions implemented (BLI-154): service functions, BullMQ job types, admin mutations, UI actions.

Internal admin panel for managing users, conversations, waves, groups, and AI matching. TanStack Start + Vite + Nitro, deployed on Railway.

## Architecture Principles

### Reads: Direct DB
Admin tRPC queries read from Postgres directly via `@repo/db`. No network hop, fast, type-safe.

### Writes: BullMQ Jobs Only
Admin tRPC mutations enqueue BullMQ jobs. API worker processes them using shared service functions. Admin never contains business logic for writes — it's a remote control.

```
Reads:   Admin tRPC query    → Drizzle → Postgres
Writes:  Admin tRPC mutation → BullMQ enqueue → waitUntilFinished → API worker → service function → DB + Redis
```

**Why BullMQ, not direct DB writes?** Write operations have side effects beyond DB changes — clearing sessions, disconnecting WebSockets, scheduling delayed jobs, publishing Redis events. These live in API service functions. Duplicating them in admin would create divergent code paths. BullMQ ensures a single source of truth for business logic.

**Why `waitUntilFinished`, not fire-and-forget?** Admin needs synchronous feedback — "user deleted" vs "error". `QueueEvents` provides this with one extra Redis connection.

### Service Functions Pattern
Business logic lives in `apps/api/src/services/` as standalone functions. Both tRPC procedures (user-initiated) and BullMQ workers (admin-initiated) call the same functions. The only difference: user path requires auth/OTP, admin path doesn't.

**Implemented in `apps/api/src/services/user-actions.ts`:**

- `softDeleteUser(userId)` — transaction: set `deletedAt`, delete sessions, delete push tokens. Post-transaction: `forceDisconnect` WS event + enqueue `hard-delete-user` delayed job.
- `restoreUser(userId)` — clear `deletedAt` + cancel pending `hard-delete-user` BullMQ job.

```
User tRPC:  verifyOTP() → softDeleteUser()
Admin BullMQ worker:       softDeleteUser() directly
```

**Rule: DB writes inside transaction, side effects outside.** If Redis fails, DB changes still committed. Side effects can be retried.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | TanStack Start + Vite |
| Server | Nitro |
| Routing | TanStack Router (file-based) |
| Data fetching | tRPC v11 + TanStack Query |
| DB | Drizzle ORM via `@repo/db` (shared schema) |
| Queue | BullMQ (writes only) |
| UI | shadcn/ui v4 (base-nova), Tailwind CSS v4 |
| Auth | OTP via email, in-memory + file-persisted sessions |

## Shared Package: `@repo/db`

Schema + connection factory shared between API and admin.

- `packages/db/src/schema.ts` — full Drizzle schema (source of truth)
- `packages/db/src/index.ts` — `createDb(connectionString)` factory + re-exports
- `apps/api/src/db/schema.ts` — re-exports from `@repo/db/schema`
- Drizzle config (`apps/api/drizzle.config.ts`) still points to API's schema file

## Pages

| Route | Data | Description |
|-------|------|-------------|
| `/dashboard` | — | Layout with sidebar, renders child routes |
| `/dashboard/` | — | Home (placeholder cards) |
| `/dashboard/users` | users + profiles + wave/msg/group counts | User list with search, status filter, seed toggle, profile detail panel |
| `/dashboard/users/{userId}` | connectionAnalyses + profiles (nearby query) | Per-user diagnostic: T2/T3 analyses list + full nearby list (read-only, no AI side-effects, no privacy filters). Nearby rows synthesize a `t1` tier client-side for pairs without a persisted analysis row. |
| `/dashboard/waves` | waves + from/to user profiles | Wave list with status filter, accept rate stats |
| `/dashboard/conversations` | conversations (type=dm) + participants | DM list with participant info, message counts |
| `/dashboard/groups` | conversations (type=group) + member counts | Group list with discoverable filter |
| `/dashboard/matching` | connectionAnalyses + user profiles | AI match scores with score range filter, color-coded |
| `/dashboard/queue` | BullMQ (ai/ops/maintenance queues) | Live feed of jobs with per-source tabs (AI/Ops/Maintenance), state tabs, job type filter. All filters stored in URL query string via `Route.validateSearch` (zod schema: `source`, `state`, `type`, `expanded`). Lives under the dedicated "Kolejki" sidebar category. |
| `/dashboard/push-log` | `metrics.push_sends` | Push notification send log (7d retention) |

## Sidebar Navigation

Top-level categories in `apps/admin/src/components/app-sidebar.tsx`:

- **Użytkownicy** → users list
- **Wiadomości** → conversations, groups
- **Waves** → wave list
- **AI Matching** → analyses, prompts
- **Kolejki** → queue live feed (ai, ops, maintenance — separate from AI Matching because ops/maintenance aren't AI-related)
- **Moderacja**, **Powiadomienia**, **Ustawienia** — most items placeholder

## URL State Pattern

`/dashboard/queue` is the first admin route to use TanStack Router's `validateSearch` for URL-persisted filter state. Pattern:

1. Define zod schema for search params at the top of the route file
2. `Route.validateSearch: schema` on `createFileRoute(...)`
3. `Route.useSearch()` replaces `useState` for filter values
4. Helper `updateSearch(patch)` via `navigate({ search: (prev) => ... })` — strips empty/default values to keep URL clean
5. Ephemeral UI state (e.g., `isLive` toggle) stays in `useState`

Benefits: shareable filtered views, browser back button, refresh-safe. New admin pages with filters should follow this pattern.

## Admin Actions

Implemented via BLI-154. Admin tRPC mutations enqueue BullMQ jobs, wait for API worker to finish (`waitUntilFinished`, 15s timeout).

| Action | Admin Mutation | Job Type | Service Function |
|--------|---------------|----------|-----------------|
| Soft delete user | `users.softDelete` | `admin-soft-delete-user` | `softDeleteUser()` |
| Restore user | `users.restore` | `admin-restore-user` | `restoreUser()` |
| Re-analyze AI | `users.reanalyze` | `analyze-user-pairs` (existing) | — (reads lat/lon from DB) |
| Regenerate profile | `users.regenerateProfile` | `generate-profile-ai` (existing) + `analyze-user-pairs` | — (reads bio/lookingFor from DB) |
| Force disconnect | `users.forceDisconnect` | `admin-force-disconnect` | `publishEvent("forceDisconnect")` |

**BullMQ setup in admin** (`apps/admin/src/lib/queue.ts`): `Queue` + `QueueEvents` client connected via `REDIS_URL`. Single exported function `enqueueAndWait(jobName, data)` handles enqueue + wait pattern.

## Auth

OTP login via email. Allowed emails in `ADMIN_EMAILS` env var. Sessions persisted to `.admin-sessions.json` (gitignored) to survive HMR restarts. 24h TTL.

## Env Vars

| Var | Purpose |
|-----|---------|
| `ADMIN_EMAILS` | Comma-separated allowed admin emails |
| `DATABASE_URL` | Postgres connection string |
| `RESEND_API_KEY` | Email delivery (optional in dev) |
| `REDIS_URL` | BullMQ connection for write actions |
