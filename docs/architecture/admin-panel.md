# Admin Panel

> v1 — 2026-04-09.
> Updated 2026-04-09 — Admin write actions implemented (BLI-154): service functions, BullMQ job types, admin mutations, UI actions.
> Updated 2026-04-19 — BLI-236 flex-tier latency observability surfaced in `/dashboard/ai-costs`: new `byServiceTier` (p50/p95 per `service_tier`) and `byJobNameAndTier` (per (jobName, tier, reasoningEffort)) tRPC procedures on `ai-costs.ts` router. Enables comparing flex vs standard latency/cost per job type.
> Updated 2026-04-22 — BLI-269 image moderation review queue (`/dashboard/moderation`, `moderation.ts` router, `admin-remove-flagged-upload` ops job). Fills the queue that BLI-268 starts writing to.
> Updated 2026-04-22 — BLI-156 suspension actions: `admin.users.suspend` / `unsuspend`, new `admin-suspend-user` / `admin-unsuspend-user` ops jobs, `"suspended"` user-list filter + status badge, ban-reason textarea dialog. See `moderation-suspension.md`.

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
| `/dashboard/users` | users + profiles + wave/msg/group counts | User list with search, status filter (includes `suspended`, BLI-156), per-type filter (Real/Demo/Test/Review, BLI-271 — default `regular`), profile detail panel; dropdown actions include "Zawieś konto" / "Odwieś konto" alongside soft-delete, plus a "Zmień typ" submenu for flipping `user.type` (used primarily to provision store-review accounts) |
| `/dashboard/users/{userId}` | connectionAnalyses + profiles (nearby query) | Per-user diagnostic: T2/T3 analyses list + full nearby list (read-only, no AI side-effects, no privacy filters). Nearby rows synthesize a `t1` tier client-side for pairs without a persisted analysis row. Backed by `user-analyses.ts` router — split out from `users.ts` because the analysis-browsing queries share no shape with the user listing endpoints. |
| `/dashboard/waves` | waves + from/to user profiles | Wave list with status filter, accept rate stats |
| `/dashboard/conversations` | conversations (type=dm) + participants | DM list with participant info, message counts |
| `/dashboard/groups` | conversations (type=group) + member counts | Group list with discoverable filter |
| `/dashboard/matching` | connectionAnalyses + user profiles | AI match scores with score range filter, color-coded |
| `/dashboard/queue` | BullMQ (ai/ops/maintenance queues) | Live feed of jobs with per-source tabs (AI/Ops/Maintenance), state tabs, job type filter. All filters stored in URL query string via `Route.validateSearch` (zod schema: `source`, `state`, `type`, `expanded`). Lives under the dedicated "Kolejki" sidebar category. State tabs include a `scheduled` pseudo-state ("Harmonogram") — Job Scheduler markers are reclassified from `delayed` via `queue.getJobSchedulers()` so the real delayed count only reflects retries; scheduled rows show interval/cron and countdown to next run. |
| `/dashboard/push-log` | `metrics.push_sends` | Push notification send log (7d retention) |
| `/dashboard/ai-costs` | `metrics.ai_calls` | AI cost dashboard — per-job/per-model/per-user breakdowns, daily charts, recent-call feed. Backed by `ai-costs.ts` router which aggregates `metrics.ai_calls` (7d retention, see `ai-cost-tracking.md`). Introduced in BLI-174; BLI-236 added per-tier latency percentiles (`byServiceTier` — p50/p95 per `service_tier`) and per-(job, tier, reasoningEffort) breakdown (`byJobNameAndTier`) to quantify flex vs standard latency/cost trade-off. |
| `/dashboard/moderation` | `moderation_results` + `profiles` (LEFT JOIN) | Image moderation review queue (BLI-269). Three tabs via `?tab=`: **Do przeglądu** (`flagged_review`) with OK / "Usuń" actions, **Historia** (reviewed_ok + reviewed_removed) read-only, **CSAM** (`blocked_csam`) read-only audit log without thumbnails (bytes never reached S3). "Usuń" enqueues `admin-remove-flagged-upload` — deletes the S3 object, nulls `profiles.avatarUrl` if it still matches the flagged source, updates the row. "OK" is a direct DB write (no side effects). Thumbnails use `resolveAvatarUri` on the stored `s3://` source. |

## Sidebar Navigation

Top-level categories in `apps/admin/src/components/app-sidebar.tsx`:

- **Użytkownicy** → users list
- **Wiadomości** → conversations, groups
- **Waves** → wave list
- **AI Matching** → analyses, prompts
- **Kolejki** → queue live feed (ai, ops, maintenance — separate from AI Matching because ops/maintenance aren't AI-related)
- **Moderacja**, **Powiadomienia**, **Ustawienia** — most items placeholder

Separate **External** group (below "Panel") with flat `SidebarMenuButton` links opening in new tab: Bugsink, Railway, GitHub, Play Console, App Store Connect. Brand icons via `@icons-pack/react-simple-icons` — lucide 1.8 no longer ships brand icons.

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
| Suspend user | `users.suspend` | `admin-suspend-user` | `suspendUser()` — see `moderation-suspension.md` |
| Unsuspend user | `users.unsuspend` | `admin-unsuspend-user` | `unsuspendUser()` |
| Re-analyze AI | `users.reanalyze` | `analyze-user-pairs` (existing) | — (reads lat/lon from DB) |
| Regenerate profile | `users.regenerateProfile` | `generate-profile-ai` (existing) + `analyze-user-pairs` | — (reads bio/lookingFor from DB) |
| Force disconnect | `users.forceDisconnect` | `admin-force-disconnect` | `publishEvent("forceDisconnect")` |
| Remove flagged upload | `moderation.enqueueRemove` | `admin-remove-flagged-upload` | Inline in `queue-ops.ts` — s3.delete + null avatarUrl if still current + update `moderation_results` to `reviewed_removed` |
| Change user type | `users.updateType` | *(direct write)* | BLI-271 — pure column flip on `user.type`. Bypasses the BullMQ-only convention because there are no side effects (no sessions invalidated, no WS events, no cross-replica coordination). Used mainly for provisioning store-review accounts. |

**BullMQ setup in admin** (`apps/admin/src/lib/queue.ts`): three lazy `Queue` singletons (`getAiQueue`, `getOpsQueue`, `getMaintenanceQueue`) matching the BLI-171 queue split. Three enqueue-and-wait wrappers route to the correct queue:

- `enqueueAiAndWait(jobName, data)` — AI matching / profiling jobs
- `enqueueOpsAndWait(jobName, data)` — user actions (soft-delete, restore, force-disconnect, data export, hard-delete)
- `enqueueMaintenanceAndWait(jobName, data)` — flush/prune jobs, consistency sweep

Each wrapper creates a scoped `QueueEvents` client, enqueues with a unique `jobId`, awaits `waitUntilFinished` (15s for ai/ops, 60s for maintenance), and closes the events client. No shared `QueueEvents` instance — the wrapper is transactional per call.

## Auth

OTP login via email. Allowed emails in `ADMIN_EMAILS` env var. Sessions persisted to `.admin-sessions.json` (gitignored) to survive HMR restarts. 24h TTL.

## Env Vars

| Var | Purpose |
|-----|---------|
| `ADMIN_EMAILS` | Comma-separated allowed admin emails |
| `DATABASE_URL` | Postgres connection string |
| `RESEND_API_KEY` | Email delivery (optional in dev) |
| `REDIS_URL` | BullMQ connection for write actions |
