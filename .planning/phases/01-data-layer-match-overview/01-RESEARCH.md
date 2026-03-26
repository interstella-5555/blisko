# Phase 1: Data Layer & Match Overview - Research

**Researched:** 2026-03-26
**Domain:** TanStack Start admin dashboard with shared Drizzle schema, Better Auth, BullMQ queue inspection, shadcn/ui
**Confidence:** HIGH

## Summary

This phase wires up the admin app (`apps/admin`) to the existing PostgreSQL and Redis infrastructure, replaces the custom in-memory OTP auth with Better Auth (DB-backed sessions), and builds the first real dashboard screen showing match analyses and queue health. The admin app already exists as a TanStack Start project with Tailwind CSS, Nitro server routes, and a working login flow -- all of which get replaced or upgraded.

The biggest architectural change is extracting `apps/api/src/db/schema.ts` into a new `packages/db` workspace package so both API and admin import from `@repo/db`. This is a refactor of existing code with zero schema changes -- the Drizzle schema, relations, and migrations stay in place. The admin app gets its own Drizzle instance with a small connection pool (`max: 3`) to avoid exhausting the shared PostgreSQL connection limit.

For the match overview, the dashboard reads completed analyses from the `connectionAnalyses` table (not from BullMQ history, since `removeOnComplete: true` deletes completed jobs from Redis). Queue health (waiting/active/completed/failed counts) comes from BullMQ's read-only `Queue.getJobCounts()` API, and failed jobs (retained up to 100 via `removeOnFail: { count: 100 }`) provide error details. The `triggeredBy` field addition to job data requires modifying `queue.add()` call sites in the API.

**Primary recommendation:** Extract schema to `packages/db` first, then wire auth, then build the dashboard UI. Each step has a clear verification point.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Extract Drizzle schema to `packages/db` as a shared workspace package. Both `apps/api` and `apps/admin` import from `@repo/db`.
- **D-02:** `@repo/db` exports a `createDb(config)` factory function. Each app creates its own Drizzle instance with its own pool size (`api`: default, `admin`: `max: 3`).
- **D-03:** API's query instrumentation (monkey-patched `client.unsafe` for per-request timing) stays in `apps/api/src/db/`. The `@repo/db` factory returns a clean, uninstrumented Drizzle instance. Admin doesn't need request-level query tracking.
- **D-04:** Replace the current custom OTP auth (`apps/admin/src/lib/auth.ts`) with Better Auth's OTP plugin -- same mechanism used in the mobile app. Delete the custom auth code entirely.
- **D-05:** Sessions are DB-backed via Better Auth's session table -- solves FOUN-05 (sessions surviving Railway redeploys) for free.
- **D-06:** Admin access controlled via `ADMIN_EMAILS` env var (existing pattern). After Better Auth login, check if the authenticated email is in the allowlist. No schema changes needed (no `isAdmin` column).
- **D-07:** Rebuild login page using Better Auth's OTP flow end-to-end, not just swapping the backend behind the existing UI.
- **D-08:** Match monitoring screen uses a paginated data table (25-50 rows, server-side pagination) showing recent match analyses. Columns: pair names, match score, status, timestamp. Chronological order (newest first), no filtering/sorting in Phase 1.
- **D-09:** Clicking a table row opens a slide-in Sheet panel from the right (shadcn Sheet component) -- not expandable rows.
- **D-10:** Sheet panel shows full analysis details: both user names, match score with color coding, AI reasoning (short snippet + long description), profile hashes, and comprehensive telemetry.
- **D-11:** Telemetry in the sheet panel includes all BullMQ lifecycle data: enqueued timestamp, wait time, processing time, total duration, attempts count, job ID. For failed jobs: error message and stack trace.
- **D-12:** Add a `triggeredBy` field to job data in the API (e.g. `wave:send`, `profile:update`, `script:scatter`) so the sheet panel shows what triggered each analysis. This requires modifying `queue.add()` calls in `apps/api`.
- **D-13:** Queue health summary (waiting/active/completed/failed counts for analyze-pair jobs) displayed above the table. Auto-refreshes every 10-30 seconds via polling.
- **D-14:** UI components via shadcn/ui -- Table, Sheet, Badge, and other primitives. Add shadcn/ui to the admin app.
- **D-15:** Fixed left sidebar with dark/slate background, contrasting with light content area. Classic admin dashboard pattern.
- **D-16:** Sidebar shows the active "Matches" section plus disabled/greyed-out placeholders for future sections (Ops, Users, API). Gives a sense of what's coming without suggesting unimplemented features work.
- **D-17:** Sidebar includes user email and logout button at the bottom. Uses shadcn sidebar component.

