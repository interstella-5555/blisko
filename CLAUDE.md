# Blisko — Project Notes

Social proximity app — connects nearby people in Warsaw based on location, interests, and AI-generated compatibility analysis. Monorepo: API (Bun/Hono/tRPC), Mobile (Expo/React Native), Design Book (TanStack Start), Chatbot (seed user AI responder).

Rules are in `.claude/rules/` — one file per category: `drizzle.md`, `migrations.md`, `mobile.md`, `security.md`, `infra.md`, `api.md` (also imports + style), `linear.md`, `git.md`, `style.md`. All loaded automatically by Claude Code. When adding a new rule, put it in the matching category file. If no category fits, propose a new one (new `.md` file in `.claude/rules/`).

---

## Quick Reference

Brief pointers — details are in the code. Look there first.

**Railway:** Project ID `62599e90-30e8-47dd-af34-4e3f73c2261a`. Services: api, chatbot, design, metro (mobile), website, database (Postgres), queue (Redis). Use `mcp__railway__*` tools.

**Running locally:** `bun run api:dev`, `bun run design:dev`, `bun run chatbot:dev`, `bun run website:dev`. Mobile: `cd apps/mobile && npx expo run:ios` (simulator) or `--device` (physical). Simulator location: `xcrun simctl location booted set 52.2010865,20.9618980` (ul. Altowa, Warszawa).

**Physical iPhone:** UDID `00008130-00065CE826A0001C` (iPhone 15). API URL via `EXPO_PUBLIC_API_URL` in `apps/mobile/.env.local`:
```bash
# Production (Railway API)
echo 'EXPO_PUBLIC_API_URL=https://api.blisko.app' > apps/mobile/.env.local

# Local dev
echo -e '# API (local dev server)\nEXPO_PUBLIC_API_URL=http://192.168.50.120:3000' > apps/mobile/.env.local
```

**Env vars:** Two env files in `apps/api/`: `.env` (local dev, loaded by Bun automatically), `.env.production` (Railway credentials, never loaded automatically — use `bun --env-file=apps/api/.env.production run <script>` for scripts needing prod access or simulator/device testing). OAuth providers: `*_CLIENT_ID` + `*_CLIENT_SECRET` for Apple, Facebook, Google, LinkedIn.

**Dev CLI:** `bun run dev-cli -- <command>` (calls API via HTTP so WebSocket events fire). `API_URL` env var overrides default `http://localhost:3000`. Users referenced by email, resolved to userId/token from in-memory cache.

| Command | Example |
|---------|---------|
| `create-user <name>` | Create user + profile + location (auto-login) |
| `send-wave --from <email> --to <email>` | Send a wave between users |
| `respond-wave <name> <waveId> accept\|decline` | Accept or decline a wave |
| `waves <name>` | Show received & sent waves |
| `chats <name>` | List conversations |
| `messages <name> <convId>` | Show messages in a conversation |
| `send-message <name> <convId> <text>` | Send a message |
| `reanalyze <email> [--clear-all]` | Clear analyses + re-trigger AI |

**Monitors:** `bun run dev-cli:queue-monitor` (BullMQ jobs), `bun run dev-cli:chatbot-monitor` (bot activity).

**Seed users:** Emails `user0@example.com` – `user249@example.com`, scattered across 7 Warsaw districts. Polygons: `apps/api/scripts/warszawa-dzielnice.geojson`.
- `bun run api:scatter` — re-scatter ALL users uniformly (direct DB, no side-effects)
- `bun run apps/api/scripts/scatter-locations.ts` — re-scatter via API (fires AI re-analysis + WS broadcasts)
- `bun --env-file=apps/api/.env.production run apps/api/scripts/scatter-targeted.ts <area>:<count>:<startIdx> [...]` — targeted scatter (`--list` for areas, `--dry-run` to preview)
- Fresh seed: delete `apps/api/scripts/.seed-cache.json`, then `bun run apps/api/scripts/seed-users.ts`. Display a random test email after

**Chatbot:** `bun run chatbot:dev`. Seed users auto-respond to waves/messages. Acceptance: AI match >=75% always accepts, scales linearly to 10% at score 0. Logging in as a seed user pauses bot for 5 min.

**After changing AI prompts:** `bun run dev-cli -- reanalyze user42@example.com --clear-all`

