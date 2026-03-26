# Architecture

**Analysis Date:** 2026-03-26

## Pattern Overview

**Overall:** Multi-tier monorepo architecture with Hono/tRPC backend, React Native mobile frontend, and supporting services.

**Key Characteristics:**
- End-to-end type safety via tRPC (shared TypeScript between client and server)
- Hybrid database access (Drizzle ORM with prepared statements for performance + relational queries)
- Real-time WebSocket event handling with Redis pub/sub bridge for multi-replica support
- AI-driven user compatibility matching via OpenAI embeddings and BullMQ background jobs
- Event-driven architecture for asynchronous tasks (waves, profiling, push notifications)

## Layers

**Presentation Layer:**
- Purpose: Mobile and web user interfaces
- Location: `apps/mobile/` (React Native + Expo), `apps/design/` (component gallery), `apps/website/` (landing page)
- Contains: UI components, screens, navigation, client-side state management (Zustand)
- Depends on: tRPC client, Better Auth client, WebSocket for real-time updates
- Used by: End users

**API Layer:**
- Purpose: HTTP endpoint handler, business logic orchestration, tRPC procedure definitions
- Location: `apps/api/src/index.ts` (Hono entry point), `apps/api/src/trpc/`
- Contains: Hono middleware stack, tRPC router, procedure definitions (`profiles`, `waves`, `messages`, `groups`, `topics`, `accounts`)
- Depends on: Database, authentication, services (AI, push, email)
- Used by: Mobile client, design/website servers

**Procedure Layer:**
- Purpose: Domain-specific tRPC procedures (mutations/queries per feature domain)
- Location: `apps/api/src/trpc/procedures/`
- Contains: `profiles.ts`, `waves.ts`, `messages.ts`, `groups.ts`, `topics.ts`, `accounts.ts`, `profiling.ts`, `pushTokens.ts`
- Pattern: Each procedure applies feature gates, rate limiting, authentication middleware before executing business logic
- Example: `waves.send` → checks user visibility, daily limits, blocks, analyzes match score, sends push, enqueues profiling job

**Middleware Layer:**
- Purpose: Cross-cutting concerns (authentication, rate limiting, feature flags)
- Location: `apps/api/src/trpc/middleware/`, `apps/api/src/middleware/`
- Contains: `rateLimit.ts`, `featureGate.ts`, HTTP-level rate limiting, metrics collection
- Pattern: tRPC middleware chain (`.use()`) applied per procedure; HTTP middleware applied globally

**Service Layer:**
- Purpose: Stateless business logic and external integrations
- Location: `apps/api/src/services/`
- Contains:
  - `ai.ts` — OpenAI embeddings, profile analysis, match scoring
  - `queue.ts` — BullMQ background jobs (pair analysis, profiling, notifications)
  - `push.ts` — Expo push notifications with collapse IDs
  - `email.ts` — Resend transactional email
  - `profiling-ai.ts` — AI profiling response generation
  - `metrics.ts`, `prometheus.ts` — observability (request timing, query count)
  - `rate-limiter.ts` — Redis-backed sliding window rate limiting
  - `data-export.ts` — GDPR/RODO data export
- Pattern: Pure functions imported on-demand, encapsulating external integrations
- No state held in services — all context passed as arguments

**Data Access Layer:**
- Purpose: Interact with PostgreSQL database
- Location: `apps/api/src/db/`
- Contains: `schema.ts` (Drizzle table definitions), `index.ts` (DB instance with query instrumentation), `prepare.ts` (prepared statement naming)
- Pattern:
  - Use Drizzle relational API for simple queries (`db.query.tables.findFirst()`)
  - Use query builder for complex joins/aggregations (`db.select().from().where()`)
  - Prepared statements for hot-path queries (session lookup, user deletion check)
  - Query instrumentation via monkey-patching `client.unsafe()` to track timing per request

**Authentication Layer:**
- Purpose: Session management and user identity verification
- Location: `apps/api/src/auth.ts`, `apps/api/src/trpc/context.ts`
- Pattern:
  - Better Auth for email magic link + session creation
  - tRPC context extracts userId from Better Auth session OR Bearer token
  - Two middleware chains: `publicProcedure` (no auth), `protectedProcedure` (requires userId)
  - Prepared statement `sessionByToken` checks session validity on every protected request

**WebSocket Layer:**
- Purpose: Real-time event delivery and multiplayer state synchronization
- Location: `apps/api/src/ws/`
- Contains: `handler.ts` (WebSocket lifecycle), `events.ts` (event type definitions), `redis-bridge.ts` (pub/sub bridge)
- Pattern:
  - Single WebSocket connection per authenticated user
  - Client authenticates via token in initial message
  - Subscriptions to conversation channels auto-populated on auth
  - Events published via Redis (`publishEvent()`) for multi-replica delivery
  - In-memory sliding window for WebSocket rate limiting per client

