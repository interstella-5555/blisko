# Infrastructure & Deployment

> v1 — AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-11 — added Dev-only HTTP endpoints section covering `/dev/auto-login`, `/dev/mark-complete`, `/dev/send-message` (BLI-178).
> Updated 2026-04-19 — removed `apps/tasks/` (deleted in PR #163). Added `packages/db/` (canonical schema after @repo/db split). Bumped catalog pins (react 19.2.0, better-auth 1.6.2). Added `mobile:reset-ios` script. Corrected queue row counts (ai: 9 types, maintenance: 5 types).

Monorepo hosted on Railway. Runtime: Bun. Package manager: Bun workspaces. No Turborepo config file -- task orchestration uses Bun's `--filter` flag and root-level script aliases.

## Terminology & Product Alignment

| PRODUCT.md | Code / Infra | Notes |
|------------|-------------|-------|
| Ping | `wave` | PRODUCT.md says "ping" everywhere |
| Status ("na teraz") | `currentStatus` on profiles | Ephemeral user intent |
| "Co nas laczy" | `connectionAnalyses` table, AI queue jobs | AI-generated compatibility text |
| Profile Match (%) | `aiMatchScore` on `connectionAnalyses` | 0-100, asymmetric |
| Status Match | `statusMatches` table, `status-matching` queue job | Server-side matching |
| Chatbot | `@repo/chatbot` service | Seed user auto-responder |
| Design Book | `@repo/design` service | Component gallery, not production UI |

## Railway

**Project ID:** `62599e90-30e8-47dd-af34-4e3f73c2261a`

| Service | Purpose | Runtime | Port |
|---------|---------|---------|------|
| **api** | Hono HTTP + tRPC + WebSocket + BullMQ worker (all in one process) | Bun | 3000 |
| **chatbot** | Seed user auto-responder. Polls for pending waves/messages, responds via AI. | Bun | -- |
| **design** | Design book / component gallery (TanStack Start + Vite) | Node (Nitro output) | 3000 |
| **metro** | Mobile metro bundler (dev only, not always running) | Bun | -- |
| **website** | Marketing website (TanStack Start + Vite) | Bun (Nitro output) | 4000 |
| **admin** | Admin panel (TanStack Start + Vite) | Node (Nitro output) | 3001 |
| **database** | PostgreSQL | -- | -- |
| **queue** | Redis (BullMQ job queue, pub/sub for WebSocket cross-replica events, rate limiting sliding window counters) | -- | -- |

**Why everything in one `api` process:** At current scale (<1000 users), splitting the BullMQ worker into a separate service would double Railway costs and add deployment complexity. The worker shares the same Drizzle `db` instance and WebSocket `publishEvent()` function. When scale demands it, the worker can be extracted -- it already uses `REDIS_URL` for all communication.

## Monorepo Structure

```
blisko/
  apps/
    api/          @repo/api       Hono + tRPC + Better Auth + BullMQ
    mobile/       @repo/mobile    Expo + React Native (iOS + Android)
    chatbot/      @repo/chatbot   Seed user AI auto-responder
    design/       @repo/design    Design book (TanStack Start)
    website/      @repo/website   Marketing site (TanStack Start)
    admin/        @repo/admin     Admin panel (TanStack Start)
  packages/
    db/           @repo/db        Canonical Drizzle schema (`src/schema.ts`). `apps/api/src/db/schema.ts` is a re-export shim for backward compat.
    shared/       @repo/shared    Cross-app config constants, types, Zod validators, AI model constants, haversine
    dev-cli/      @repo/dev-cli   CLI for development (user management, monitoring)
```

**Workspace config** in root `package.json`: `"workspaces": ["apps/*", "packages/*"]`.

**Version catalog** in root `package.json` `"catalog"` field pins shared dependency versions across workspaces:

| Dependency | Catalog Version |
|------------|----------------|
| `react` | `19.2.0` |
| `typescript` | `^6.0.2` |
| `zod` | `^4.3.5` |
| `vitest` | `^3.0.5` |
| `vite` | `^7.3.1` |
| `drizzle-orm` | `^0.45.1` |
| `postgres` | `^3.4.0` |
| `better-auth` | `^1.6.2` |
| `ai` (Vercel AI SDK) | `^6.0.86` |
| `@ai-sdk/openai` | `^3.0.29` |
| `tailwindcss` | `^4.2.2` |
| `@tanstack/react-router` | `^1.167.5` |
| `@tanstack/react-start` | `^1.166.17` |

### Script Convention

Every script exists in both the package's own `package.json` AND the root `package.json` with `<pkg>:<script>` naming. All scripts are run from the root via `bun run <pkg>:<script>`.

Key root scripts:

| Script | Maps To |
|--------|---------|
| `api:dev` | `bun run --filter '@repo/api' dev` (watch mode) |
| `api:dev:production` | `bun run --filter '@repo/api' dev:prod` (local API process pointed at production env) |
| `api:test` | `bun run --filter '@repo/api' test` |
| `api:scatter` | `bun run --filter '@repo/api' scatter` — re-scatter seed users via API |
| `api:scatter:production` | `bun run --filter '@repo/api' scatter:production` — same against production env |
| `api:seed:slo` | `bun run --filter '@repo/api' seed:slo` — backfill SLO targets in `metrics` schema |
| `chatbot:dev` | `bun run --filter '@repo/chatbot' dev` |
| `design:dev` | `bun run --filter '@repo/design' dev` |
| `website:dev` | `bun run --filter '@repo/website' dev` |
| `admin:dev` | `bun run --filter '@repo/admin' dev` |
| `dev-cli` | `bun run --filter '@repo/dev-cli' cli` |
| `dev-cli:queue-monitor` | `bun run --filter '@repo/dev-cli' monitor` — live BullMQ queue state |
| `dev-cli:chatbot-monitor` | `bun run --filter '@repo/dev-cli' chatbot-monitor` — chatbot activity feed |
| `mobile:testflight` | `bun run --filter '@repo/mobile' testflight` |
| `mobile:reset-ios` | `bash apps/mobile/scripts/reset-ios.sh` — nuke Metro/Xcode caches, `expo prebuild --clean`, rebuild + launch simulator. Use after native-dep changes or SDK upgrade. |
| `ralph` / `ralph:dry` | `bash scripts/ralph.sh [--dry-run]` — Ralph Protocol runner (auto-ticket execution) |
| `check` | `biome check .` |
| `check:fix` | `biome check --fix .` |

Build / start / typecheck scripts exist for every deployable app (e.g. `api:build`, `api:start`, `admin:build`, `admin:start`, `admin:typecheck`, `design:build`/`start`/`preview`, `website:build`/`start`/`preview`/`test`, `chatbot:start`). Root `clean` wipes `dist/` + `node_modules/` across the workspace.

### `@repo/shared` Package

Source-only package (`"main": "./src/index.ts"`), no build step. Exports:

- **`config/nearby.ts`** -- Cross-app constants: `VIEWPORT_DEBOUNCE_MS` (500), `NEARBY_RATE_LIMIT` ({limit:20, window:10}), `GRID_SIZE` (0.0045), `NEARBY_PAGE_SIZE` (20). The debounce↔rate limit coupling is the primary motivation (BLI-189/BLI-219).
- **`config/waves.ts`** -- Ping business rules: `DECLINE_COOLDOWN_HOURS` (24), `DAILY_PING_LIMIT_BASIC` (5), `PER_PERSON_COOLDOWN_HOURS` (24).
- **`config/auth.ts`** -- Auth constants: `OTP_LENGTH` (6), `RESEND_COOLDOWN_SECONDS` (30).
- **`validators.ts`** -- Zod schemas for all API inputs (profile, wave, message, group, topic, status, profiling, nearby queries). Defines limits: `displayName` 2-50 chars, `bio` 10-500 chars, `message.content` 1-2000 chars, `status.text` 1-150 chars, `status.categories` 1-2 items, `nearbyUsers.radiusMeters` 100-50000 (default 5000), `nearbyUsersForMap.limit` 1-100 (default 50), `group.memberUserIds` max 199.
- **`models.ts`** -- AI model constants keyed by role (BLI-236): `AI_MODELS = { sync: "gpt-5-mini", async: "gpt-5-mini" }`, `EMBEDDING_MODEL = "text-embedding-3-small"`. Both roles map to the same model today — the split exists so the `sync` role can diverge later (e.g. a faster non-reasoning model) without touching call-sites. Call-sites reference the role, not the model id — swap the mapped value to change providers.
- **`math.ts`** -- `cosineSimilarity(a, b)` function for embedding comparison.

### `@repo/dev-cli` Package

Development CLI (`commander`). Dependencies: `bullmq`, `drizzle-orm`, `postgres`. Commands documented in root CLAUDE.md.

## Deployment

### Post-Deploy Migration

The Railway API service has a post-deploy hook that runs `bun run src/migrate.ts`. This is the ONLY way migrations reach production. Never run migration commands locally against production -- `apps/api/.env` points at the production database.

Migration script (`apps/api/src/migrate.ts`): imports `drizzle-orm/node-postgres/migrator`, runs `migrate(db, { migrationsFolder: "./drizzle" })`, exits 0 on success or 1 on failure. Uses the `pg` package (not postgres.js) for the migrator because `drizzle-orm/postgres-js/migrator` has compatibility issues with Bun.

### Env Files

| File | Loaded By | Points At | Used For |
|------|-----------|-----------|----------|
| `apps/api/.env` | Bun automatically | **Production DB** | Local dev. Treat migration commands as prod deploys. |
| `apps/api/.env.production` | Manual: `bun --env-file=.env.production run ...` | Production (all services) | Scripts needing prod access, simulator testing |
| `apps/mobile/.env.local` | Expo | Configurable | `EXPO_PUBLIC_API_URL` -- production or local dev |

**Why `.env` points at production DB:** Railway's Postgres is the only database instance. There is no separate dev database. This is a deliberate simplicity choice -- the seed users provide a safe testing environment. The risk is mitigated by the migration workflow rule: never run `drizzle-kit migrate` locally.

### Env Var Inventory (API Service)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string (BullMQ, pub/sub, rate limiting) |
| `BETTER_AUTH_SECRET` | Session signing key |
| `BETTER_AUTH_URL` | Base URL for OAuth callbacks |
| `OPENAI_API_KEY` | OpenAI API access |
| `RESEND_API_KEY` | Resend email service |
| `EMAIL_FROM` | Sender address (default: `Blisko <noreply@blisko.app>`) |
| `BUCKET_ACCESS_KEY_ID` | Tigris S3-compatible storage |
| `BUCKET_SECRET_ACCESS_KEY` | Tigris S3-compatible storage |
| `BUCKET_ENDPOINT` | Tigris S3-compatible storage |
| `BUCKET_NAME` | Tigris S3-compatible storage |
| `IP_HASH_SALT` | Salt for hashing client IPs in metrics (default: `dev-salt`) |
| `ENABLE_DEV_LOGIN` | `true` enables the entire `/dev/*` HTTP surface (see Dev-only HTTP endpoints below). Currently `true` in Railway production to support E2E tests seeded via `@repo/mobile`'s Maestro suite. |
| `PORT` | HTTP port (default: 3000) |
| `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET` | Apple OAuth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` | Facebook OAuth |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | LinkedIn OAuth |
| `SENTRY_DSN` | Bugsink (Sentry-compatible) DSN for the `blisko-api` project. Unset locally → error reporting disabled. See `instrumentation.md`. |
| `RAILWAY_ENVIRONMENT_NAME` / `RAILWAY_DEPLOYMENT_ID` | Railway-injected. Used as Sentry `environment` / `release` tags. |

**After changing any env var on a Railway service, immediately redeploy that service.**

## Dev-only HTTP endpoints

A small set of HTTP routes in `apps/api/src/index.ts` exists outside the tRPC router for E2E test seeding and local development. The entire block is guarded by:

```ts
if (process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_LOGIN === "true") {
  // all /dev/* endpoints registered here
}
```

On Railway production, `ENABLE_DEV_LOGIN=true` so these routes **are live in prod**. They are unauthenticated by design — anyone who can reach `https://api.blisko.app` can call them. This is an accepted trust trade-off for letting the Maestro E2E suite run against production.

| Endpoint | Method | Purpose | Bypasses |
|----------|--------|---------|----------|
| `/dev/auto-login` | POST | Create (or find) a `@example.com` user + session; returns `{ user, session, token }`. Body: `{ email }`. Rejects non-`@example.com` emails. | Magic link / OTP flow |
| `/dev/mark-complete` | POST | Set `profiles.isComplete = true` for a given `userId`. Body: `{ userId }`. Used to unblock features gated by `isComplete` (waves, groups) without running the full profiling Q&A. | Profiling flow (no portrait/embedding/interests generated) |
| `/dev/send-message` | POST | Insert a message row directly. Body: `{ conversationId, senderId, content }`. Returns `{ messageId }`. | tRPC `messages.send` rate limiter, content moderation, participant check, WS broadcast |

**Why `/dev/send-message` bypasses tRPC:** the `messages.send` procedure has a `rateLimit` middleware that reads `input.conversationId` before `.input()` runs, producing `TypeError: input is undefined` for non-batched HTTP callers (bash/curl). The dev endpoint writes to the `messages` table directly to sidestep this.

**Consumers:**
- `apps/mobile/.maestro/chat/seed-chat.sh` — calls all three per test run
- `packages/dev-cli/src/cli.ts` — `cleanup-e2e` removes users created by the seed script (email pattern `seed%@example.com`)

**Gotchas:**
- Messages inserted via `/dev/send-message` skip `moderateContent` — only safe for known-good seed text.
- Profiles marked via `/dev/mark-complete` have `isComplete=true` but no `portrait`, `embedding`, or `interests`. They'll pass feature gates but fail AI tier-2/tier-3 matching.
- The `/dev/*` surface has no per-endpoint rate limiting. Abuse protection is the URL-based obscurity + eventual cleanup.

## External Services

### OpenAI

| Model | Constant | Used For |
|-------|----------|----------|
| `gpt-5-mini` | `AI_MODELS.async` / `AI_MODELS.sync` | All app + chatbot AI: connection analysis (batch + on-demand), quick-score, status match evaluation, portrait/interests generation, profile Q&A, profiling question generation, inline follow-up questions, demo chatbot. Flex tier (50% off) for async BullMQ jobs; Standard for sync/on-demand/chatbot. |
| `text-embedding-3-small` | `EMBEDDING_MODEL` | Profile embeddings, status embeddings |
| Moderation API | direct fetch | Content moderation (bio, status, messages, group names) |

All AI calls go through `@ai-sdk/openai` + Vercel AI SDK (`ai` package) except moderation which uses raw `fetch` to `https://api.openai.com/v1/moderations`.

Graceful degradation: if `OPENAI_API_KEY` is not set, AI functions return empty results or skip processing. Moderation returns without blocking.

### BullMQ (Redis)

Three queues grouped by bottleneck. See `queues-jobs.md` for full job type documentation.

| Queue | Source file | Concurrency | Job types | Retention (failed) |
|---|---|---|---|---|
| `ai` | `queue.ts` | 50 | 9 AI job types | count: 100 |
| `ops` | `queue-ops.ts` | 10 | 5 GDPR/admin types | age: 90 days |
| `maintenance` | `queue-maintenance.ts` | 2 | 5 periodic types (push-log flush/prune, ai-calls flush/prune, consistency sweep) | count: 10 |

All three workers start in the same API process. Shared utilities in `queue-shared.ts`.

**Ambient push cooldown:** After status match is found, push notification is sent with 1-hour Redis cooldown per user (`ambient-push:{userId}`, TTL 3600s) to prevent notification fatigue.

### Resend (Email)

Transactional email only. Falls back to `console.log` when `RESEND_API_KEY` is not set.

**From address:** `process.env.EMAIL_FROM || "Blisko <noreply@blisko.app>"`

Templates: `signInOtp`, `changeEmailOtp`, `dataExportReady`. All wrapped in `layout()` with branded header/footer.

### Bugsink (Error Tracking)

Self-hosted, Sentry-SDK-compatible. Lives in a **separate Railway project** (`bugsink`, ID `ed637dd9-bcb7-4f0b-9a3e-2827934ade1a`) so it survives outages of the apps it monitors. Single instance hosts one project per app (`blisko-api`, `blisko-chatbot`, …). Each app gets its own DSN injected as `SENTRY_DSN` on its Railway service. Init contract, capture sites, and `beforeSend` scrubbing live in `instrumentation.md`. Chatbot uses a separate DSN so its noise doesn't drown api errors.

### Expo Push Notifications

`expo-server-sdk` (`^6.0.0`). Sends via `sendPushNotificationsAsync()` in chunks. Smart suppression:

- **WebSocket connected:** If user has an active WS connection, push is skipped (in-app banner handles it)
- **Do Not Disturb:** If `profiles.doNotDisturb` is true, push is suppressed
- **Group collapse:** Group notifications use `collapseId` for unread batching

Invalid tokens (failed delivery) are cleaned up on ticket check.

### Tigris / S3-Compatible Storage

Uses Bun's built-in `S3Client`. Three usage points in the codebase:

1. **File uploads** (`POST /uploads` in `index.ts`): Max 5MB, images only. Presigned URLs with 7-day expiry.
2. **GDPR data export** (`data-export.ts`): JSON file uploaded, presigned URL emailed. 7-day link expiry.
3. **Anonymization** (`queue-ops.ts` hard-delete): Deletes avatar and portrait S3 files.

### WebSocket (Bun native)

Bun's native WebSocket server at `/ws`. No external library.

**Auth:** Client sends `{ type: "auth", token: "..." }` after connection. Server validates via `sessionByToken` prepared statement. On success, auto-subscribes to all user's conversations.

**Rate limiting (in-memory):**
- Global: 30 messages per 60 seconds per user (silent drop)
- Typing: 10 indicators per 10 seconds per user (silent drop)
- Cleanup interval: expired rate limit entries purged every 5 minutes

**Redis pub/sub bridge** (`ws/redis-bridge.ts`): For cross-replica event delivery. Publishes to `ws-events` Redis channel. Without `REDIS_URL`, falls back to local `EventEmitter`. Currently single-replica, so the bridge is a future-proofing measure.

**Events:** `newMessage`, `reaction`, `typing`, `newWave`, `waveResponded`, `analysisReady`, `nearbyChanged`, `profileReady`, `statusMatchesReady`, `questionReady`, `profilingComplete`, `groupMember`, `groupUpdated`, `conversationDeleted`, `topicEvent`, `groupInvited`, `forceDisconnect`.

## Monitoring & Metrics

### Hono Metrics Middleware

`apps/api/src/services/metrics.ts`. First middleware in the chain -- captures full request duration.

**Config:**

| Setting | Value |
|---------|-------|
| Buffer hard cap | 5000 events |
| Flush threshold | 500 events |
| Flush interval | 10,000ms (10s) |
| Skip paths | `/metrics`, `/api/metrics/summary` |

Buffer safety: if flush fails and buffer hits hard cap, oldest 10% of events are dropped with a warning. Flush runs in `try/catch` -- DB errors don't crash the server.

### Prometheus Metrics

`apps/api/src/services/prometheus.ts`. Custom `prom-client` registry (not default).

**HTTP metrics:**
- `http_request_duration_ms` histogram (buckets: 10, 25, 50, 100, 200, 500, 1000, 2500, 5000)
- `http_requests_total` counter (labels: method, endpoint, status_code)

**BullMQ metrics:**
- `bullmq_jobs_total` counter (labels: queue, status)
- `bullmq_job_duration_ms` histogram (buckets: 100, 500, 1000, 2500, 5000, 10000, 30000, 60000)
- `bullmq_queue_depth` gauge (labels: queue, state)

**WebSocket metrics:**
- `ws_connections_active` gauge
- `ws_subscriptions_active` gauge
- `ws_auth_total` counter (labels: result)
- `ws_events_inbound_total` counter (labels: type)
- `ws_events_outbound_total` counter (labels: event_type)
- `ws_rate_limit_hits_total` counter (labels: limit)

### API Endpoints

- **`GET /api/metrics/summary?window=24`** -- AI-readable JSON overview. IP rate limited (30/60s).
- **`GET /metrics`** -- Prometheus text format. IP rate limited (30/60s).
- **`GET /health`** -- Simple health check (always returns `{ status: "ok" }`).

### SLO Targets

Stored in `metrics.slo_targets` table. Default: p95 < 500ms, error_rate < 5%.

## Testing

| Type | Command | Framework | Pattern |
|------|---------|-----------|---------|
| API unit/integration | `bun run api:test` | Vitest (`bun --bun vitest run`) | `app.request()` directly, no HTTP server needed |
| Shared package | `bun run --filter '@repo/shared' test` | Vitest | Pure function tests |
| Design book | `bun run --filter '@repo/design' test` | Vitest + jsdom + Testing Library | Component tests |
| Website | `bun run website:test` | Vitest + jsdom + Testing Library | Component tests |
| E2E mobile | `bun run --filter '@repo/mobile' test:e2e` | Maestro | YAML flows in `.maestro/` |

**Why `app.request()` instead of a running server:** Hono's `app.request()` method lets tests call routes directly without starting an HTTP server. This means tests are fast, no port conflicts, no server lifecycle management. The `app` export from `apps/api/src/index.ts` is imported directly.

**Why `bun --bun vitest`:** Forces Vitest to use Bun's runtime instead of Node, which is needed for Bun-specific APIs (`RedisClient`, `S3Client`, `Bun.CryptoHasher`).

## Code Quality

### Biome

`@biomejs/biome` `^2.4.6`. Handles formatting, linting, and import ordering.

- `bun run check` -- check only
- `bun run check:fix` -- auto-fix

### Husky + lint-staged

Pre-commit hook via `husky` `^9.1.7` + `lint-staged` `^16.3.1`.

**Staged file handlers:**
- `*.{ts,tsx,js,jsx,json,css}` -- `biome check --fix --no-errors-on-unmatched`
- `apps/api/src/**/*.ts` -- `bun run --filter @repo/api typecheck`
- `apps/mobile/**/*.{ts,tsx}` -- `bun run --filter @repo/mobile typecheck`
- `packages/shared/src/**/*.ts` -- `bun run --filter @repo/shared typecheck`
- `apps/admin/**/*.{ts,tsx}` -- `bun run --filter @repo/admin typecheck`

TypeScript `^6.0.2` used across all packages.

### TestFlight Deployment (iOS)

`bun run mobile:testflight` runs `apps/mobile/scripts/testflight.sh`. This creates a local Xcode build. After the script completes, the archive is manually uploaded via Xcode Organizer -> Distribute App. No EAS Build -- local builds only.

**Before TestFlight:** Set `apps/mobile/.env.local` to `EXPO_PUBLIC_API_URL=https://api.blisko.app` (production API).

### Android Deploy (Fastlane + GitHub Actions)

`.github/workflows/android-deploy.yml` runs on push to `main` that touches `apps/mobile/**`. Flow: `expo prebuild --platform android` -> copy `apps/mobile/fastlane-android/` into the generated `android/fastlane/` -> `bundle exec fastlane deploy_internal`. Lane builds an AAB via Gradle, uploads to Play Console **internal** track as **draft** via `upload_to_play_store`. `versionCode` is injected from `GITHUB_RUN_NUMBER`; `versionName` stays from `build.gradle`.

Fastlane config lives in `apps/mobile/fastlane-android/` (Fastfile, Appfile, Gemfile) because `apps/mobile/android/` is gitignored (regenerated by prebuild). The workflow copies it in after prebuild.

**Signing:** Expo's prebuild-generated `build.gradle` only defines a `debug` signingConfig, so release signing is overridden via `android.injected.signing.*` Gradle properties passed by Fastfile. The upload keystore is base64-decoded into `android/app/upload.keystore` before the build and deleted in the `always()` cleanup step.

**Required GitHub secrets:** `EXPO_PUBLIC_API_URL`, `GOOGLE_MAPS_ANDROID_API_KEY`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `PLAY_STORE_SERVICE_ACCOUNT_JSON`. Keystore + service-account files are written to disk at job start and deleted in the `always()` cleanup step.

Promotion from internal -> alpha/beta/production is manual in Play Console. Manual trigger: `gh workflow run android-deploy.yml`. Contrast with iOS where every deploy is manual; Android is auto on merge.

## Impact Map

If you change this system, also check:
- `database.md` -- migration workflow, Drizzle config, connection pooling
- `auth-sessions.md` -- env vars, Better Auth config, session management
- `queues-jobs.md` -- BullMQ worker config, job types, concurrency
- `websockets-realtime.md` -- Redis pub/sub bridge, WebSocket handler
- `rate-limiting.md` -- Redis-based sliding window, rate limit config
- `push-notifications.md` -- Expo push, suppression logic
- `gdpr-compliance.md` -- data export, anonymization job
- `instrumentation.md` -- metrics middleware, Prometheus, query tracking
- `mobile-architecture.md` -- Expo dependencies, env vars, build process
- `e2e-test-coverage.md` -- consumers of `/dev/*` endpoints (seed script + dev-cli cleanup)