**TestFlight:** `bun run mobile:testflight` → Xcode Organizer → Distribute App manually. Set `.env.local` to production API first.

**Design Book:** `apps/design/`, `localhost:3000/design-book`. CSS modules (mangled class names). PhoneFrame: max 402px, aspect 402:874. Variants in `apps/design/src/variants/v2-*/`.

**Shared package:** `@repo/shared` — types, Zod validators, enums, haversine. Typecheck: `bun run --filter '@repo/shared' typecheck`.

**Testing:** `bun run api:test`, `bun run --filter '@repo/shared' test`. E2E: Maestro (`bun run --filter '@repo/mobile' test:e2e`). Tests in `apps/api/__tests__/**/*.test.ts`. Use `app.request()` directly (no server needed).

**Biome:** `bun run check` (format + lint + imports). TanStack Query ESLint rules not applicable (tRPC manages queryKeys, Biome covers hook deps).

**Monitoring:** `GET /api/metrics/summary?window=24` (JSON overview), `GET /metrics` (Prometheus). SLO: p95 < 500ms, error_rate < 5%. Design doc: `docs/architecture/instrumentation.md`.

**Schema inspection:** `npx drizzle-kit export --sql`

---

## Linear Workflow

### Capturing ideas

- **Vague idea** (no clear scope) → label **Idea**, status **Backlog**. Short title, raw description.
- **Refined idea** (clear what to build) → label **Feature** / **Improvement** / **Bug** as appropriate.
- **Priority**: set when user expresses urgency, otherwise leave unset.
- **Sub-issues**: create with `parentId` when distinct parts emerge naturally. Don't force upfront decomposition.
- **Specs**: `docs/plans/` (gitignored, temporary) or `docs/architecture/` (permanent design docs with rationale, committed). Linear Document for plans saved for later via `create_document` with `issue` param.
- **External feedback**: separate Idea issue per point, tagged with who gave it ("Feedback od Jarka:").
- **Mid-conversation**: if something worth tracking comes up, create the issue immediately.

### Working on a ticket

1. **Fetch & understand** — get issue description + comments + sub-issues. Do deep research: read relevant code, trace execution paths, understand the problem space thoroughly before planning.
2. **Status → In Progress** — immediately, don't ask.
3. **Brainstorm if needed** — `brainstorming` skill for non-trivial work.
4. **Write plan** — `writing-plans` skill. Save to `docs/plans/BLI-X-ticket-summary-kebab-case.md`. Plans are gitignored (temporary working docs, not committed).
5. **Present plan for approval** — show the user the plan and wait for explicit approval before implementing. Incorporate feedback if needed.
6. **Create branch** — use Linear's `gitBranchName` (format: `kwypchlo/bli-X-slug`). Branch is always created from latest `origin/main` (enforced by hook).
7. **Implement** — `test-driven-development` skill. Bugs → `systematic-debugging` skill.
8. **Commit** — `feat: add group discovery nearby (BLI-42)` — conventional prefix, what + why, ticket ID at end.
9. **Verify** — `verification-before-completion` skill before claiming done.
10. **Create PR** — `gh pr create --assignee @me`. Link PR to Linear ticket via `create_attachment`. Follow PR standards from `git.md` rules.
11. **Notify user** — send the user the PR link and Linear ticket link. Status → In Review.
12. **Sub-tasks** — each sub-issue gets own branch (`gitBranchName`), own PR. Parent → Done when all children done.

Technical notes: add as comments on the Linear issue.

### Development skills pipeline

Skills are **mandatory** at each stage, not optional:

| Stage | Skill |
|-------|-------|
| New idea / feature design | `brainstorming` → `writing-plans` |
| Executing plan with sub-tasks | `executing-plans` |
| Parallel independent tasks | `dispatching-parallel-agents` |
| Writing code | `test-driven-development` |
| Bug / test failure | `systematic-debugging` |
| Before Done / PR | `verification-before-completion` |
| After implementation | `requesting-code-review` |
| Receiving feedback | `receiving-code-review` |
| Branch complete | `finishing-a-development-branch` |

**Plans (`docs/plans/`) — overrides for `writing-plans` skill:**

