# WebSocket & Real-time Architecture

> v1 — AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-10 — Added `analysisFailed` WS event for self-healing AI queue (BLI-158).
> Updated 2026-04-10 — Added `questionFailed` WS event for self-healing profiling question generation (BLI-161).
> Updated 2026-04-10 — Added `profilingFailed` WS event for self-healing profile generation from Q&A (BLI-162).
> Updated 2026-04-10 — Added `profileFailed` WS event for self-healing profile AI generation (BLI-163).
> Updated 2026-04-10 — Added `statusMatchingFailed` WS event for self-healing status matching (BLI-164).

Bun native WebSocket server delivering real-time events to mobile clients. Source: `apps/api/src/ws/handler.ts`, `apps/api/src/ws/events.ts`, `apps/api/src/ws/redis-bridge.ts`.

## Terminology & Product Alignment

| PRODUCT.md | Code | UI (Polish) |
|---|---|---|
| Ping / wave | `newWave` / `waveResponded` events | "Nowy ping!" / "Ping przyjety!" |
| Status Match (pulsing bubble) | `statusMatchesReady` event | Pulsujaca banka na mapie |
| "Co nas laczy" ready | `analysisReady` event | % dopasowania + snippet |
| Profile Match (%) | `analysisReady` with `shortSnippet` | % na bance |
| Typing indicator | `typing` event (bidirectional) | "pisze..." |
| Chat message | `newMessage` event | Nowa wiadomosc |
| Group member action | `groupMember` event | Dolaczyl/opuscil grupe |
| Nie przeszkadzaj | DND — client-side suppression only, WS still delivers | Ikona DND |

## Event Types (22 total)

| Event | Direction | Trigger | Payload shape |
|---|---|---|---|
| `auth` | client->server | Client connects | `{ type: "auth", token: string }` |
| `auth` (response) | server->client | Auth result | `{ type: "auth", status: "ok"\|"error", conversationIds?: string[] }` |
| `subscribe` | client->server | New conversation joined | `{ type: "subscribe", conversationId: string }` |
| `typing` | client->server | User types in chat | `{ type: "typing", conversationId: string, isTyping: boolean }` |
| `typing` | server->client | Other user types | `{ type: "typing", conversationId, userId, isTyping }` |
| `newMessage` | server->client | Message sent | `{ type: "newMessage", conversationId, message: { id, senderId, content, type, metadata, replyToId, topicId, createdAt, ... }, senderName?, senderAvatarUrl? }` |
| `reaction` | server->client | Reaction added/removed | `{ type: "reaction", conversationId, messageId, emoji, userId, action: "added"\|"removed" }` |
| `newWave` | server->client | Wave received | `{ type: "newWave", wave: { id, fromUserId, toUserId, message, status, createdAt }, fromProfile: { displayName, avatarUrl } }` |
| `waveResponded` | server->client | Wave accepted/declined | `{ type: "waveResponded", responderId, waveId, accepted, conversationId?, responderProfile: { displayName, avatarUrl } }` |
| `analysisReady` | server->client | AI analysis completed | `{ type: "analysisReady", aboutUserId, shortSnippet }` |
| `analysisFailed` | server->client | AI analysis permanently failed | `{ type: "analysisFailed", aboutUserId }` |
| `nearbyChanged` | server->client | Nearby users list changed | `{ type: "nearbyChanged" }` (signal-only, client refetches) |
| `profileReady` | server->client | Profile AI generation done | `{ type: "profileReady" }` |
| `profileFailed` | server->client | Profile AI generation permanently failed | `{ type: "profileFailed" }` |
| `statusMatchesReady` | server->client | Status matches found | `{ type: "statusMatchesReady" }` (signal-only, client refetches) |
| `statusMatchingFailed` | server->client | Status matching permanently failed | `{ type: "statusMatchingFailed" }` |
| `questionReady` | server->client | Next profiling question | `{ type: "questionReady", sessionId, questionNumber }` |
| `questionFailed` | server->client | Profiling question generation permanently failed | `{ type: "questionFailed", sessionId, questionNumber }` |
| `profilingComplete` | server->client | Profiling session done | `{ type: "profilingComplete", sessionId }` |
| `profilingFailed` | server->client | Profile generation permanently failed | `{ type: "profilingFailed", sessionId }` |
| `groupMember` | server->client | Member joined/left/removed/roleChanged | `{ type: "groupMember", conversationId, userId, action, role?, displayName? }` |
| `groupUpdated` | server->client | Group metadata changed | `{ type: "groupUpdated", conversationId, updates: { name?, description?, avatarUrl? } }` |
| `topicEvent` | server->client | Topic lifecycle | `{ type: "topicEvent", conversationId, topic: { id, name, emoji }, action: "created"\|"updated"\|"deleted"\|"closed" }` |
| `groupInvited` | server->client | User invited to group | `{ type: "groupInvited", conversationId, groupName }` |
| `conversationDeleted` | server->client | Conversation removed | `{ type: "conversationDeleted", conversationId }` |
| `forceDisconnect` | server->client | Account deleted | `{ type: "forceDisconnect" }` (then server closes WS with code 1000) |