### Claude's Discretion
- Exact polling interval for queue health (10s vs 30s -- pick based on performance)
- shadcn/ui component selection beyond Table/Sheet/Badge (pick what fits)
- Page size for match table pagination (25 or 50)
- Exact sidebar section labels and icons

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUN-01 | Drizzle schema extracted to packages/db as a shared workspace package | D-01 through D-03: `packages/db` with `createDb()` factory, schema + relations exports. API keeps instrumentation wrapper locally. |
| FOUN-01a | Admin app connects to PostgreSQL via Drizzle using shared schema from packages/db | D-02: Admin creates its own Drizzle instance via `createDb({ max: 3 })`. Uses same `DATABASE_URL` env var. |
| FOUN-02 | Admin app connects to Redis via Bun RedisClient | Direct `new RedisClient(process.env.REDIS_URL)` -- same pattern as API. Used for BullMQ Queue connection config. |
| FOUN-03 | Admin app instantiates BullMQ Queue for read-only job inspection | Read-only `new Queue("ai-jobs", { connection })` -- no Worker, just `getJobCounts()` and `getJobs()` for monitoring. |
| FOUN-04 | Connection pool sizing is explicit and documented | D-02: Admin pool `max: 3`, API default (currently unlimited, ~10 from postgres.js defaults). Total well under Railway's 97 connection limit. |
| FOUN-05 | Admin sessions persist across Railway redeploys | D-04/D-05: Better Auth DB-backed sessions in existing `session` table. Replaces in-memory Map. |
| MTCH-01 | Dashboard shows overview of recent match analyses | D-08: Paginated table from `connectionAnalyses` table. Joined with `profiles` for display names. Server-side pagination, newest first. |
| MTCH-02 | User can see match analysis details | D-09/D-10: Sheet panel with score, AI reasoning (shortSnippet + longDescription), profile hashes, telemetry. |
| MTCH-03 | User can see queue state for analyze-pair jobs | D-13: `Queue.getJobCounts()` for waiting/active/completed/failed. Polling every 15s. Displayed as stat cards above table. |
| NAVI-01 | Dashboard replaces "Panel w budowie" placeholder after login | D-07/D-08: Login redirects to match monitoring dashboard, not the current placeholder. |
| NAVI-02 | Clean, functional layout with sidebar for future sections | D-15/D-16/D-17: shadcn Sidebar with dark background, active Matches section, disabled placeholders for Ops/Users/API. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.1 | PostgreSQL ORM (shared schema package) | Already used in API, catalog-pinned |
| postgres | 3.4.0 | PostgreSQL client driver | Already used in API, catalog-pinned |
| better-auth | 1.5.4+ (catalog) | OTP auth with DB-backed sessions | Already used in mobile/API, has TanStack Start integration |
| bullmq | 5.69.2+ | Read-only queue inspection | Already used in API for job processing |
| @tanstack/react-start | 1.166.17 (catalog) | SSR framework | Already used for admin app |
| @tanstack/react-router | 1.167.5 (catalog) | File-based routing | Already used for admin app |
| tailwindcss | 4.2.2 (catalog) | Utility CSS | Already configured in admin app |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui | latest (CLI) | UI component library (Table, Sheet, Badge, Sidebar) | All dashboard UI components -- D-14 decision |
| lucide-react | 0.561.0 | Icon library | Already in project, used for sidebar and status icons |
| resend | 6.8.0 | Email delivery for OTP | Already in admin app for custom OTP emails, reused for Better Auth OTP |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn/ui | Hand-rolled components | shadcn provides composable, unstyled primitives that work with Tailwind -- no reason to hand-roll |
| BullMQ Queue for monitoring | Bull Board / Arena | Separate UI tool, doesn't integrate into the dashboard. BullMQ's native Queue API is sufficient for counts + job inspection |