| Skill default | Our override | Why |
|---------------|-------------|-----|
| Filename: `YYYY-MM-DD-<feature>.md` | `BLI-X-ticket-summary-kebab-case.md` | Tied to ticket, easy to find |
| Plans committed to git | Plans are **gitignored** | Temporary working docs — the PR and code are the permanent artifacts |

**Using old plans:** Old plans are **implementation history only**. Never treat them as a source of truth for current state. Code and schema are the source of truth — if a plan contradicts the code, the code wins. When searching for context, read the actual code, not old plans.

**Architecture docs checkpoint:** After `writing-plans` — extract design decisions to `docs/architecture/<topic>.md`. After `finishing-a-development-branch` — update existing docs if approach changed during implementation.

**Ralph Protocol:** Moved to `.claude/skills/ralph-protocol.md` — auto-invoked when running Ralph, preparing tickets, or generating reports.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Blisko Admin Dashboard**

An admin dashboard for Blisko (admin.blisko.app) that provides full operational and product visibility into the backend, plus a programmatic API that gives Claude Code power to perform admin operations. Built as a TanStack Start app in the existing monorepo, with direct database and Redis connections.

**Core Value:** See what's happening in the backend at a glance and act on it — both as a human via the dashboard and as Claude Code via the admin API.

### Constraints

