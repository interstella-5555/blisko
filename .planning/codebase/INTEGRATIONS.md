# External Integrations

**Analysis Date:** 2026-03-26

## APIs & External Services

**AI & Language Models:**
- OpenAI - Embeddings and text generation
  - SDK/Client: `@ai-sdk/openai` (3.0.29)
  - Auth: `OPENAI_API_KEY` env var
  - Usage: `apps/api/src/services/ai.ts`, `apps/api/src/services/profiling-ai.ts`
  - Models: `text-embedding-3-small` (embeddings), `gpt-4o-mini` (text generation)
  - Purpose: User profile portrait generation, interest extraction, connection analysis, profiling Q&A generation

**Social Authentication Providers:**
- Google - OAuth 2.0 sign-in
  - SDK: Better Auth built-in provider
  - Auth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` env vars
  - Account linking: Enabled

- Apple - OAuth 2.0 sign-in
  - SDK: Better Auth built-in provider
  - Auth: `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET` env vars
  - Account linking: Enabled

- Facebook - OAuth 2.0 sign-in + Graph API
  - SDK: Better Auth built-in provider + custom fetch to Graph API
  - Auth: `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` env vars
  - API: `https://graph.facebook.com/me` - Fetch user name on account creation
  - Location: `apps/api/src/auth.ts` (databaseHooks.account.create.after)
  - Account linking: Enabled, stores name in `profiles.socialLinks`

- LinkedIn - OAuth 2.0 sign-in + API
  - SDK: Better Auth built-in provider + custom fetch to LinkedIn API
  - Auth: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` env vars
  - API: `https://api.linkedin.com/v2/userinfo` - Fetch user name on account creation
  - Location: `apps/api/src/auth.ts` (databaseHooks.account.create.after)
  - Account linking: Enabled, stores name in `profiles.socialLinks`

- Instagram - OAuth configured but not actively used
  - SDK: Better Auth built-in provider
  - Auth: `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET` env vars

## Data Storage

**Databases:**

- PostgreSQL (via Railway in production, local docker in development)
  - Connection: `DATABASE_URL` env var
  - Client: `postgres` npm package (3.4.0) - Primary ORM connection
  - Secondary: `pg` npm package (8.17.2) - Fallback client
  - ORM: `drizzle-orm` (0.45.1)
  - Adapter: `better-auth/adapters/drizzle` for session/account storage
  - Schema: `apps/api/src/db/schema.ts`
  - Migrations: `apps/api/drizzle/` with 16 migration files
  - Config: `apps/api/drizzle.config.ts`

**File Storage:**

- Local filesystem only (no S3/cloud storage configured)
  - File uploads: Rate-limited via `rateLimits.uploads` (10 per hour)
  - Location: Not exposed in current codebase; likely handled by route handler in `apps/api/src/trpc/procedures/` or web servers

**Caching:**

- Redis - Primary use cases:
  - Job queue: BullMQ stores job state
  - Pub/Sub: WebSocket event broadcasting (`publishEvent` in `apps/api/src/ws/redis-bridge.ts`)
  - Rate limiter: Lua scripts for sliding window rate limits
  - Analysis notifications: Chatbot subscribes to `analysis:ready` channel
  - Connection: `REDIS_URL` env var (e.g., `redis://localhost:6379`)
  - Client: Bun's built-in `RedisClient` (native, not ioredis)
  - BullMQ client: Uses `ioredis` internally (dependency via bullmq)

## Authentication & Identity

**Auth Provider:**

- Better Auth 1.5.4 - Self-hosted session-based auth
  - Implementation: Drizzle adapter with PostgreSQL tables
  - Email OTP: Email-based passwordless sign-in via `emailOTP` plugin
  - OAuth: Supports Google, Apple, Facebook, LinkedIn, Instagram
  - Account linking: Multiple OAuth providers can be linked to one user
  - Session storage: `session` table in PostgreSQL (via Better Auth schema)
  - Configuration: `apps/api/src/auth.ts`
  - Base URL: `BETTER_AUTH_URL` env var
  - Secret: `BETTER_AUTH_SECRET` env var (session encryption)

**Token-Based Auth:**

- No JWT or API key system visible
- Sessions managed via Better Auth sessions table
- WebSocket auth: Tokens passed via query params, validated against `session` table

## Monitoring & Observability

**Error Tracking:**

- None detected - No Sentry, Rollbar, or similar
- Errors logged to stdout via `console.error()`

**Logs:**

- Standard console output
- Hono logger middleware logs HTTP requests
- Query timing tracked via AsyncLocalStorage in `apps/api/src/db/index.ts`

**Metrics:**

- Prometheus via `prom-client` (15.1.3)
- Exposed at `GET /metrics` endpoint
- Prometheus registry: `apps/api/src/services/prometheus.ts`
- Metrics tracked:
  - HTTP request duration + count by method/endpoint/status
  - BullMQ job duration + count by queue + state
  - WebSocket connections active
  - WebSocket subscriptions active
  - WebSocket auth attempts
  - WebSocket messages (inbound/outbound) by type
  - WebSocket rate limit hits