**Installation (for `packages/db`):**
```bash
# packages/db gets drizzle-orm and postgres from workspace catalog
# In packages/db/package.json:
"dependencies": {
  "drizzle-orm": "catalog:",
  "postgres": "catalog:"
}
```

**Installation (for admin app additions):**
```bash
# Add to apps/admin dependencies
cd apps/admin
bun add better-auth@catalog: drizzle-orm@catalog: postgres@catalog: bullmq @repo/db

# Initialize shadcn/ui in admin app
bunx --bun shadcn@latest init
# Then add components:
bunx --bun shadcn@latest add table sheet badge sidebar button input label card
```

## Architecture Patterns

### Recommended Project Structure (changes only)
```
packages/
  db/                           # NEW: shared Drizzle schema package
    package.json                # @repo/db, exports schema + createDb
    src/
      index.ts                  # createDb() factory + re-exports
      schema.ts                 # MOVED from apps/api/src/db/schema.ts
      prepare.ts                # MOVED from apps/api/src/db/prepare.ts

apps/
  api/
    src/
      db/
        index.ts                # MODIFIED: imports from @repo/db, wraps with instrumentation
        schema.ts               # DELETED (moved to packages/db)
        prepare.ts              # DELETED (moved to packages/db)

  admin/
    src/
      lib/
        auth.ts                 # REPLACED: Better Auth instance with emailOTP + tanstackStartCookies
        auth-session.ts         # REPLACED: uses auth.api.getSession()
        db.ts                   # NEW: createDb({ max: 3 }) from @repo/db
        queue.ts                # NEW: read-only BullMQ Queue instance for inspection
        email.ts                # KEPT: reused for Better Auth OTP emails
        rate-limit.ts           # KEPT: in-memory rate limiter for API routes
      routes/
        api/
          auth/
            $.ts                # NEW: Better Auth catch-all handler (GET + POST)
          request-otp.ts        # DELETED (replaced by Better Auth)
          verify-otp.ts         # DELETED (replaced by Better Auth)
          logout.ts             # DELETED (replaced by Better Auth)
          matches.ts            # NEW: server route for paginated match data
          queue-health.ts       # NEW: server route for BullMQ job counts
        __root.tsx              # MODIFIED: adds SidebarProvider wrapper
        _authed.tsx             # NEW: pathless layout for auth-protected routes
        _authed/
          dashboard.tsx         # NEW: match monitoring dashboard (replaces old dashboard.tsx)
        login.tsx               # MODIFIED: Better Auth OTP flow
        index.tsx               # KEPT: redirect logic
        dashboard.tsx           # DELETED (moved under _authed/)
      components/
        ui/                     # NEW: shadcn/ui components (auto-generated)
        app-sidebar.tsx         # NEW: sidebar with nav items + user footer
        match-table.tsx         # NEW: paginated table of connection analyses
        match-detail-sheet.tsx  # NEW: slide-in sheet with analysis details
        queue-health-cards.tsx  # NEW: stat cards for queue counts
    components.json             # NEW: shadcn/ui configuration
```

### Pattern 1: Shared Schema Package (`packages/db`)
**What:** A workspace package that exports the Drizzle schema and a factory function for creating DB instances.
**When to use:** When multiple apps in the monorepo need the same database schema.
**Example:**
```typescript
// packages/db/src/index.ts
import { drizzle } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

export { schema };
export type { schema as SchemaType };
export { preparedName } from "./prepare";

interface CreateDbOptions {
  connectionString: string;
  max?: number;
}

export function createDb({ connectionString, max }: CreateDbOptions) {
  const client = postgres(connectionString, { max });
  return { db: drizzle(client, { schema }), client };
}
```