- **Stack**: TanStack Start + Tailwind (already chosen), Nitro server routes for API
- **Auth**: OTP email login for dashboard, separate API key auth for Claude Code endpoints
- **Data**: Direct PostgreSQL (Drizzle) and Redis (Bun RedisClient) connections — same databases as main API
- **Deployment**: Railway, same project as other services
- **Security**: API key for Claude Code must be stored as Railway env var, never in code. Allowlist state persisted in DB.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 6.0.2 - All source code (API, mobile, design, chatbot)
- JavaScript - Frontend/build configurations (Vite, Tailwind CLI)
- SQL - Database migrations and raw queries (PostgreSQL dialect)
- HTML/CSS - Email templates and styling
## Runtime
- Bun 1.3.11 - Primary runtime for API, chatbot, and tooling
- Node.js 24.13.0 - Dev tools and fallback runtime
- Bun - Lock file: `bun.lock`
- Workspace management via Yarn workspaces syntax in `package.json`
## Frameworks
- Hono 4.5.0 - HTTP framework for API server (`apps/api`)
- Expo 54.0.32 - Mobile app framework (React Native)
- TanStack Start 1.166.17 - SSR/SSG for design book and website (`apps/design`, `apps/website`)
- React 19.1.0 - UI library across all web/mobile apps
- React Native 0.81.5 - Mobile component library
- tRPC 11.0.0-rc.0 - Type-safe API procedures (`apps/api/src/trpc`)
- Better Auth 1.5.4 - Authentication framework with email OTP + OAuth support
- @better-auth/expo 1.5.4 - Expo SDK for Better Auth
- Vitest 3.0.5 - Unit test runner (`bun run api:test`, `bun run --filter @repo/shared test`)
- Maestro - E2E testing for mobile (`bun run --filter @repo/mobile test:e2e`)
- Vite 7.3.1 - Dev server and build tool for web apps
- TanStack Router 1.167.5 - File-based routing
- Biome 2.4.6 - Linter and formatter (replaces ESLint + Prettier)
- Tailwind CSS 4.2.2 - Utility CSS framework
- Nitro 3.0.0 - Full-stack framework for SSR apps
## Key Dependencies
- `drizzle-orm` 0.45.1 - ORM for PostgreSQL queries
- `drizzle-kit` 0.31.9 - Schema migration generator
- `postgres` 3.4.0 - PostgreSQL client for `drizzle-orm`
- `pg` 8.17.2 - Alternative PostgreSQL client (used in some contexts)
- `bullmq` 5.69.2 - Job queue for async AI processing, email, and push notifications
- `zod` 4.3.5 - TypeScript-first schema validation
- `ai` 6.0.86 - Vercel AI SDK for LLM integration
- `@ai-sdk/openai` 3.0.29 - OpenAI provider for embeddings and text generation
- `prom-client` 15.1.3 - Prometheus metrics collection
- `resend` 6.8.0 - Email sending service
- `expo-server-sdk` 6.0.0 - Server-side push notifications for Expo
- `react-native-maps` 1.27.1 - Maps component for mobile
- `expo-router` 6.0.22 - Navigation routing for Expo
- `expo-notifications` 0.32.16 - In-app push notification UI
- `expo-location` 19.0.8 - Geolocation API
- `expo-image-picker` 17.0.10 - Image upload from device
- `expo-secure-store` 15.0.8 - Secure credential storage on mobile
- `zustand` 5.0.0 - State management for mobile
- `@tanstack/react-query` 5.50.0 - Server state management
- `ms` 2.1.3 - Time utility (for rate limiting windows)
- `lucide-react` 0.561.0 - Icon library
- `class-variance-authority` 0.7.1 - Component variant styling
- `marked` 15.0.8 - Markdown parsing
## Configuration Files
- `tsconfig.json` (root) - Base compiler options
- Project-specific `tsconfig.json` files in each app (extends root)
- `vite.config.ts` - Vite configuration (apps/design, apps/website, apps/admin, apps/mobile)
- `biome.json` (root) - Formatter, linter, and import organizer rules
- `.prettierrc` - Not used; Biome handles formatting
- `apps/api/drizzle.config.ts` - Drizzle ORM configuration with PostgreSQL dialect
- Schema: `apps/api/src/db/schema.ts` (source of truth)
- Migrations: `apps/api/drizzle/` (16 migrations as of 2026-03-26)
- `vitest.config.ts` - Vitest configuration (apps/api, apps/mobile, apps/design)
- No `jest.config.js` - Uses Vitest exclusively
- `.husky/pre-commit` - Runs `lint-staged` on commit
- `lint-staged` config in root `package.json` - Type-checks and formats staged files
- Biome auto-fixes on `bun run check:fix`
## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (e.g., `postgresql://postgres:postgres@localhost:5432/blisko`)
- `REDIS_URL` - Redis connection for job queue and pub/sub (e.g., `redis://localhost:6379`)
- `BETTER_AUTH_SECRET` - Session encryption key
- `BETTER_AUTH_URL` - Base URL for auth callbacks (localhost or production)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google Sign-In
- `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET` - Apple Sign-In
- `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` - Facebook login
- `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` - LinkedIn login
- `INSTAGRAM_CLIENT_ID` / `INSTAGRAM_CLIENT_SECRET` - Instagram login (configured, not actively used)
- `RESEND_API_KEY` - Email delivery via Resend (fallback: console.log)
- `OPENAI_API_KEY` - OpenAI API for embeddings (model: `text-embedding-3-small`) and text generation (model: `gpt-4o-mini`)
- `NODE_ENV` - `development` or `production`
- `ENABLE_DEV_LOGIN` - Allow `@example.com` auto-login endpoint (useful for staging)
- `PORT` - API server port (default: 3000)
## Platform Requirements
- Node.js >= 20
- Bun runtime
- PostgreSQL 12+ (local or Railway)
- Redis (local or Railway)
- macOS with Xcode for iOS development
- iOS Simulator or physical iPhone for mobile testing
- Deployment: Railway (configured in `.claude/CLAUDE.md`)
- Services: API, Chatbot, Design Book, Website, Mobile (via TestFlight), Admin, Database (PostgreSQL), Queue (Redis)
- Post-deploy hooks run migrations automatically
## Monorepo Structure
- `package.json` - Workspaces and root-level scripts
- `biome.json` - Shared linting rules
- `tsconfig.json` - Base TypeScript config
- `apps/api/` - tRPC + Hono API server
- `apps/mobile/` - Expo/React Native mobile app
- `apps/design/` - Design book gallery (TanStack Start + Vite)
- `apps/website/` - Marketing website (TanStack Start + Vite)
- `apps/chatbot/` - Bot service for seed user responses
- `apps/admin/` - Admin panel (TanStack Start + Vite)
- `packages/shared/` - Shared types, Zod schemas, utilities (haversine distance)
- `packages/dev-cli/` - CLI tools for development (user creation, testing)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- PascalCase for React components: `Button.tsx`, `WaveEntry.tsx`
- camelCase for utilities and services: `metrics.ts`, `queue.ts`, `authStore.ts`
- kebab-case for directories: `src/trpc/procedures/`, `src/services/`
- All code must use English identifiers — no Polish in variable/function/class names (e.g. `statusMatchBadge` not `naTerazBadge`)
- camelCase: `sendWaveToUser()`, `flushMetrics()`, `extractEndpoint()`
- Private functions prefixed with underscore: `_hydrated`, `_get` (Zustand store pattern)
- Async functions use regular camelCase (no special prefix): `async function analyzeConnection()`, `async function flushMetrics()`
- camelCase: `userId`, `displayName`, `waveStatusByUserId`
- Constants: UPPER_SNAKE_CASE: `BUFFER_HARD_CAP`, `FLUSH_THRESHOLD_MS`, `DECLINE_COOLDOWN_HOURS`
- Database/schema columns: snake_case: `display_name`, `created_at`, `deleted_at`
- Store state fields: camelCase: `isLoading`, `hasCheckedProfile`, `waveStatusByUserId`
- PascalCase: `User`, `Profile`, `WaveStatus`, `ButtonProps`, `AuthState`
- Type unions: `type WaveStatus = "pending" | "accepted" | "declined"`
- Discriminated unions: `type WaveStatus = { type: "sent"; waveId: string } | { type: "received"; waveId: string }`
- API response types follow entity pattern: `ConversationWithLastMessage`, `ConnectionAnalysis`
## Code Style
- Tool: Biome v2.4.6
- Indent: 2 spaces
- Line ending: LF (Unix)
- Line width: 120 characters
- Run `bun run check:fix` before completing any task to auto-fix formatting and imports
- Tool: Biome v2.4.6
- Rules enforced:
- **No biome-ignore comments** — fix the actual code instead. Only exception: when code is intentionally correct and the rule produces a false positive
## Error Handling
- Throw `TRPCError` with appropriate code and message
- Error codes: `NOT_FOUND`, `FORBIDDEN`, `BAD_REQUEST`, `CONFLICT`, `TOO_MANY_REQUESTS`
- Include human-readable message for client display
- Example from `apps/api/src/trpc/procedures/waves.ts`:
- Catch errors and log with context prefix: `[service-name] message`
- Return early or throw when critical, silently fail with logging when degraded
- Example from `apps/api/src/services/metrics.ts`:
- No explicit error handling needed for basic queries (Drizzle throws naturally)
- Transactions use `try...catch...finally` for cleanup
- Example from `apps/api/src/trpc/procedures/waves.ts`:
- Log errors but don't throw — operations are fire-and-forget
- Example from `apps/api/src/trpc/procedures/waves.ts`:
- Log with context prefix and truncate long values (safety net)
- Example from `apps/api/src/services/metrics.ts`:
## Logging
- Use context prefixes: `[module-name] action: details`
- Log levels: `console.log()` for info, `console.warn()` for degraded, `console.error()` for failures
- Examples from codebase:
- **Resend email fallback** (when no API key): `console.log(`[email] Resend not configured — would send to ${to}: "${template.subject}"`)`
- **No structured logging libraries** — console.log is the pattern throughout
## Comments
- Explain WHY, not WHAT — the code shows WHAT, comments explain intent
- Complex business logic (e.g., per-person cooldown calculations, mutual ping detection)
- Non-obvious edge cases (e.g., soft-delete filtering, transaction isolation levels)
- Temporary workarounds or known limitations
- Not consistently used (biome doesn't enforce it)
- Used sparingly for public API functions, not internal utilities
- No verbose docstrings — single-line JSDoc for clarity
## Function Design
- Small, focused functions (10-50 lines typical)
- tRPC procedure mutations/queries: 30-100+ lines (complex business logic acceptable)
- Extracted helper functions for complex calculations (e.g., `computeStatusMap()`, `scoreAndFilter()`)
- Prefer object parameters for >2 arguments
- Example from `apps/api/src/services/queue.ts`:
- Use destructuring for Drizzle returns with multiple values:
- Explicit return types for complex procedures (not inferred)
- Fire-and-forget operations prefixed with `void`: `void sendPushToUser(...)`
- Prefer `async function` over promises
- Use `Promise.all()` for parallel operations:
## Module Design
- Named exports preferred: `export const useAuthStore = create(...)`
- Default exports for components: `export default function Button(...) { ... }`
- Type exports before value exports: `export type WaveStatus = ...`
- Example from `apps/api/src/services/metrics.ts`:
- Used sparingly (not a core pattern here)
- Package-level exports: `packages/shared/src/index.ts` re-exports types and validators
- One file per service domain: `metrics.ts`, `queue.ts`, `push.ts`, `email.ts`
- Exports both helper functions and re-used data structures
- Example: `apps/api/src/services/queue.ts` exports job types and queue configuration
- One file per store: `authStore.ts`, `wavesStore.ts`, `locationStore.ts`
- Interface + implementation: `interface WavesStore { ... }` + `create<WavesStore>(...)`
- Actions update state immutably: `set((state) => ({ ... }))`
## TypeScript Patterns
- Trust type inference for obvious cases (variable assignments)
- Explicit types for:
- Used for state machines (e.g., wave status, connection analysis):
- Define in shared package: `packages/shared/src/validators.ts`
- Export both schema and inferred type: `z.infer<typeof schema>`
- Example:
- Use `T | null` not `T | undefined` for database values
- Use `?:` for optional properties in objects/interfaces
- Example from schema:
## React & React Native Conventions
- Functional components only
- Props interface defined above component
- Hooks at top of body
- Inline styles using `StyleSheet.create()`
- Example from `apps/mobile/src/components/ui/Button.tsx`:
- Combine state + actions in single interface
- Use immutable state updates
- Hydration flag for async initialization
- Example from `apps/mobile/src/stores/authStore.ts`:
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- End-to-end type safety via tRPC (shared TypeScript between client and server)
- Hybrid database access (Drizzle ORM with prepared statements for performance + relational queries)
- Real-time WebSocket event handling with Redis pub/sub bridge for multi-replica support
- AI-driven user compatibility matching via OpenAI embeddings and BullMQ background jobs
- Event-driven architecture for asynchronous tasks (waves, profiling, push notifications)
## Layers
- Purpose: Mobile and web user interfaces
- Location: `apps/mobile/` (React Native + Expo), `apps/design/` (component gallery), `apps/website/` (landing page)
- Contains: UI components, screens, navigation, client-side state management (Zustand)
- Depends on: tRPC client, Better Auth client, WebSocket for real-time updates
- Used by: End users
- Purpose: HTTP endpoint handler, business logic orchestration, tRPC procedure definitions
- Location: `apps/api/src/index.ts` (Hono entry point), `apps/api/src/trpc/`
- Contains: Hono middleware stack, tRPC router, procedure definitions (`profiles`, `waves`, `messages`, `groups`, `topics`, `accounts`)
- Depends on: Database, authentication, services (AI, push, email)
- Used by: Mobile client, design/website servers
- Purpose: Domain-specific tRPC procedures (mutations/queries per feature domain)
- Location: `apps/api/src/trpc/procedures/`
- Contains: `profiles.ts`, `waves.ts`, `messages.ts`, `groups.ts`, `topics.ts`, `accounts.ts`, `profiling.ts`, `pushTokens.ts`
- Pattern: Each procedure applies feature gates, rate limiting, authentication middleware before executing business logic
- Example: `waves.send` → checks user visibility, daily limits, blocks, analyzes match score, sends push, enqueues profiling job
- Purpose: Cross-cutting concerns (authentication, rate limiting, feature flags)
- Location: `apps/api/src/trpc/middleware/`, `apps/api/src/middleware/`
- Contains: `rateLimit.ts`, `featureGate.ts`, HTTP-level rate limiting, metrics collection
- Pattern: tRPC middleware chain (`.use()`) applied per procedure; HTTP middleware applied globally
- Purpose: Stateless business logic and external integrations
- Location: `apps/api/src/services/`
- Contains:
- Pattern: Pure functions imported on-demand, encapsulating external integrations
- No state held in services — all context passed as arguments
- Purpose: Interact with PostgreSQL database
- Location: `apps/api/src/db/`
- Contains: `schema.ts` (Drizzle table definitions), `index.ts` (DB instance with query instrumentation), `prepare.ts` (prepared statement naming)
- Pattern:
- Purpose: Session management and user identity verification
- Location: `apps/api/src/auth.ts`, `apps/api/src/trpc/context.ts`
- Pattern:
- Purpose: Real-time event delivery and multiplayer state synchronization
- Location: `apps/api/src/ws/`
- Contains: `handler.ts` (WebSocket lifecycle), `events.ts` (event type definitions), `redis-bridge.ts` (pub/sub bridge)
- Pattern:
- Purpose: Asynchronous processing of long-running tasks
- Location: `apps/api/src/services/queue.ts`, started in `apps/api/src/index.ts`
- Framework: BullMQ (Redis-backed job queue)
- Job types:
- Pattern: Jobs created in procedures via `queue.add()`, processed by worker running in same server process
- Purpose: Automated responses for seed users during testing/demo
- Location: `apps/chatbot/src/`
- Pattern:
## Data Flow
## Key Abstractions
- Purpose: Express interest in connecting with another user
- Files: `apps/api/src/db/schema.ts` (table), `apps/api/src/trpc/procedures/waves.ts` (logic)
- Pattern:
- Purpose: Group chat between multiple users
- Files: `apps/api/src/db/schema.ts` (tables: `conversations`, `conversationParticipants`, `messages`)
- Pattern:
- Purpose: User's public identity and search metadata
- Files: `apps/api/src/db/schema.ts`, `apps/api/src/trpc/procedures/profiles.ts`
- Contains: Display name, bio, interests, embedding, location, visibility mode, status, portrait
- Pattern: One profile per user, auto-created on first profile update
- Purpose: Temporary, location-tied availability/activity marker
- Files: `profiles` table columns: `currentStatus`, `statusEmbedding`, `statusExpiresAt`, `statusVisibility`
- Pattern: Optional, short-lived (minutes to hours), can be public or private
- Used for: "Looking for coffee now", "At Warszawa Zachodnia station", etc.
- Purpose: Match compatibility between two users based on embeddings
- Files: `apps/api/src/services/ai.ts` (embedding generation), `apps/api/src/services/profiling-ai.ts` (profiling response generation)
- Pattern:
- Purpose: User block relationship
- Files: `apps/api/src/db/schema.ts` (table), wave/message procedures
- Pattern:
- Purpose: Control discovery and contactability
- Options: `ninja` (hidden, read-only), `semi_open` (default), `full_nomad` (fully discoverable)
- Pattern: Server-side enforcement in discovery queries and before sending waves
## Entry Points
- Location: `apps/api/src/index.ts`
- Triggers: `bun run api:dev` or Railway boot
- Responsibilities:
- Location: `apps/api/src/ws/handler.ts` (exported as `wsHandler` object)
- Triggers: Bun server upgrade from `/ws` path
- Responsibilities:
- Location: `apps/api/src/services/queue.ts` (function `startWorker()`)
- Triggers: Called in `apps/api/src/index.ts` on server startup
- Responsibilities:
- Location: `apps/chatbot/src/index.ts`
- Triggers: `bun run chatbot:dev` or Railway `chatbot` service boot
- Responsibilities:
## Error Handling
- Procedure layer throws TRPCError with specific codes (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `TOO_MANY_REQUESTS`, `BAD_REQUEST`)
- tRPC serializes error codes and messages to client
- Client displays rate-limit errors via toast, deletes-account alerts via modal
- Database errors logged server-side, generic 500 to client
- Soft-deleted users blocked at auth middleware with code `FORBIDDEN` and message `ACCOUNT_DELETED`
- Rate limit errors include retry-after milliseconds for client exponential backoff
- Input validation via Zod schemas (shared `@repo/shared`) — validation errors return code `BAD_REQUEST`
- Missing resources throw code `NOT_FOUND` without exposing resource existence to prevent enumeration
## Cross-Cutting Concerns
- Global rate limit: 100 requests per 10 seconds per user (safety net)
- Per-endpoint limits configured in `config/rateLimits.ts`
- HTTP endpoints (metrics, auth) limited by IP address via `honoRateLimit()`
- WebSocket events limited by type + userId via in-memory sliding window
- Implementation: Redis-backed sliding window (`services/rate-limiter.ts`) with Lua scripts for atomic operations
- Request metrics: Collected by middleware (duration, query count, status code, userId)
- Query tracking: Instrumented Drizzle client counts queries + duration per request
- WebSocket metrics: Auth attempts, subscriptions, rate limit hits
- Metrics exported: Prometheus format at `/metrics`, JSON summary at `/api/metrics/summary`
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
