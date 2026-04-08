# Admin Panel

> v1 — 2026-04-09.

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

```ts
// services/user-actions.ts
async function softDeleteUser(userId: string) {
  await db.transaction(async (tx) => {
    // All DB writes in one transaction
  });
  // Side effects outside transaction (Redis events, BullMQ jobs)
}

// User tRPC: verifyOTP() → softDeleteUser()
// Admin BullMQ worker: softDeleteUser() directly
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
| `/dashboard/waves` | waves + from/to user profiles | Wave list with status filter, accept rate stats |
| `/dashboard/conversations` | conversations (type=dm) + participants | DM list with participant info, message counts |
| `/dashboard/groups` | conversations (type=group) + member counts | Group list with discoverable filter |
| `/dashboard/matching` | connectionAnalyses + user profiles | AI match scores with score range filter, color-coded |

## Admin Actions (Planned — BLI-xxx)

Not yet implemented. Will use BullMQ pattern described above.

| Action | Job Type | Exists in API? |
|--------|----------|---------------|
| Soft delete user | `admin-soft-delete-user` | New (extract from tRPC procedure) |
| Restore user | `admin-restore-user` | New (clear deletedAt + cancel hard-delete job) |
| Re-analyze AI | `analyze-user-pairs` | Existing job type |
| Profile regen | `generate-profile-ai` | Existing job type |
| Force disconnect | `admin-force-disconnect` | New (publishEvent wrapper) |

## Auth

OTP login via email. Allowed emails in `ADMIN_EMAILS` env var. Sessions persisted to `.admin-sessions.json` (gitignored) to survive HMR restarts. 24h TTL.

## Env Vars

| Var | Purpose |
|-----|---------|
| `ADMIN_EMAILS` | Comma-separated allowed admin emails |
| `DATABASE_URL` | Postgres connection string |
| `RESEND_API_KEY` | Email delivery (optional in dev) |
| `REDIS_URL` | BullMQ connection (planned, for write actions) |
