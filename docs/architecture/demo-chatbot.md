# Demo Chatbot & Seed Users

> v1 --- AI-generated from source analysis, 2026-04-06.

The seed user system populates Warsaw's map with 250 AI-driven users that respond to waves and messages. This creates a living demo environment for testing, investor demos, and development. The chatbot is a separate Railway service that polls the database and acts through the API.

## Terminology & Product Alignment

| PRODUCT.md term | Code term | UI label (PL) |
|-----------------|-----------|---------------|
| Ping | Wave | "Ping" / "Pinguje Cie!" |
| Ping akceptacja | wave.respond (accept: true) | "Przyjal(a) Twoj ping!" |
| Ping odrzucenie | wave.respond (accept: false) | "Ta osoba jest teraz niedostepna" |
| Profil Match % | aiMatchScore (0--100) | % on bubble |
| Co nas laczy | connection analysis (shortSnippet) | "Co Was laczy" |
| Banka na mapie | nearby user with location | (visual element) |

---

## Seed Users

### Creation

**Script:** `apps/api/scripts/seed-users.ts`

250 users with emails `user0@example.com` through `user249@example.com`. The script creates auth accounts, profiles (with AI-generated bios), and locations. Profile data is cached in `apps/api/scripts/.seed-cache.json` to avoid regenerating on subsequent runs. Delete the cache file to force full regeneration.

**Auto-login:** The API has a `ENABLE_DEV_LOGIN` flag. When enabled, `@example.com` emails can authenticate via `POST /dev/auto-login` without OTP --- returns a session token directly. This is how both the chatbot and dev-cli authenticate as seed users.

### Location Distribution

Seed users are scattered across 7 Warsaw districts: Ochota, Wlochy, Wola, Srodmiescie, Mokotow, Ursynow, Bemowo. Location placement uses real district boundary polygons from `apps/api/scripts/warszawa-dzielnice.geojson` with ray-casting point-in-polygon validation.

### Scatter Scripts (3 Variants)

| Script | Method | Side-effects | Use case |
|--------|--------|-------------|----------|
| `scatter-locations-db.ts` (`bun run api:scatter`) | Direct DB UPDATE | None | Quick re-scatter for layout testing |
| `scatter-locations.ts` | API calls (auto-login + `profiles.updateLocation`) | AI re-analysis + WS broadcasts | Full re-scatter with live updates |
| `scatter-targeted.ts` | Direct DB UPDATE | None | Place specific user ranges in specific areas |

#### Targeted Scatter

`scatter-targeted.ts` reads area definitions from `apps/api/scripts/scatter-areas.json`. Three area types: `geojson-ref` (references district from geojson), `polygon` (inline coordinates), `bbox` (bounding box).

**Usage:** `bun --env-file=apps/api/.env.production run apps/api/scripts/scatter-targeted.ts <area>:<count>:<startIdx> [...]`

**Flags:** `--list` (show available areas), `--dry-run` (preview without DB writes), `--config <path>` (custom config file). Validates no overlapping user index ranges.

---

## Chatbot Architecture

**Source:** `apps/chatbot/src/` (4 files: `index.ts`, `ai.ts`, `api-client.ts`, `events.ts`)

### Why Polling + API Writes

The chatbot reads from the database directly (new waves, new messages, participant info) but writes through the API (respond to wave, send message). This is deliberate: API writes trigger WebSocket events, push notifications, and other side-effects that direct DB writes would bypass. The poller runs every 3s and catches any new activity.

### Connection Architecture

- **Database:** Direct postgres.js connection (not Drizzle ORM --- uses raw table imports from the API schema)
- **API:** HTTP calls via `apps/chatbot/src/api-client.ts` to `API_URL` (default `http://localhost:3000`)
- **Redis:** Optional. Used for `analysis:ready` subscription (speeds up wave handling) and bot event publishing

### Config

| Setting | Value | Source |
|---------|-------|--------|
| Poll interval | 3000ms | `BOT_POLL_INTERVAL_MS` env var, default 3000 |
| Activity window | 5 minutes (300,000ms) | `ACTIVITY_WINDOW_MS` constant |
| Match wait timeout | 60 seconds | `MATCH_WAIT_TIMEOUT` constant |
| Message history depth | 50 messages | Hardcoded in `handleMessage` |
| AI model | gpt-5-mini | `AI_MODELS.sync` from `@repo/shared` (BLI-236: full app standardizes on gpt-5-mini; chatbot auto-migrates via the shared constant). |
| AI temperature | 0.9 | Hardcoded in `ai.ts` |
| AI max output tokens | 150 | Hardcoded in `ai.ts` |
| Message max chars | 200 | `text.slice(0, 200)` in `ai.ts` |
| Heartbeat log | Every 100 polls | Modulo check in main loop |