- Scrape endpoint: `GET /metrics` (IP rate-limited: 30 req/60s)

**Custom Dashboard:**

- Metrics summary endpoint: `GET /api/metrics/summary?window=24` (JSON)
- Returns: Request counts, error rates, p95 latency, job queue depth
- Rate limit: 30 req/60s per IP
- Location: `apps/api/src/services/metrics-summary.ts`

## Job Queue & Background Processing

**Queue System:**

- BullMQ 5.69.2 - Distributed task queue
- Redis backend via `REDIS_URL`
- Job types: `apps/api/src/services/queue.ts`
  - `analyze-pair` - Compare two users for compatibility
  - `quick-score` - Fast pairwise scoring
  - `analyze-user-pairs` - Batch nearby user analysis
  - `generate-profile-ai` - AI-powered profile enhancement
  - `generate-profiling-question` - AI interview questions
  - `generate-profile-from-qa` - Profile generation from Q&A
  - `status-matching` - Match user statuses
  - `proximity-status-matching` - Status matching in nearby area
- Worker configuration: `getConnectionConfig()` in `apps/api/src/services/queue.ts`
- Job tracking: Metrics via `apps/api/src/services/queue-metrics.ts`
- Monitoring: `bun run dev-cli:queue-monitor` command

## Email & Notifications

**Email Service:**

- Resend (6.8.0) - Transactional email provider
  - API Key: `RESEND_API_KEY` env var
  - Sender: `FROM` env var or default `Blisko <noreply@blisko.app>`
  - Fallback: Logs to console if `RESEND_API_KEY` not set
  - Helper: `apps/api/src/services/email.ts`
  - Templates:
    - `signInOtp(otp, deepLink)` - Magic link + fallback OTP for login
    - `changeEmailOtp(otp)` - Email verification code
    - `dataExportReady(downloadUrl)` - GDPR data export ready
  - Admin email also configured: `apps/admin/src/lib/email.ts`
  - Calls: Never direct `resend.emails.send()` from handlers; always via `sendEmail()` helper

**Push Notifications:**

- Expo Push Notifications (expo-server-sdk 6.0.0)
  - Service: Expo's managed push service (no API key needed, uses device tokens)
  - Implementation: `apps/api/src/services/push.ts`
  - Token storage: `pushTokens` table in PostgreSQL
  - Features:
    - `collapseId` for grouping notifications (1 audible per batch)
    - Device-not-registered token cleanup
    - Skips push if user is connected via WebSocket
  - Rate limiting: Message sending is rate-limited (`messages.send`: 30/min)
  - Monitoring: Push metrics tracked via `prom-client`

**Real-Time Notifications:**

- WebSocket (native Bun WebSocket API)
  - Connection: Bidirectional WebSocket at `/ws`
  - Auth: Token validation in `apps/api/src/ws/handler.ts`
  - Event types: 16 event types defined in `apps/api/src/ws/events.ts`
  - Redis bridge: Events published to Redis pub/sub for multi-instance support
  - Rate limiting: In-memory sliding window per user/event type
  - Metrics: Active connections, subscriptions, message counts

## Deployment & CI/CD

**Hosting:**

- Railway - Cloud deployment platform
  - Services: API, Chatbot, Design Book, Website, Mobile (TestFlight), Admin, Database, Queue
  - Project ID: `62599e90-30e8-47dd-af34-4e3f73c2261a`
  - Post-deploy hook: Runs migrations via `apps/api/src/migrate.ts`
  - Note: Do not run migrations locally against production database

**CI Pipeline:**

- GitHub Actions (configured, not detailed in codebase exploration)
- Husky + lint-staged (pre-commit hooks)
  - Format check via `biome check --fix`
  - Type checking per app
  - No linting errors block commit

**Continuous Deployment:**

- Railway deploys on git push to main
- Automatic migration running via post-deploy hook

## Webhooks & Callbacks

**Incoming:**

- Better Auth callbacks: `BETTER_AUTH_URL` must point to `/api/auth/*` routes
- Expo push token registration: No webhook; tokens sent directly from mobile client

**Outgoing:**

- None detected
- Account linking hooks call out to Facebook/LinkedIn APIs (reads only)

## Third-Party Libraries for Special Features

**Maps & Location:**

- `react-native-maps` (1.27.1) - Maps UI component
- `expo-location` (19.0.8) - Device geolocation API
- No Google Maps API integration detected (maps rendered client-side via native maps)

**UI & Design:**

- `radix-ui` - Accessible component primitives (checkbox, hover-card, separator, slot)
- `lucide-react` - Icon library
- `class-variance-authority` - CSS variant system for components
- `tailwind-merge` - Utility class conflict resolution
- `tailwindcss-animate` - Animation utilities

**Image & File Handling:**

- `expo-image-picker` (17.0.10) - Device image selection
- `expo-clipboard` (8.0.8) - Copy/paste support
- No external image optimization service

**Data Export:**

- In-house implementation: `apps/api/src/services/data-export.ts`
- Purpose: GDPR/RODO compliance (exports user data as JSON)
- Rate limited: 1 per 24 hours per user

---

*Integration audit: 2026-03-26*