## Server Setup

**What:** Bun's built-in WebSocket support, configured in `apps/api/src/index.ts`. The WS handler is not a separate server — it's integrated into the same Bun process that serves HTTP (Hono).

**Upgrade path:** `/ws` — the `fetch` handler checks `url.pathname === "/ws"` and calls `server.upgrade(req)` with initial data `{ userId: null, subscriptions: new Set() }`. Non-WS requests fall through to Hono.

**Config:**
- No explicit `maxPayload` (Bun default: 16 MB)
- No heartbeat/ping-pong (Bun handles this at the transport level)
- No compression (not configured)

**Client tracking:** All connected WebSocket instances are stored in a module-level `Set<ServerWebSocket<WSData>>` called `clients`. This set is the source of truth for who is online.

**Why Bun native WS (not a library like `ws`):** Zero dependency, lower latency, built-in backpressure handling. Bun's WS is significantly faster than userland implementations.

## Connection Lifecycle

```
Client                                Server
  |--- WS upgrade /ws ----------------->|  server.upgrade(), data = { userId: null, subscriptions: new Set() }
  |<--- connection opened --------------|  clients.add(ws), wsConnected()
  |                                     |
  |--- { type: "auth", token } -------->|  authenticateToken(token) via prepared statement
  |                                     |  if valid: ws.data.userId = userId
  |                                     |  getUserConversations(userId) -> convIds
  |                                     |  ws.data.subscriptions = new Set(convIds)
  |<--- { type: "auth", status: "ok",   |
  |       conversationIds: [...] } -----|
  |                                     |
  |--- { type: "typing", ... } -------->|  rate limit check -> ee.emit(`typing:{convId}`)
  |--- { type: "subscribe", convId } -->|  verify membership -> ws.data.subscriptions.add(convId)
  |                                     |
  |<--- server-pushed events -----------|  (newMessage, reaction, analysisReady, etc.)
  |                                     |
  |--- close -------------------------->|  clients.delete(ws), wsDisconnected()
```

## Auth Flow

**What:** First message after WS upgrade must be `{ type: "auth", token: "..." }`. Token is validated against the `session` table using a prepared statement (`sessionByToken`).

**Why prepared statement:** Auth happens on every WS connection. Prepared statements avoid re-parsing the SQL on every call.

**On success:** Server fetches all conversation IDs where the user is a participant and auto-subscribes the client. The response includes the list of `conversationIds` so the client knows what it's subscribed to.

**On failure:** Server responds with `{ type: "auth", status: "error" }` but does not close the connection (client may retry).

## Subscription Model

**Conversation channels:** Each client tracks a `Set<string>` of conversation IDs it's subscribed to. Events broadcast to a conversation are delivered to all clients whose subscription set contains that conversation ID.

**User channel:** Events targeting a specific user (waves, analysis results, profile events, nearby changes) are delivered to all WS connections where `ws.data.userId` matches.