```typescript
// apps/api/src/db/index.ts (after refactor)
import { createDb, schema } from "@repo/db";
export { schema };
export { preparedName } from "@repo/db";

const { db: rawDb, client } = createDb({
  connectionString: process.env.DATABASE_URL!,
});

// Apply instrumentation wrapper (API-only concern)
// ... existing monkey-patch code on client.unsafe ...

export const db = rawDb;
```

```typescript
// apps/admin/src/lib/db.ts
import { createDb } from "@repo/db";

const { db } = createDb({
  connectionString: process.env.DATABASE_URL!,
  max: 3,
});

export { db };
export { schema } from "@repo/db";
```

### Pattern 2: Better Auth for Admin (Second Instance, Shared DB)
**What:** A second Better Auth instance in the admin app, sharing the same `user` and `session` tables as the API.
**When to use:** When admin and API share the same user database but have different auth flows.
**Example:**
```typescript
// apps/admin/src/lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "./db";
import { schema } from "@repo/db";
import { sendEmail, adminOtp } from "./email";

const ALLOWED_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3001",
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in") return;
        // Check allowlist before sending OTP
        if (!ALLOWED_EMAILS.includes(email.toLowerCase())) return;
        console.log(`[admin] OTP for ${email}: ${otp}`);
        await sendEmail(email, adminOtp(otp));
      },
      otpLength: 6,
      expiresIn: 300,
    }),
    tanstackStartCookies(), // MUST be last plugin
  ],
});
```

### Pattern 3: Read-Only BullMQ Queue for Monitoring
**What:** A BullMQ `Queue` instance that only reads job state, never processes or modifies jobs.
**When to use:** Monitoring dashboards that need queue health without running a worker.
**Example:**
```typescript
// apps/admin/src/lib/queue.ts
import { Queue } from "bullmq";

let _queue: Queue | null = null;

function getConnectionConfig() {
  const url = new URL(process.env.REDIS_URL!);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}

export function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue("ai-jobs", {
      connection: getConnectionConfig(),
    });
  }
  return _queue;
}
```

### Pattern 4: Server-Side Paginated Data with Nitro Routes
**What:** Server route that queries the DB with OFFSET/LIMIT and returns JSON.
**When to use:** Tables with server-side pagination in TanStack Start.
**Example:**
```typescript
// apps/admin/src/routes/api/matches.ts
import { createFileRoute } from "@tanstack/react-router";
import { db, schema } from "~/lib/db";
import { desc, eq } from "drizzle-orm";

export const Route = createFileRoute("/api/matches")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Auth check first (via Better Auth session)
        const url = new URL(request.url);
        const page = Number(url.searchParams.get("page") || "1");
        const limit = 25;
        const offset = (page - 1) * limit;

        const analyses = await db
          .select({
            id: schema.connectionAnalyses.id,
            fromUserId: schema.connectionAnalyses.fromUserId,
            toUserId: schema.connectionAnalyses.toUserId,
            aiMatchScore: schema.connectionAnalyses.aiMatchScore,
            shortSnippet: schema.connectionAnalyses.shortSnippet,
            createdAt: schema.connectionAnalyses.createdAt,
            updatedAt: schema.connectionAnalyses.updatedAt,
          })
          .from(schema.connectionAnalyses)
          .orderBy(desc(schema.connectionAnalyses.updatedAt))
          .limit(limit)
          .offset(offset);

        return Response.json({ analyses, page, limit });
      },
    },
  },
});
```

### Pattern 5: Authenticated Layout with `_authed` Pathless Route
**What:** TanStack Router pathless layout that checks session before rendering children.
**When to use:** Protecting all dashboard routes behind authentication.
**Example:**
```typescript
// apps/admin/src/routes/_authed.tsx
import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { getSession } from "~/lib/auth-session";
import { SidebarProvider } from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/app-sidebar";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { user: session.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1">
        <Outlet />
      </main>
    </SidebarProvider>
  );
}
```

