# Codebase Structure

**Analysis Date:** 2026-03-26

## Directory Layout

```
blisko/
├── apps/
│   ├── api/                           # Hono backend (Railway service)
│   │   ├── src/
│   │   │   ├── index.ts               # Entry point: Hono app + WebSocket + BullMQ worker
│   │   │   ├── auth.ts                # Better Auth configuration
│   │   │   ├── db/
│   │   │   │   ├── index.ts           # Drizzle instance with query instrumentation
│   │   │   │   ├── schema.ts          # Drizzle table definitions
│   │   │   │   └── prepare.ts         # Prepared statement naming helpers
│   │   │   ├── config/
│   │   │   │   ├── rateLimits.ts      # Rate limit definitions per endpoint
│   │   │   │   └── pingLimits.ts      # Wave-specific limits (daily, cooldowns)
│   │   │   ├── middleware/
│   │   │   │   └── rateLimit.ts       # HTTP-level rate limiting (IP-based)
│   │   │   ├── trpc/
│   │   │   │   ├── router.ts          # Root tRPC router
│   │   │   │   ├── trpc.ts            # tRPC initialization, procedure definitions, auth middleware
│   │   │   │   ├── context.ts         # Request context creation, session lookup
│   │   │   │   ├── middleware/
│   │   │   │   │   ├── rateLimit.ts   # Per-procedure rate limiting
│   │   │   │   │   └── featureGate.ts # Feature flag middleware
│   │   │   │   └── procedures/
│   │   │   │       ├── profiles.ts    # Profile CRUD, location, nearby discovery
│   │   │   │       ├── waves.ts       # Wave send/respond/list
│   │   │   │       ├── messages.ts    # Message send/list
│   │   │   │       ├── groups.ts      # Group discovery + join
│   │   │   │       ├── topics.ts      # Topic queries
│   │   │   │       ├── accounts.ts    # Account deletion, email change
│   │   │   │       ├── profiling.ts   # Profiling questions, submit answers
│   │   │   │       └── pushTokens.ts  # Push token registration
│   │   │   ├── services/
│   │   │   │   ├── ai.ts              # OpenAI embeddings, match scoring
│   │   │   │   ├── queue.ts           # BullMQ worker, job handlers
│   │   │   │   ├── profiling-ai.ts    # AI response generation for seed users
│   │   │   │   ├── push.ts            # Expo push notifications
│   │   │   │   ├── email.ts           # Resend email helper
│   │   │   │   ├── metrics.ts         # Request instrumentation
│   │   │   │   ├── prometheus.ts      # Prometheus registry export
│   │   │   │   ├── query-tracker.ts   # Per-request query counting
│   │   │   │   ├── rate-limiter.ts    # Redis sliding window rate limit
│   │   │   │   ├── data-export.ts     # GDPR/RODO data export
│   │   │   │   ├── ws-metrics.ts      # WebSocket event metrics
│   │   │   │   └── moderation.ts      # Content moderation helpers
│   │   │   ├── ws/
│   │   │   │   ├── handler.ts         # WebSocket lifecycle (open, message, close)
│   │   │   │   ├── events.ts          # Event type definitions + EventEmitter
│   │   │   │   └── redis-bridge.ts    # Redis pub/sub for multi-replica events
│   │   │   └── lib/
│   │   │       ├── status.ts          # Status expiration + lifecycle helpers
│   │   │       └── grid.ts            # Spatial grid for nearby grouping
│   │   ├── __tests__/                 # Vitest unit + integration tests
│   │   ├── drizzle/
│   │   │   ├── migrations/            # SQL migration files (auto-generated + custom)
│   │   │   └── meta/                  # Migration journal + schema snapshots
│   │   ├── scripts/
│   │   │   ├── seed-users.ts          # Creates 250 test users scattered in Warsaw
│   │   │   ├── scatter-locations.ts   # Re-scatters existing users
│   │   │   ├── scatter-targeted.ts    # Targeted scatter to specific districts
│   │   │   └── warszawa-dzielnice.geojson  # Warsaw district polygons
│   │   └── package.json
│   │
│   ├── mobile/                        # React Native + Expo app
│   │   ├── app/                       # Expo Router routes (file-based)
│   │   │   ├── _layout.tsx            # Root layout with QueryClient + WebSocket
│   │   │   ├── (auth)/
│   │   │   │   ├── login.tsx          # Email login form
│   │   │   │   └── verify-email.tsx   # Magic link verification
│   │   │   ├── onboarding/
│   │   │   │   ├── name.tsx           # Set display name
│   │   │   │   ├── bio.tsx            # Set bio + looking-for
│   │   │   │   └── location.tsx       # Grant location permission
│   │   │   ├── (tabs)/                # Bottom tab navigation
│   │   │   │   ├── index.tsx          # Nearby map view
│   │   │   │   ├── waves.tsx          # Waves (incoming + sent)
│   │   │   │   ├── chats.tsx          # Conversation list
│   │   │   │   └── profile.tsx        # User profile + settings
│   │   │   ├── (modals)/              # Modal overlays (sheets)
│   │   │   │   ├── user-profile.tsx   # User detail modal
│   │   │   │   └── image-preview.tsx  # Full-screen image viewer
│   │   │   ├── chat/[id].tsx          # Conversation detail screen
│   │   │   ├── filters.tsx            # Discovery filters
│   │   │   ├── set-status.tsx         # Status input + submission
│   │   │   ├── group/                 # Group join flow
│   │   │   └── settings/              # Account settings submenu
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ui/                # Reusable UI (Button, Input, Badge, Avatar, etc.)
│   │   │   │   ├── chat/              # Chat-specific (MessageBubble, ChatInput, etc.)
│   │   │   │   ├── nearby/            # Map-related (NearbyMapView, GroupMarker, etc.)
│   │   │   │   ├── waves/             # Wave cards and logic
│   │   │   │   └── *Sheet.tsx         # Modal/bottom sheet components
│   │   │   ├── stores/                # Zustand state (auth, chat, location, waves, etc.)
│   │   │   ├── hooks/                 # Custom React hooks
│   │   │   ├── lib/
│   │   │   │   ├── trpc.ts            # tRPC client setup + hooks
│   │   │   │   ├── auth.ts            # Better Auth client
│   │   │   │   ├── ws.ts              # WebSocket client
│   │   │   │   └── rateLimitMessages.ts  # Rate limit message copy
│   │   │   ├── providers/
│   │   │   │   ├── ToastProvider.tsx  # Global toast overlay
│   │   │   │   └── NotificationProvider.tsx  # Push notification handling
│   │   │   ├── theme/                 # Colors, spacing, fonts
│   │   │   └── types/                 # TypeScript types
│   │   ├── .maestro/                  # E2E test flows (Maestro YAML)
│   │   └── package.json
│   │
│   ├── design/                        # Design system / component gallery (TanStack Start)
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── design-book/       # Gallery pages (Overview, Colors, Typography, etc.)
│   │   │   │   └── proposals/         # Design proposals + alternatives
│   │   │   ├── components/
│   │   │   │   └── design-book/       # Component showcase sections
│   │   │   ├── variants/              # Design theme variants (13 total)
│   │   │   │   ├── v1-bioluminescent/
│   │   │   │   ├── v1-neo-brutalist/
│   │   │   │   ├── v1-topographic/
│   │   │   │   ├── v2-arcade/
│   │   │   │   ├── v2-bauhaus/
│   │   │   │   ├── v2-botanical/
│   │   │   │   ├── v2-constellation/
│   │   │   │   ├── v2-dithered/
│   │   │   │   ├── v2-haute-couture/
│   │   │   │   ├── v2-newspaper/
│   │   │   │   ├── v2-street-poster/
│   │   │   │   ├── v2-transit/
│   │   │   │   └── v2-weather-map/
│   │   │   └── styles/                # Tailwind + CSS modules
│   │   └── content/                   # Content Collections (markdown)
│   │
│   ├── website/                       # Marketing landing page (TanStack Start)
│   │   ├── src/
│   │   │   ├── routes/                # Page routes (index, privacy, terms, etc.)
│   │   │   ├── components/
│   │   │   └── styles.css
│   │   └── package.json
│   │
│   ├── chatbot/                       # Seed user auto-responder (Bun script)
│   │   ├── src/
│   │   │   ├── index.ts               # Main polling loop
│   │   │   ├── ai.ts                  # Response generation via OpenAI
│   │   │   ├── api-client.ts          # HTTP calls to API
│   │   │   └── events.ts              # Redis pub/sub setup
│   │   └── package.json
│   │
│   ├── admin/                         # Admin dashboard (Nuxt)
│   │   └── [Separate structure — not core to app]
│   │
│   └── tasks/                         # Task runner / utilities
│
├── packages/
│   ├── shared/                        # Shared types + validators
│   │   ├── src/
│   │   │   ├── index.ts               # Export all
│   │   │   ├── types.ts               # TypeScript types (Wave, Message, Profile, etc.)
│   │   │   ├── models.ts              # Domain model exports
│   │   │   ├── validators.ts          # Zod schemas for API validation
│   │   │   └── math.ts                # Utilities (haversine distance)
│   │   └── __tests__/
│   │
│   └── dev-cli/                       # Development CLI tool
│       ├── src/
│       │   ├── cli.ts                 # Command handler (create-user, send-wave, etc.)
│       │   ├── queue-monitor.ts       # BullMQ job monitor
│       │   └── chatbot-monitor.ts     # Chatbot activity monitor
│       └── package.json
│
├── docs/
│   ├── architecture/                  # Design docs (permanent, committed)
│   │   ├── rate-limiting.md
│   │   ├── account-deletion.md
│   │   ├── data-export.md
│   │   ├── nearby-group-members.md
│   │   ├── instrumentation.md
│   │   └── privacy-terms.md
│   └── plans/                         # Working docs (temporary, gitignored)
│
├── scripts/
│   ├── ralph.sh                       # Ralph automation orchestrator
│   └── [other utilities]
│
├── .claude/
│   ├── rules/                         # Project-specific rules
│   │   ├── api.md
│   │   ├── drizzle.md
│   │   ├── migrations.md
│   │   ├── security.md
│   │   ├── infra.md
│   │   ├── style.md
│   │   ├── mobile.md
│   │   ├── git.md
│   │   └── linear.md
│   └── [other Claude instructions]
│
├── .planning/
│   └── codebase/                      # Codebase analysis documents (this file lives here)
│
├── .husky/                            # Git hooks
├── .github/                           # GitHub Actions workflows
├── tsconfig.json                      # Root TypeScript config
├── biome.json                         # Biome formatter + linter config
├── package.json                       # Root workspace config
├── bun.lock                           # Dependency lock file
├── ARCHITECTURE.md                    # Architecture overview (root)
├── PRODUCT.md                         # Product vision document
├── SCALING.md                         # Scaling considerations
├── README.md                          # Project README
└── vitest.workspace.ts                # Vitest workspace config
```