**Dynamic subscription:** When a new conversation is created (wave accepted, group invite), the client sends `{ type: "subscribe", conversationId }`. Server verifies membership in `conversationParticipants` before adding to the set.

**Unsubscription:** On `groupMember` events with action `left` or `removed`, the server proactively removes the conversation from the user's subscription set. On `conversationDeleted`, the typing listener for that conversation is also cleaned up.

## Redis Pub/Sub Bridge

Source: `apps/api/src/ws/redis-bridge.ts`

**Why needed:** Railway runs multiple API replicas. Each replica has its own set of WS connections and its own in-memory `clients` set. An event emitted on replica A (e.g., a new message) must reach clients connected to replica B.

**Channels:**
- `ws-events` — all WS events. Single channel, events contain their own routing info (event name + data).
- `analysis:ready` — dedicated channel for connection analysis completion. Also consumed by the chatbot service (separate subscriber).

**`publishEvent(event, data)` flow:**
1. If Redis bridge is active: serialize `{ event, data }` and publish to `ws-events` channel
2. All replicas subscribed to `ws-events` receive the message, parse it, and `ee.emit(event, data)` on their local EventEmitter
3. Local EventEmitter handlers (`handler.ts`) route to the appropriate `broadcastToConversation()` or `broadcastToUser()`

**Fallback without Redis:** If `REDIS_URL` is not set (local dev), `publishEvent()` calls `ee.emit()` directly. Everything works on a single replica — no cross-replica delivery needed.

**Why single `ws-events` channel (not per-conversation):** Redis channels are cheap, but managing subscribe/unsubscribe for thousands of conversation-specific channels adds complexity. A single channel with client-side routing is simpler and sufficient at current scale.

## Rate Limiting (In-Memory)

**What:** Two sliding-window rate limits applied to inbound WS messages. Both use in-memory counters (not Redis) — fast, per-replica.

| Limit | Threshold | Window | Applied to |
|---|---|---|---|
| Global | 30 messages | 60 seconds | All message types (except `auth`) |
| Typing | 10 messages | 10 seconds | `typing` events only |

**Enforcement:** Silent drop — no error sent to client. This prevents chatty clients from overwhelming the server without giving attackers feedback about limits.

**Cleanup:** Expired rate limit entries are cleaned up every 5 minutes via `setInterval`. The map key format is `{type}:{userId}`, and entries store `{ count, resetAt }`.

**Why in-memory (not Redis):** Rate limiting WS messages needs sub-millisecond latency. A Redis round-trip per message would be too slow. Per-replica limits are acceptable — a user connected to one replica is rate-limited on that replica.

## Typing Listeners

**What:** Dynamic event listeners for typing indicators per conversation. Created lazily via `ensureTypingListener(conversationId)`, stored in a `Map<string, handler>`.

**Trigger:** Called from `messages.send` mutation — the first message in a conversation sets up the typing listener for that conversation.

**Why lazy:** Not all conversations have active typing. Creating listeners for all conversations at startup would waste memory and EventEmitter slots.

**Cleanup:** `removeTypingListener(conversationId)` called on `conversationDeleted` event. Removes the handler from the EventEmitter and deletes from the map.

**Flow:** Client sends `{ type: "typing", conversationId, isTyping }` -> rate limit check -> `ee.emit("typing:{conversationId}", event)` -> typing listener handler -> `broadcastToConversation(conversationId, { type: "typing", ... })`.

## Broadcast Functions

**`broadcastToUser(userId, payload)`:** Iterates all clients, sends to every WS where `ws.data.userId === userId`. Supports multiple devices per user (phone + tablet both receive the event). Tracks outbound metrics via `wsOutbound(eventType, sentCount)`.

**`broadcastToConversation(conversationId, payload)`:** Iterates all clients, sends to every WS whose subscription set contains the conversation ID. This includes all participants in the conversation across all their connected devices. Tracks outbound metrics.

Both functions:
- Serialize payload via `JSON.stringify` once, then send the same string to all recipients
- Silently catch send errors per client (client may have disconnected between iteration and send)
- Only call `wsOutbound()` if at least one message was sent (avoids noise in metrics)