### Anti-Patterns to Avoid
- **Reading completed jobs from BullMQ for history:** `removeOnComplete: true` deletes them. Use the `connectionAnalyses` DB table for historical data.
- **Sharing the API's Drizzle instance directly:** The API has monkey-patched query instrumentation. Admin needs its own clean instance.
- **Using `ioredis` for direct Redis ops in admin:** Project rule (`infra/bun-redis`) mandates Bun's native `RedisClient`. BullMQ internally uses `ioredis` but our code must not.
- **Running migrations from admin:** Admin is read-only for schema. Migrations stay in `apps/api/drizzle/` and run via the API's deploy hook.
- **Using `db.select()` without explicit columns:** Project rule (`drizzle/no-star-select`) requires specifying columns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OTP authentication | Custom in-memory Map with sessions | Better Auth emailOTP plugin | DB-backed sessions, timing-safe verification, session management, cookie handling -- all built-in |
| Data table with pagination | Custom table HTML | shadcn/ui Table + server-side OFFSET/LIMIT | Accessible, styled, composable. Server pagination is trivial with Drizzle |
| Slide-in detail panel | Custom overlay/modal | shadcn/ui Sheet | Handles focus management, keyboard navigation, animations, backdrop |
| Sidebar navigation | Custom sidebar HTML | shadcn/ui Sidebar | Collapsible, responsive, composable sections, handles state |
| Queue health monitoring | Custom Redis key scanning | BullMQ Queue.getJobCounts() | Atomic Lua-based counts, handles all job states correctly |

**Key insight:** Every UI component in this phase has a shadcn/ui equivalent. Every backend concern (auth, queue inspection, DB access) has a library solution already in the project. The implementation is assembly, not invention.

## Common Pitfalls

### Pitfall 1: BullMQ `removeOnComplete: true` hides job history
**What goes wrong:** Attempting to list completed jobs via `queue.getJobs(["completed"])` returns nothing because completed jobs are auto-removed.
**Why it happens:** The API queue config has `removeOnComplete: true` as a default job option.
**How to avoid:** Use the `connectionAnalyses` DB table as the source of truth for completed match analyses. BullMQ only provides real-time state (waiting/active counts) and failed job history (up to 100 retained via `removeOnFail: { count: 100 }`).
**Warning signs:** Empty completed jobs list despite seeing the queue processing.

### Pitfall 2: Better Auth secret mismatch
**What goes wrong:** Admin auth creates sessions that the API can't read, or vice versa. Users authenticated in the API can't access admin.
**Why it happens:** Different `BETTER_AUTH_SECRET` values between apps, or different `baseURL` configurations.
**How to avoid:** Use the same `BETTER_AUTH_SECRET` env var value on both Railway services. The admin needs its own `BETTER_AUTH_URL` pointing to `https://admin.blisko.app` (or `http://localhost:3001` locally). Sessions are DB-backed and tied to the secret, not the URL.
**Warning signs:** "Invalid session" errors after successful OTP verification.

### Pitfall 3: Admin email allowlist bypass
**What goes wrong:** Any user with an account in the `user` table can log into the admin dashboard.
**Why it happens:** Better Auth's emailOTP plugin sends OTP to any email by default. The allowlist check must happen before sending the OTP AND after session creation.
**How to avoid:** Check `ADMIN_EMAILS` allowlist in two places: (1) in `sendVerificationOTP` callback to prevent sending OTP to non-admins, and (2) in the `beforeLoad` auth check to verify the session email is still in the allowlist. Defense in depth.
**Warning signs:** Non-admin users receiving OTP emails.