## Directory Purposes

**`apps/api/src/`:**
- Purpose: API backend server logic
- Contains: Hono routes, tRPC procedures, database queries, services, WebSocket handlers
- Key files: `index.ts` (entry), `trpc/router.ts` (route definitions), `db/schema.ts` (data models)

**`apps/api/src/trpc/procedures/`:**
- Purpose: Domain-specific API endpoints
- Contains: One file per feature domain (profiles, waves, messages, etc.)
- Pattern: Each file exports a `[domain]Router` with related mutations and queries

**`apps/api/src/services/`:**
- Purpose: Stateless business logic, external integrations
- Contains: AI/embeddings, background jobs, push notifications, email, observability
- Pattern: Import specific functions on-demand (no class instances, no module-level state)

**`apps/api/__tests__/`:**
- Purpose: Unit and integration tests
- Pattern: Tests use `app.request()` directly (no server needed), validate business logic

**`apps/api/drizzle/`:**
- Purpose: Database migrations and schema snapshots
- Contains: Auto-generated migration SQL files (sequential numbered), schema metadata
- Generated by: `bun run db:generate` (auto-generates from schema.ts changes)
- Manual edits: Custom migrations with `--custom` flag for complex DDL/DML

**`apps/mobile/app/`:**
- Purpose: Expo Router route files (file-based navigation)
- Pattern:
  - `(tabs)/` = bottom tab navigation
  - `(auth)/` = login/verify screens
  - `(modals)/` = overlay sheets
  - `[id].tsx` = dynamic routes (e.g., chat detail)
  - `_layout.tsx` = layout wrappers with providers