### Polling Loop

Runs `pollWaves()` then `pollMessages()` sequentially every `POLL_INTERVAL` ms.

**pollWaves:** Queries pending waves where recipient email matches `%@example.com` and `createdAt > lastWaveCheck`. Deduplicates via `pendingWaves` Set. Each wave handled async via `handleWave()`.

**pollMessages:** Queries messages with `createdAt > lastMessageCheck`, groups by conversation, finds seed participants, identifies the bot (seed user who did NOT send the new message), dispatches to `handleMessage()`. Limit: 100 messages per poll.

---

## Wave Handling

When a seed user receives a wave (ping):

### 1. Pre-checks

- Re-verifies wave is still `pending` (may have been handled by human login)
- Looks up seed user email for API authentication
- **Activity guard:** If seed user has sent non-bot messages in last 5 minutes, skips (human is controlling this account)

### 2. Match Score Retrieval

Looks up `connection_analyses.aiMatchScore` for the recipient's view (fromUserId = recipient, toUserId = sender --- the analysis of "what I think of the sender").

If no score exists yet:
- Subscribes to Redis `analysis:ready` channel
- Waits up to 60 seconds for the analysis job to complete
- Checks both directions (`A->B` and `B->A`) since either could arrive
- On timeout: proceeds with `null` score

### 3. Accept/Decline Decision

```
shouldAcceptWave(matchScore):
  null  -> 50% probability (coin flip)
  >= 75 -> 100% (always accept)
  0-74  -> 10% + (score/75) * 90%  (linear scale from 10% to 100%)
```

Examples: score 0 = 10% accept, score 37 = 54% accept, score 50 = 70% accept, score 75+ = 100% accept.

### 4. Post-Accept: Opening Message

If wave was accepted and a conversation was created, decides whether to send an opening message:

```
shouldInitiateConversation(matchScore):
  null  -> 30% probability
  >= 75 -> 100% (always initiates)
  0-74  -> 5% + (score/75) * 95%  (linear scale from 5% to 100%)
```

If initiating, generates an AI opening message using both profiles and sends via API.

---

## Message Handling

When a non-bot message arrives in a seed user's conversation:

### Guards

1. **Activity guard:** Same as waves --- if seed user has human activity in last 5 minutes in this conversation, bot skips
2. **Seed-to-seed guard:** If the other participant is also a seed user AND has no human activity, bot skips. Prevents infinite bot-to-bot conversation loops. If a human has recently typed as either seed user, the other bot responds normally.

### Response Generation

1. Fetches last 50 messages from conversation (ordered by createdAt desc, reversed to chronological)
2. Maps each message to `bot` or `other` sender perspective
3. Looks up both profiles
4. Calls `generateBotMessage(botProfile, otherProfile, history, isOpening=false)`

---

## AI Message Generation

**File:** `apps/chatbot/src/ai.ts`

`generateBotMessage(botProfile, otherProfile, conversationHistory, isOpening)`:

### AI Call Logging

Every call to `generateBotMessage` (success or failure) is logged into `metrics.ai_calls` via the shared-secret `POST /internal/ai-log` endpoint on the API (see `ai-cost-tracking.md`). The helper lives in `apps/chatbot/src/ai-log.ts` and is fire-and-forget — it never blocks response generation. Requires `INTERNAL_AI_LOG_SECRET` env var on both the chatbot and API services (same value). Without the secret, logging is silently disabled. Logged rows carry `jobName: "chatbot-message"`, `userId: botProfile.userId`, `targetUserId: otherProfile.userId`, so chatbot costs and payloads show up in the admin "Koszty AI" dashboard alongside API calls.

**System prompt** builds a persona from the bot's profile: name, bio, lookingFor, interests, portrait. Includes the other user's profile for context. Rules: write in Polish, colloquial, 1--3 sentences, max 200 chars, don't overuse emoji, reference shared interests, ask questions, respond with more enthusiasm when topic matches bot's interests, respond briefly when topic is foreign.

**Prompt:**
- Opening: "Pierwsza wiadomosc po zaakceptowaniu wave. Przywitaj sie nawiazujac do tego co was laczy."
- Reply: "Kontynuujesz rozmowe. Odpowiedz na ostatnia wiadomosc." + last 50 messages formatted as `Name: content`.