**Background Job Layer:**
- Purpose: Asynchronous processing of long-running tasks
- Location: `apps/api/src/services/queue.ts`, started in `apps/api/src/index.ts`
- Framework: BullMQ (Redis-backed job queue)
- Job types:
  - `pairAnalysis` — Runs OpenAI embedding matching when wave is sent/received
  - `profilingAnswers` — Processes profiling questions, updates profile embedding
  - `notificationDigest` — Batches and sends push notifications
  - `anonymizeUser` — 14-day post-deletion data anonymization
- Pattern: Jobs created in procedures via `queue.add()`, processed by worker running in same server process

**Chatbot Layer:**
- Purpose: Automated responses for seed users during testing/demo
- Location: `apps/chatbot/src/`
- Pattern:
  - Polls database for incoming waves/messages to seed users
  - Uses AI to generate contextual responses based on match score
  - Waits for pair analysis completion before accepting/declining waves
  - Tracks human activity to pause bot when user logs in
  - Published as separate Railway service alongside API

## Data Flow

**Wave Creation (Ping):**

1. Mobile client calls `waves.send(toUserId)`
2. tRPC procedure layer (`waves.ts`):
   - Validates target user exists and not soft-deleted
   - Checks user blocks bidirectionally
   - Enforces daily wave limit (per UTC midnight)
   - Enforces per-person cooldown
   - Checks sender visibility (ninja users can't send)
3. Database layer:
   - Inserts wave record with status `pending`
   - Returns created wave ID
4. Service layer:
   - Enqueues `pairAnalysis` job with both user IDs
   - Publishes `newWave` event via Redis
5. WebSocket bridge:
   - Event delivered to recipient (if connected)
   - Recipient notified via push if offline
6. Queue worker:
   - Fetches embeddings for both users
   - Calls OpenAI to compute match score
   - Updates wave record with compatibility data
   - Publishes `analysisReady` event
7. Chatbot (if recipient is seed user):
   - Listens for analysis ready, accepts/declines based on score threshold (75% = auto-accept, scales to 10% at 0)

**Message Sending:**

1. Mobile calls `messages.send(conversationId, text)`
2. Procedure layer:
   - Validates user is conversation participant
   - Rate-limits per user
   - Inserts message with metadata (source, timestamp)
3. Service layer:
   - Publishes `newMessage` event via Redis (includes message content)
4. WebSocket handler:
   - Event routed to all conversation participants
   - Recipient sees message in real-time (if connected) or via push (if offline)
5. Chatbot:
   - Listens for messages in conversations with seed users
   - Generates response via AI (`profiling-ai.ts`)
   - Sends reply after random delay

**User Profiling (Status Matching):**

1. Mobile client submits answers to profiling questions via `profiling.submitAnswers(answers)`
2. Procedure layer:
   - Validates answer format against shared Zod schema
   - Stores answers in database
3. Service layer:
   - Enqueues `profilingAnswers` job
4. Queue worker:
   - Calls OpenAI to embed the concatenated answers
   - Stores embedding in `profiles.statusEmbedding`
   - Publishes `statusMatchesReady` event
5. Mobile receives event:
   - Shows profiling results modal with nearby users matching this status
   - Re-runs nearby discovery query with status distance filter

**Nearby Group Discovery:**

1. Mobile sends location update via `profiles.updateLocation({ latitude, longitude })`
2. Procedure layer validates and stores location
3. Mobile queries `profiles.getNearby()`:
   - Uses prepared query with haversine distance calculation
   - Filters soft-deleted users
   - Filters own profile
   - Orders by distance
   - Returns top 50 with full profile data
4. Mobile groups results by grid square (`@repo/shared` — `grid.ts`):
   - Converts lat/long to grid ID for clustering
   - Groups profiles by grid ID
   - Shows user count per grid cluster on map

## Key Abstractions

**Wave (Ping):**
- Purpose: Express interest in connecting with another user
- Files: `apps/api/src/db/schema.ts` (table), `apps/api/src/trpc/procedures/waves.ts` (logic)
- Pattern:
  - Waves are immutable once sent (no cancel/undo)
  - Status lifecycle: `pending` → `accepted` or `declined`
  - Can be reverted to pending by recipient to "unmatch"
  - Snapshot of sender/recipient status preserved if status exists

**Conversation:**
- Purpose: Group chat between multiple users
- Files: `apps/api/src/db/schema.ts` (tables: `conversations`, `conversationParticipants`, `messages`)
- Pattern:
  - Created implicitly when first message sent
  - Users can only see conversations they're participants in
  - Messages immutable once sent (soft-delete only)

**Profile:**
- Purpose: User's public identity and search metadata
- Files: `apps/api/src/db/schema.ts`, `apps/api/src/trpc/procedures/profiles.ts`
- Contains: Display name, bio, interests, embedding, location, visibility mode, status, portrait
- Pattern: One profile per user, auto-created on first profile update

**Status (Proximity Status):**
- Purpose: Temporary, location-tied availability/activity marker
- Files: `profiles` table columns: `currentStatus`, `statusEmbedding`, `statusExpiresAt`, `statusVisibility`
- Pattern: Optional, short-lived (minutes to hours), can be public or private
- Used for: "Looking for coffee now", "At Warszawa Zachodnia station", etc.

**AI Analysis:**
- Purpose: Match compatibility between two users based on embeddings
- Files: `apps/api/src/services/ai.ts` (embedding generation), `apps/api/src/services/profiling-ai.ts` (profiling response generation)
- Pattern:
  - OpenAI `text-embedding-3-small` for profile embeddings
  - Cosine distance between embeddings = match score
  - Status embeddings separate from profile embeddings (status-specific matching)

**Block:**
- Purpose: User block relationship
- Files: `apps/api/src/db/schema.ts` (table), wave/message procedures
- Pattern:
  - Bidirectional enforcement (if A blocks B, A can't see/contact B and vice versa)
  - Persisted across sessions
  - Blocking prevents wave sending and conversation creation

**Visibility Mode:**
- Purpose: Control discovery and contactability
- Options: `ninja` (hidden, read-only), `semi_open` (default), `full_nomad` (fully discoverable)
- Pattern: Server-side enforcement in discovery queries and before sending waves

## Entry Points

**HTTP Server:**
- Location: `apps/api/src/index.ts`
- Triggers: `bun run api:dev` or Railway boot
- Responsibilities:
  - Initialize Hono app with middleware stack
  - Mount health check endpoint (`GET /health`)
  - Mount metrics endpoints (`GET /api/metrics/summary`, `GET /metrics`)
  - Mount tRPC router at `/trpc/*`
  - Mount file upload handler (`POST /uploads`)
  - Mount WebSocket upgrade at `/ws`
  - Start BullMQ worker
  - Start WebSocket Redis bridge

**WebSocket Handler:**
- Location: `apps/api/src/ws/handler.ts` (exported as `wsHandler` object)
- Triggers: Bun server upgrade from `/ws` path
- Responsibilities:
  - Track connected clients in-memory Set
  - Authenticate incoming token
  - Populate subscriptions from conversation participants
  - Route incoming events to Redis publisher
  - Rate-limit by event type per user
  - Handle client disconnect cleanup

**Background Job Worker:**
- Location: `apps/api/src/services/queue.ts` (function `startWorker()`)
- Triggers: Called in `apps/api/src/index.ts` on server startup
- Responsibilities:
  - Process BullMQ jobs from Redis queue
  - Dispatch to job handlers by type
  - Handle job timeouts and retries
  - Track job metrics

**Chatbot Process:**
- Location: `apps/chatbot/src/index.ts`
- Triggers: `bun run chatbot:dev` or Railway `chatbot` service boot
- Responsibilities:
  - Poll database for waves/messages to seed users
  - Authenticate as seed users via dev auto-login
  - Generate AI responses and send via API
  - Handle timeouts and state cleanup

## Error Handling

**Strategy:**
- Procedure layer throws TRPCError with specific codes (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `TOO_MANY_REQUESTS`, `BAD_REQUEST`)
- tRPC serializes error codes and messages to client
- Client displays rate-limit errors via toast, deletes-account alerts via modal
- Database errors logged server-side, generic 500 to client

**Patterns:**
- Soft-deleted users blocked at auth middleware with code `FORBIDDEN` and message `ACCOUNT_DELETED`
- Rate limit errors include retry-after milliseconds for client exponential backoff
- Input validation via Zod schemas (shared `@repo/shared`) — validation errors return code `BAD_REQUEST`
- Missing resources throw code `NOT_FOUND` without exposing resource existence to prevent enumeration

## Cross-Cutting Concerns

**Logging:** Console-based (development), structured via Prometheus metrics (production). Query timing, request duration, and error counts tracked per endpoint. View via `GET /metrics` or summary at `GET /api/metrics/summary?window=24`.

**Validation:** All user input validated via Zod schemas in `@repo/shared/src/validators.ts` and applied at procedure input layers. Invalid input throws tRPCError with code `BAD_REQUEST`.

**Authentication:** Two-factor: (1) Better Auth session cookie + email verification, OR (2) Bearer token lookup against `session` table. Soft-deleted users blocked by `isAuthed` middleware. Protected procedures require both authentication and non-deletion.

**Rate Limiting:**
- Global rate limit: 100 requests per 10 seconds per user (safety net)
- Per-endpoint limits configured in `config/rateLimits.ts`
- HTTP endpoints (metrics, auth) limited by IP address via `honoRateLimit()`
- WebSocket events limited by type + userId via in-memory sliding window
- Implementation: Redis-backed sliding window (`services/rate-limiter.ts`) with Lua scripts for atomic operations

**Metrics & Observability:**
- Request metrics: Collected by middleware (duration, query count, status code, userId)
- Query tracking: Instrumented Drizzle client counts queries + duration per request
- WebSocket metrics: Auth attempts, subscriptions, rate limit hits
- Metrics exported: Prometheus format at `/metrics`, JSON summary at `/api/metrics/summary`

---

*Architecture analysis: 2026-03-26*