**`apps/mobile/src/stores/`:**
- Purpose: Zustand global state
- Files: One store per domain (auth, location, waves, messages, conversations, etc.)
- Pattern: `create<StateType>((set) => ({ /* state + setters */ }))`

**`apps/design/src/variants/`:**
- Purpose: Design theme variants for component showcase
- Pattern: Each variant is a CSS module with color/spacing/typography overrides
- Used by: Design book gallery to render same components in different themes

**`packages/shared/`:**
- Purpose: Shared types, Zod validators, math utilities
- Contains: Types used by both API and mobile (Wave, Message, Profile, etc.)
- Validators: Zod schemas for API input validation
- Math: `haversine()` distance calculation for location-based queries

**`docs/architecture/`:**
- Purpose: Permanent design documentation (committed to git)
- Contents: Rate limiting strategy, account deletion flow, data export process, etc.
- When to use: Complex subsystems, cross-service concerns, regulatory compliance

**`.claude/rules/`:**
- Purpose: Enforced project conventions per category
- Files: One file per category (api.md, drizzle.md, mobile.md, etc.)
- Used by: Claude instructions during implementation

## Key File Locations

**Entry Points:**
- `apps/api/src/index.ts` — HTTP server (Hono), WebSocket, BullMQ worker, tRPC router
- `apps/mobile/app/_layout.tsx` — Root navigation + providers (QueryClient, WebSocket, Toast)
- `apps/chatbot/src/index.ts` — Polling loop for seed user responses
- `apps/design/src/routes` — Design book pages
- `apps/website/src/routes` — Landing page routes