**Fallbacks** (when `OPENAI_API_KEY` not set): "Hej! Milo mi :)" for openings, "Fajnie, opowiedz wiecej!" for replies.

Messages sent with `metadata: { source: "chatbot" }` to distinguish from human messages (used by activity guard).

---

## Event System

**File:** `apps/chatbot/src/events.ts`

Structured events published to Redis channel `bot:events` (if `REDIS_URL` set). Each event has `type`, `bot` (seed user name), `from` (other user name), timestamp, and type-specific fields.

Event types: `wave_received`, `wave_waiting`, `wave_match_ready`, `wave_match_timeout`, `wave_accept`, `wave_decline`, `wave_skip`, `wave_expired`, `wave_error`, `opening_scheduled`, `opening_sent`, `opening_skip`, `opening_error`, `message_received`, `reply_sent`, `reply_skip`, `reply_error`.

All events also logged to stdout via `console.log`.

### Analysis-Ready Subscription

Separate Redis subscriber on `analysis:ready` channel. When an analysis completes, checks both key directions (`fromUserId-toUserId` and `toUserId-fromUserId`) against the `wavesWaitingForMatch` Map. Resolves the waiting promise so wave handling can proceed with the score.

---

## API Client

**File:** `apps/chatbot/src/api-client.ts`

Token cache: `Map<email, { userId, token }>`. Tokens obtained via `POST /dev/auto-login` and cached for the process lifetime.

tRPC calls via raw HTTP (not the tRPC client): constructs URLs as `API_URL/trpc/<path>`, sends JSON body for mutations, URL-encoded input for queries.

Exposed functions: `getToken(email)`, `respondToWave(token, waveId, accept)`, `sendMessage(token, conversationId, content)`.

---

## Dev CLI

**Commands reference** (run via `bun run dev-cli -- <command>`):

| Command | Description |
|---------|------------|
| `create-user <name>` | Create user + profile + location (auto-login, cached) |
| `send-wave --from <email> --to <email>` | Send a wave between users |
| `respond-wave <name> <waveId> accept\|decline` | Accept or decline a wave |
| `waves <name>` | Show received & sent waves for a user |
| `chats <name>` | List conversations for a user |
| `messages <name> <convId>` | Show messages in a conversation |
| `send-message <name> <convId> <text>` | Send a message |
| `reanalyze <email> [--clear-all]` | Clear analyses + re-trigger AI profiling |

Users referenced by email, resolved to userId/token from in-memory cache. `API_URL` env var overrides default `http://localhost:3000`. Calls go through the API via HTTP so WebSocket events fire.

---

## Monitors

| Monitor | Command | What it shows |
|---------|---------|---------------|
| Queue monitor | `bun run dev-cli:queue-monitor` | BullMQ job status (pending, active, completed, failed) |
| Chatbot monitor | `bun run dev-cli:chatbot-monitor` | Real-time chatbot activity stream via Redis `bot:events` subscription |

---

## Impact Map

If you change this system, also check:

- **Schema imports** --- chatbot imports `waves`, `messages`, `profiles`, `user`, `connectionAnalyses`, `conversationParticipants` directly from `apps/api/src/db/schema.ts`. Schema changes require chatbot rebuild.
- **API routes** --- chatbot calls `waves.respond` and `messages.send` tRPC mutations, plus `/dev/auto-login`. Changes to these routes break the chatbot.
- **Redis channels** --- `analysis:ready` (published by API queue workers, consumed by chatbot), `bot:events` (published by chatbot, consumed by chatbot-monitor). Channel name or payload format changes need coordination.
- **Seed user email pattern** --- `%@example.com` is hardcoded in both chatbot polling queries and the API's `ENABLE_DEV_LOGIN` gate. Changing the pattern breaks auto-login.
- **Connection analyses table** --- chatbot reads `aiMatchScore` from `connectionAnalyses` to make accept/decline decisions. Schema or scoring changes affect bot behavior.
- **AI prompts** --- changing the system prompt in `ai.ts` affects all bot conversations. After changes, existing conversations continue with new personality.
- **Scatter scripts** --- all three variants must stay in sync with the profiles table schema (latitude, longitude, last_location_update columns). `scatter-targeted.ts` depends on `scatter-areas.json` config file.
- **Dev CLI** --- shares the auto-login pattern with the chatbot. Both depend on `ENABLE_DEV_LOGIN` being enabled.