### Pitfall 4: Drizzle `drizzle-orm/pg-core` vs `drizzle-orm/postgres-js`
**What goes wrong:** Import from wrong path breaks type inference or runtime behavior.
**Why it happens:** Drizzle has multiple dialect-specific entry points. The schema uses `drizzle-orm/pg-core` for table definitions, but `createDb` needs `drizzle` from `drizzle-orm/postgres-js` specifically.
**How to avoid:** Schema imports from `drizzle-orm/pg-core`, the `drizzle()` function from `drizzle-orm/postgres-js`. Keep these in separate files within `packages/db`.
**Warning signs:** TypeScript errors about incompatible types between `PgTable` variants.

### Pitfall 5: Connection pool exhaustion on Railway
**What goes wrong:** Admin app opens too many connections, hitting the 97-connection Railway PostgreSQL limit shared with the API.
**Why it happens:** Default `postgres()` connection pool size is 10. Multiple services + admin + API = too many.
**How to avoid:** Explicitly set `max: 3` in the admin's `createDb()` call (D-02 decision). Document this in the `createDb` factory as a required parameter.
**Warning signs:** `FATAL: too many connections for role` errors in Railway logs.

### Pitfall 6: Dockerfile missing `packages/db` COPY
**What goes wrong:** Admin Docker build fails because `@repo/db` is not found.
**Why it happens:** The current admin Dockerfile only copies `apps/admin/` to the build stage. After extracting schema to `packages/db`, the Dockerfile needs to also copy that package.
**How to avoid:** Update `apps/admin/Dockerfile` to copy `packages/db/` alongside `apps/admin/` in the build stage, and copy `packages/shared/` if admin gains that dependency too.
**Warning signs:** Docker build failure with "package @repo/db not found" or module resolution errors.

### Pitfall 7: Admin's `BETTER_AUTH_URL` must differ from API's
**What goes wrong:** Better Auth generates callback URLs pointing to the wrong service.
**Why it happens:** Both apps share the same `BETTER_AUTH_URL` env var name but need different values (API: `https://api.blisko.app`, Admin: `https://admin.blisko.app`).
**How to avoid:** Set `BETTER_AUTH_URL` independently on each Railway service. For local dev, API uses port 3000, admin uses port 3001.
**Warning signs:** OTP verification callbacks hitting the wrong service.

### Pitfall 8: `tanstackStartCookies()` plugin order
**What goes wrong:** Cookie-dependent auth operations (sign-in, sign-out) silently fail to set cookies.
**Why it happens:** The `tanstackStartCookies()` plugin must be the LAST plugin in the Better Auth config.
**How to avoid:** Always add `tanstackStartCookies()` as the final element in the `plugins` array.
**Warning signs:** Login appears successful but session is lost on next page load.

## Code Examples

### Reading Queue Health from BullMQ
```typescript
// Source: BullMQ docs - https://docs.bullmq.io/guide/jobs/getters
import { Queue } from "bullmq";

const queue = new Queue("ai-jobs", { connection: getConnectionConfig() });

// Get counts for all statuses
const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
// Returns: { waiting: 5, active: 2, completed: 0, failed: 3, delayed: 1 }
// Note: completed will always be 0 due to removeOnComplete: true

// Get failed jobs with error details
const failedJobs = await queue.getJobs(["failed"], 0, 9, false);
// Each job has: job.failedReason, job.stacktrace, job.data, job.timestamp,
// job.processedOn, job.finishedOn, job.attemptsMade
```

### Better Auth Client for Admin Login Page
```typescript
// Source: https://better-auth.com/docs/integrations/tanstack
import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
  plugins: [emailOTPClient()],
});

// Usage in login form:
const { data, error } = await authClient.emailOtp.sendVerificationOtp({
  email,
  type: "sign-in",
});

// After OTP entry:
const { data: session, error } = await authClient.emailOtp.verifyEmail({
  email,
  otp,
});
```