**Configuration:**
- `apps/api/src/auth.ts` — Better Auth setup (email provider, session config)
- `apps/api/src/db/schema.ts` — Drizzle table definitions
- `apps/api/src/config/rateLimits.ts` — Rate limit thresholds per endpoint
- `apps/mobile/.env.local` — API URL configuration
- `biome.json` — Code formatter + linter rules

**Core Logic:**
- `apps/api/src/trpc/procedures/*.ts` — Business logic per domain
- `apps/api/src/services/ai.ts` — OpenAI integration, embedding/matching
- `apps/api/src/services/queue.ts` — Background job processing
- `apps/api/src/ws/handler.ts` — Real-time event delivery
- `packages/shared/src/validators.ts` — Input validation schemas

**Testing:**
- `apps/api/__tests__/*.test.ts` — Unit + integration tests
- `apps/mobile/.maestro/` — E2E test flows
- `packages/shared/__tests__/validators.test.ts` — Validator schema tests

## Naming Conventions

**Files:**
- Exports: PascalCase for types, components (e.g., `Wave`, `MessageBubble`)
- Functions/utilities: camelCase (e.g., `sendWave`, `getUserConversations`)
- Routes: kebab-case (e.g., `set-status.tsx`, `user-profile.tsx`)
- Tests: `.test.ts` suffix (e.g., `health.test.ts`)
- Migrations: `0001_add_column.sql` (sequential number prefix)

**Directories:**
- Feature domains: camelCase plural or collection name (e.g., `procedures`, `services`)
- Feature modules: camelCase (e.g., `nearbyGroups`, `userProfiles`)
- Route segments: kebab-case (e.g., `(auth)`, `(tabs)`, `user-profile`)