**Performance note:** Both functions iterate the entire `clients` Set on every broadcast. This is O(n) where n is total connected clients. At current scale (hundreds of connections) this is negligible. If the app scales to tens of thousands of concurrent connections, consider indexing by userId and conversationId.

## Event Routing Summary

Events are routed through two paths depending on their target:

**User-targeted events** (via `broadcastToUser`):
- `newWave` — to the wave recipient
- `waveResponded` — to the wave sender
- `analysisReady` — to the user the analysis is about
- `analysisFailed` — to both users in the pair when analysis exhausts retries (mobile retries immediately)
- `nearbyChanged` — to the user whose nearby list changed
- `profileReady` — to the user whose profile was generated
- `profileFailed` — to the user when profile AI generation exhausts retries (mobile retries via `retryProfileAI`)
- `statusMatchesReady` — to the user whose matches were computed
- `statusMatchingFailed` — to the user when status matching exhausts retries (mobile retries via `retryStatusMatching`)
- `questionReady` — to the user in the profiling session
- `questionFailed` — to the user when profiling question generation exhausts retries (mobile retries via `retryQuestion`)
- `profilingComplete` — to the user whose profiling finished
- `profilingFailed` — to the user when profile generation from Q&A exhausts retries (mobile retries via `retryProfileGeneration`)
- `conversationDeleted` — to the user whose conversation was deleted
- `groupInvited` — to the invited user
- `forceDisconnect` — to the user being disconnected

**Conversation-targeted events** (via `broadcastToConversation`):
- `newMessage` — to all participants in the conversation
- `reaction` — to all participants in the conversation
- `typing` — to all participants in the conversation
- `groupMember` — to all participants in the conversation (including the affected member)
- `groupUpdated` — to all participants in the conversation
- `topicEvent` — to all participants in the conversation

**Dual routing:** `groupMember` with `left`/`removed` action broadcasts to the conversation first, then removes the departing user's subscription. This ensures the user receives the event confirming they left before being unsubscribed.

## Metrics

Source: `apps/api/src/services/ws-metrics.ts`, `apps/api/src/services/prometheus.ts`.

**Prometheus metrics:**
- `ws_connections_active` (gauge) — current live WS connections
- `ws_subscriptions_active` (gauge) — current conversation subscriptions across all connections
- `ws_auth_total` (counter) — labels: `result` (success/failed)
- `ws_events_inbound_total` (counter) — labels: `type` (auth, typing, subscribe)
- `ws_events_outbound_total` (counter) — labels: `event_type` (newMessage, typing, etc.)
- `ws_rate_limit_hits_total` (counter) — labels: `limit` (global, typing)

**In-memory stats:** `getWsStats()` returns connection/subscription counts, auth success/failure, inbound/outbound by type, rate limit hits by type. Exposed via `/api/metrics/summary`.

## EventEmitter Configuration

The global `EventEmitter` (`ee`) has `maxListeners` set to 100 (default is 10). This accommodates the fixed set of event handlers plus dynamic typing listeners for active conversations.

## Impact Map

If you change this system, also check:
- **New event type:** Add interface in `events.ts`, add `ee.on()` handler in `handler.ts`, use `publishEvent()` from the trigger site (not `ee.emit()` directly — otherwise cross-replica delivery breaks)
- **Conversation creation/deletion:** `subscribe` message handling, `conversationDeleted` handler (typing listener cleanup, subscription removal)
- **Group member removal:** `groupMember` handler removes subscriptions for left/removed users
- **Auth flow:** `sessionByToken` prepared statement, `getUserConversations` query
- **Redis bridge:** Changing `ws-events` channel format requires coordinated deploy across all replicas
- **`analysis:ready` channel:** Chatbot service subscribes to this — format changes break bot
- **Push notifications:** `sendPushToUser` checks `isUserConnected()` (iterates WS clients) — push is skipped if user has an active WS connection
- **Rate limits:** Changing thresholds affects client behavior — ensure mobile typing debounce aligns with server limit
- **`forceDisconnect` event:** Used during account deletion — client should suppress auto-reconnect when receiving this