### Fetching Match Analyses with User Names (Server-Side)
```typescript
// Drizzle query for paginated match analyses with profile joins
import { db, schema } from "~/lib/db";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const fromProfile = alias(schema.profiles, "fromProfile");
const toProfile = alias(schema.profiles, "toProfile");

const analyses = await db
  .select({
    id: schema.connectionAnalyses.id,
    aiMatchScore: schema.connectionAnalyses.aiMatchScore,
    shortSnippet: schema.connectionAnalyses.shortSnippet,
    longDescription: schema.connectionAnalyses.longDescription,
    fromProfileHash: schema.connectionAnalyses.fromProfileHash,
    toProfileHash: schema.connectionAnalyses.toProfileHash,
    createdAt: schema.connectionAnalyses.createdAt,
    updatedAt: schema.connectionAnalyses.updatedAt,
    fromName: fromProfile.displayName,
    toName: toProfile.displayName,
  })
  .from(schema.connectionAnalyses)
  .leftJoin(fromProfile, eq(schema.connectionAnalyses.fromUserId, fromProfile.userId))
  .leftJoin(toProfile, eq(schema.connectionAnalyses.toUserId, toProfile.userId))
  .orderBy(desc(schema.connectionAnalyses.updatedAt))
  .limit(25)
  .offset(0);
```

### shadcn/ui Sheet for Match Details
```typescript
// Pattern for slide-in detail panel
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { Badge } from "~/components/ui/badge";

function MatchDetailSheet({ analysis, open, onOpenChange }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>{analysis.fromName} & {analysis.toName}</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 py-4">
          <div>
            <Badge variant={analysis.aiMatchScore >= 70 ? "default" : "secondary"}>
              {Math.round(analysis.aiMatchScore)}% match
            </Badge>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-1">Summary</h4>
            <p className="text-sm text-muted-foreground">{analysis.shortSnippet}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-1">Full Analysis</h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {analysis.longDescription}
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-memory session Map | Better Auth DB-backed sessions | This phase | Sessions survive Railway redeploys |
| Custom OTP generation/verification | Better Auth emailOTP plugin | This phase | Standard, timing-safe, rate-limited OTP flow |
| Schema in `apps/api/src/db/schema.ts` | Schema in `packages/db/src/schema.ts` | This phase | Shared across API and admin |
| Hand-coded admin UI | shadcn/ui components | This phase | Accessible, composable, consistent styling |
| "Panel w budowie" placeholder | Real match monitoring dashboard | This phase | Actual operational visibility |

**Deprecated/outdated:**
- `apps/admin/src/lib/auth.ts` (custom OTP): Replaced entirely by Better Auth
- `apps/admin/src/lib/auth-session.ts` (custom session lookup): Replaced by Better Auth session API
- `apps/admin/src/routes/api/request-otp.ts`, `verify-otp.ts`, `logout.ts`: Replaced by Better Auth catch-all handler

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | Data layer (Drizzle) | Assumed (Railway) | 12+ | -- |
| Redis | BullMQ queue inspection | Assumed (Railway) | -- | -- |
| Bun | Runtime | Available | 1.3.11 | -- |
| Node.js | Build tools | Available | 24.13.0 | -- |
| shadcn CLI | UI components | Available via npx | latest | -- |

**Missing dependencies with no fallback:**
- None -- all dependencies are available.

**Missing dependencies with fallback:**
- None.

## Open Questions

1. **`triggeredBy` field: how to surface in admin?**
   - What we know: D-12 adds `triggeredBy` to job data in the API. This enriches BullMQ job data, not the `connectionAnalyses` DB table.
   - What's unclear: Since completed jobs are removed from BullMQ (`removeOnComplete: true`), the `triggeredBy` data is only available while the job is active/waiting or if it fails. For completed analyses, we'd need to also store `triggeredBy` in the `connectionAnalyses` table.
   - Recommendation: Either (a) change `removeOnComplete` to `{ count: 500 }` to retain some history in BullMQ, or (b) add a `triggered_by` column to `connectionAnalyses` and populate it during job processing. Option (b) is cleaner because it persists the data permanently and doesn't depend on Redis retention. This requires a migration (new column, nullable). The planner should decide which approach.

2. **BullMQ telemetry (D-11) for completed jobs**
   - What we know: D-11 asks for BullMQ lifecycle data (enqueued timestamp, wait time, processing time, etc.) in the sheet panel.
   - What's unclear: For completed analyses (displayed from `connectionAnalyses`), this BullMQ timing data is lost when jobs are removed. The current `connectionAnalyses` table doesn't store processing metadata.
   - Recommendation: For Phase 1, show BullMQ telemetry only for failed jobs (which are retained in Redis). For completed analyses, show database timestamps (createdAt, updatedAt) as proxy. A separate ticket could add timing columns to `connectionAnalyses` if detailed telemetry is needed for completed jobs.

3. **Admin app's `BETTER_AUTH_URL` for Railway**
   - What we know: Admin runs on `admin.blisko.app`, API on `api.blisko.app`. Both need `BETTER_AUTH_URL` set to their own domain.
   - What's unclear: Whether Railway env vars are already configured for the admin service.
   - Recommendation: Verify Railway env vars exist (`DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `ADMIN_EMAILS`, `RESEND_API_KEY`) on the admin service. Add `BETTER_AUTH_URL=https://admin.blisko.app` if missing. This is a deploy-time concern, not a code concern.