**Types/Interfaces:**
- PascalCase (e.g., `Wave`, `Profile`, `Message`)
- Suffixes: `Schema` (Zod), `Input` (tRPC input), `Output` (tRPC output)
- Database columns: snake_case (mapped from camelCase in TypeScript)

**Constants:**
- Uppercase_SNAKE_CASE (e.g., `DAILY_PING_LIMIT_BASIC`, `PER_PERSON_COOLDOWN_HOURS`)
- Configuration: uppercase with underscores in config files

## Where to Add New Code

**New Feature (end-to-end):**
1. **Database:** Add table to `apps/api/src/db/schema.ts` with Drizzle
2. **Migration:** Run `bun run --filter '@repo/api' db:generate -- --name=add_feature`
3. **Procedures:** Create `apps/api/src/trpc/procedures/feature.ts`, add to router
4. **Services:** Extract business logic to `apps/api/src/services/feature.ts` if needed
5. **Mobile:** Create screens in `apps/mobile/app/feature/` or add to existing screens
6. **Validation:** Add Zod schemas to `packages/shared/src/validators.ts`
7. **Tests:** Add tests to `apps/api/__tests__/feature.test.ts`

**New Component (mobile):**
- UI component: `apps/mobile/src/components/ui/ComponentName.tsx`
- Feature component: `apps/mobile/src/components/feature/ComponentName.tsx`
- Pattern: Export as default, use Zustand stores for state, call tRPC hooks for API

**New Utility/Helper:**
- Shared (used by API and mobile): `packages/shared/src/utils.ts` or new file
- API-only: `apps/api/src/lib/[name].ts`
- Mobile-only: `apps/mobile/src/lib/[name].ts`

**New Service/Integration:**
- Add to `apps/api/src/services/[name].ts`
- Export pure functions (no classes)
- Import on-demand in procedures or queue jobs
- Avoid module-level state

**New tRPC Procedure:**
1. Add to existing router in `apps/api/src/trpc/procedures/[domain].ts`
2. Apply `protectedProcedure` or `publicProcedure`
3. Apply middleware: `.use(featureGate("name"))`, `.use(rateLimit("name"))`
4. Define input with Zod schema from `@repo/shared`
5. Implement logic, access `ctx.userId`, `ctx.db`

**New Background Job:**
1. Define job type in `apps/api/src/services/queue.ts` (add case to worker dispatcher)
2. Enqueue from procedure: `queue.add(jobType, jobData, options)`
3. Implement handler function in queue.ts
4. Track metrics via `queue-metrics.ts`

**New Test:**
- Location: `apps/api/__tests__/feature.test.ts`
- Pattern: `app.request()` for HTTP, describe + it blocks, use Vitest assertions
- Setup: Import types from schema, use test database (same as dev)

## Special Directories

**`apps/api/drizzle/`:**
- Purpose: Database migration management
- Generated: Automatically by `drizzle-kit generate`
- Committed: Yes (migrations and `meta/_journal.json` are version controlled)
- Manual edits: Only for custom migrations (`--custom` flag) with SQL comments

**`apps/api/scripts/`:**
- Purpose: One-off database operations (seed data, location scattering, etc.)
- Usage: Run via `bun run [script name]` defined in `package.json`
- Examples: `seed-users.ts` (250 test users), `scatter-locations.ts` (redistribute)

**`apps/mobile/.maestro/`:**
- Purpose: E2E test flows in Maestro YAML format
- Usage: Run via `bun run --filter '@repo/mobile' test:e2e`
- Pattern: Mobile emulator, interactions (tap, fill, swipe), assertions

**`docs/plans/`:**
- Purpose: Temporary working documents during implementation
- Gitignored: Yes (not committed)
- Naming: `BLI-X-ticket-summary-kebab-case.md`
- Lifecycle: Created during planning, reference during implementation, discarded after

**`node_modules/`, `dist/`, `.output/`:**
- Generated: Yes (by package managers, build tools)
- Committed: No (gitignored)
- Reinstall: `bun install` (respects bun.lock)

---

*Structure analysis: 2026-03-26*