## Project Constraints (from CLAUDE.md)

These directives from CLAUDE.md constrain how the plan should be structured:

- **Drizzle rules:** No `SELECT *`, use `findFirst` for single rows, import `{ db, schema }` from `@/db` (will become `@repo/db` for schema), never modify merged migrations, use `bun run --filter '@repo/api' db:generate`, review generated SQL before committing.
- **Import aliases:** Admin uses `~/*` mapping to `src/*`. API uses `@/*`.
- **Redis:** Use Bun's built-in `RedisClient` for direct Redis ops. Never add `ioredis` as a dependency (BullMQ uses it internally).
- **Style:** Run `bun run check:fix` before finishing. No `biome-ignore` comments. English identifiers only.
- **Git:** Conventional commit prefix. Branch from `origin/main`. PR needs Linear ticket.
- **Scripts:** All scripts go in both app's `package.json` AND root `package.json`.
- **Migrations:** One concern per migration. Never run migrations against production from local machine.
- **Email:** Use `sendEmail()` helper, never call `resend.emails.send()` directly.
- **Security:** New tables need soft-delete filter check, anonymization check, data-export check.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `apps/api/src/db/schema.ts`, `apps/api/src/db/index.ts`, `apps/api/src/services/queue.ts`, `apps/api/src/auth.ts`, `apps/admin/` (all files)
- [BullMQ Getters docs](https://docs.bullmq.io/guide/jobs/getters) -- Queue.getJobCounts(), Queue.getJobs()
- [Better Auth TanStack Start integration](https://better-auth.com/docs/integrations/tanstack) -- handler route, tanstackStartCookies, session access
- [shadcn/ui TanStack Start installation](https://ui.shadcn.com/docs/installation/tanstack) -- CLI init, component installation
- [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle) -- drizzleAdapter config, schema mapping

### Secondary (MEDIUM confidence)
- [shadcn/ui Sidebar docs](https://ui.shadcn.com/docs/components/radix/sidebar) -- SidebarProvider, AppSidebar pattern, customization
- [Better Auth installation](https://better-auth.com/docs/installation) -- general setup, client creation

### Tertiary (LOW confidence)
- None -- all findings verified with official docs or codebase inspection.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use in the project, versions verified against catalog/lockfile
- Architecture: HIGH -- patterns derived from existing codebase (API auth, queue setup, Drizzle usage)
- Pitfalls: HIGH -- identified from direct code inspection (removeOnComplete, connection pool, Dockerfile gaps)
- Better Auth TanStack Start integration: HIGH -- official docs confirm handler route pattern and cookies plugin
- shadcn/ui setup: HIGH -- official installation guide for TanStack Start is well-documented
- `triggeredBy` telemetry for completed jobs: MEDIUM -- open question about where to persist this data

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable stack, no fast-moving dependencies)
