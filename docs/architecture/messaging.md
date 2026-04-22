# Messaging & Chat

> v1 — AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-10 — added Message Delete (Client Optimistic Flow) section documenting the `updateMessage` store method and the context-menu positioning constant that keeps "Usuń" visible above the chat input bar.
> Updated 2026-04-14 — seq-based pagination, syncGaps endpoint, lifecycle-safe mutations, single source of truth architecture (BLI-224).
> Updated 2026-04-22 — BLI-156 added `RECIPIENT_SUSPENDED` failure on `messages.send` when any peer is suspended. `messages.getConversations` exposes `participant.isSuspended` so the mobile composer can disable + render "Konto zawieszone". See `moderation-suspension.md`.

Source: `apps/api/src/trpc/procedures/messages.ts`, `apps/api/src/ws/handler.ts`, `apps/api/src/ws/events.ts`, `apps/api/src/db/schema.ts`, `packages/shared/src/validators.ts`, `apps/mobile/app/chat/[id].tsx`, `apps/mobile/src/stores/messagesStore.ts`, `apps/mobile/src/components/chat/MessageContextMenu.tsx`.

## Terminology & Product Alignment

| PRODUCT.md term | Code term | UI (Polish) |
|-----------------|-----------|-------------|
| Chat | `conversations` table | "Wiadomości" tab |
| Ping akceptowany → chat | DM conversation created on wave accept | Chat screen |
| Czat grupowy | Conversation with `type = 'group'` | Group chat screen |
| Usunięcie chatu (obustronne) | `deleteConversation` soft-delete | "Usuń rozmowę" |
| Ocena (1-5) | `conversationRatings` table | Star rating modal on delete |
| Karta pierwszego kontaktu | `conversations.metadata` (connectedAt, connectedDistance, status snapshots) | First-contact card in chat |

PRODUCT.md describes a "Karta pierwszego kontaktu" with date, district, distance, and mutual-ping special line. The backend stores `connectedAt`, `connectedDistance`, `senderStatus`, `recipientStatus`, and `isMutualPing` in `conversations.metadata` jsonb — the mobile client renders the card from this data.

---

## Message Model

**What:** Messages live in a single `messages` table shared by DMs and groups.

**Config — messages table:**

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `id` | uuid PK | random | Message identifier |
| `conversationId` | uuid FK → conversations | required | Parent conversation |
| `senderId` | text FK → user | required | Who sent it |
| `topicId` | uuid FK → topics | null | Group topic assignment (null for DMs) |
| `content` | text | required | Message body (max 2000 via validator) |
| `type` | varchar(20) | `'text'` | `text`, `image`, or `location` |
| `metadata` | jsonb | null | Arbitrary key-value (image URLs, coordinates, etc.) |
| `replyToId` | uuid self-ref | null | Reply threading |
| `seq` | bigint | auto | Per-conversation monotonic sequence number |
| `createdAt` | timestamp | now | Send time |
| `readAt` | timestamp | null | DM-only per-message read marker |
| `deletedAt` | timestamp | null | Soft-delete marker |

Indexes: `messages_conv_created_idx` (conversationId, createdAt), `messages_conv_seq_uniq` (conversationId, seq) UNIQUE, `messages_sender_idx`, `messages_topic_idx`.

---

## Sequence Numbers

**What:** Monotonic integer per conversation, assigned atomically on INSERT.

**Why:** Deterministic pagination (integers vs timestamp comparison), gap detection after WS disconnect, dedup.

**Assignment:** `COALESCE((SELECT MAX(seq) FROM messages WHERE conversation_id = $1), 0) + 1` inside the INSERT statement. No separate SELECT. Unique index prevents duplicates on concurrent inserts.

**Usage:**
- Pagination cursor: `WHERE seq < cursor ORDER BY seq DESC` (older) / `WHERE seq > afterSeq ORDER BY seq ASC` (newer)
- Gap detection: client tracks `newestSeq` per conversation, detects gaps on `prepend` if `msg.seq > newestSeq + 1`
- Batch gap fill: `syncGaps` endpoint accepts `{convId: newestSeq}` map, returns missed messages

---

## DM vs Group Chat — Key Differences

| Behavior | DM | Group |
|----------|-----|-------|
| Created by | Wave acceptance or mutual ping | `groups.create` |
| Read tracking | Per-message `readAt` timestamp on each message row | Per-participant `lastReadAt` cursor on `conversation_participants` |
| Unread count | Count messages where `readAt IS NULL` and sender != me | Count messages where `createdAt > lastReadAt` and sender != me |
| Push behavior | Every message: audible push, no suppression | `collapseId` suppression: 1 audible push per unread batch, silent updates after |
| Delete conversation | Bilateral soft-delete allowed (both sides lose it) | Blocked — returns FORBIDDEN. Members leave, they don't delete. |
| Message delete permission | Own messages only | Own messages, or admin/owner can delete any message |
| Topics | Not applicable | Messages can be tagged with `topicId` |
| Sender enrichment | Not included (client knows the other person) | Batch-fetched: `senderName`, `senderAvatarUrl` per message |

---

## Send Message

**What:** Inserts a message, updates conversation and topic timestamps, sends push notifications, and broadcasts a WS event.

**Why participant verification:** Every send checks `conversation_participants` to confirm the sender belongs to this conversation. Without this, any authenticated user could inject messages into any conversation by guessing a UUID.

**Config:**
- Rate limits: `messages.send` (30 per 60s per conversation) + `messages.sendGlobal` (500 per hour)
- Validator: content 1-2000 chars, type enum, optional metadata/replyToId/topicId/idempotencyKey

**Flow:**
1. Verify sender is participant
2. Reject with `BAD_REQUEST / RECIPIENT_SUSPENDED` if any non-self participant has `user.suspendedAt IS NOT NULL` (BLI-156). Soft-deleted peers are implicitly handled because `isAuthed` has already kept them out; the suspension gate specifically covers the case where a peer is blocked from logging in but the conversation is still active for everyone else.
3. Check idempotency key (if provided)
4. Transaction: insert message with seq assignment via `COALESCE(MAX(seq)+1, 1)`, update `conversations.updatedAt`, update topic `lastMessageAt` + `messageCount` if topicId set
5. Cache result in Redis for idempotency (if key provided)
6. Fetch sender profile, participants, and conversation type in parallel
7. Send push notifications (differs by DM vs group)
8. Publish `newMessage` WS event

#### Topic assignment
When a message includes `topicId`, the transaction atomically increments the topic's `messageCount` and updates `lastMessageAt`. This keeps topic stats consistent without a separate counter job.

---

## Idempotency

**What:** Optional `idempotencyKey` (UUID) prevents duplicate messages on network retry.

**Why:** Mobile clients on flaky connections may retry a send before receiving the response. Without idempotency, each retry creates a new message.

**Config:**
- Redis key: `idem:msg:{userId}:{idempotencyKey}`
- TTL: 300 seconds (5 minutes)
- Fail-open: if Redis is down, message is sent without idempotency protection (no user-visible error)
- Dedicated `RedisClient` instance (Bun native, not shared with other subsystems)

---

## Reactions

**What:** Toggle-based emoji reactions on messages. Same emoji from same user = remove. Different emoji = add another.

**Why toggle pattern:** Simpler than explicit add/remove endpoints. Client sends the same `react` call regardless of intent.

**Config — message_reactions table:**

| Column | Type | Purpose |
|--------|------|---------|
| `messageId` | uuid FK → messages (cascade delete) | Parent message |
| `userId` | text FK → user | Reactor |
| `emoji` | varchar(8) | Emoji string (supports multi-codepoint emoji) |

Index: `reactions_user_emoji_idx` on (messageId, userId, emoji) — used for uniqueness lookups.

**WS event:** `reaction` broadcast to conversation with `action: "added" | "removed"`.

**Enrichment in getMessages:** Reactions are batch-fetched for all messages in the page, grouped by emoji, and include `myReaction: boolean` per group so the client can highlight the user's own reactions.

---

## Reply Threading

**What:** Messages can reference another message via `replyToId` (self-referencing FK on messages table).

**Config:** `replyToId` is a uuid column, no cascade delete (parent deletion leaves orphan replies with stale replyToId).

**Enrichment:** When fetching messages, reply-to messages are batch-loaded. Each reply includes `replyTo: { id, content, senderName }`. Sender names are fetched from profiles and merged with the existing sender profile map to avoid duplicate queries.

---

## Message Search

**What:** Per-conversation full-text search using PostgreSQL ILIKE.

**Why escaped wildcards:** The user's query is interpolated into `%{query}%`. Without escaping `%`, `_`, and `\`, a user could craft a query like `%` to match all messages or `_` to match single characters — functionally a SQL injection into the LIKE pattern.

**Config:**
- Escape: `input.query.replace(/[%_\\]/g, '\\$&')`
- Max query length: 200 chars (validator)
- Max results: 50 (validator default 20)
- Sorted by `createdAt DESC`
- Only non-deleted messages (`deletedAt IS NULL`)

---

## syncGaps (Batch Gap Fill)

**What:** Single round-trip endpoint for fetching missed messages across all cached conversations after WS reconnect.

**Input:** `Record<conversationId, newestSeq>` — map of conversation IDs to the client's latest known seq.

**Output:** `Record<conversationId, Message[]>` — messages newer than the provided seq, per conversation.

**Config:**
- Max 50 conversations per request
- 100 messages per conversation limit
- Verifies participant access per conversation
- Returns raw message rows (no reaction/reply enrichment)

---

## Read Tracking

#### DM: per-message `readAt`
`markAsRead` sets `readAt = now()` on all unread messages from the other participant. Unread count = messages where `readAt IS NULL AND senderId != me`.

#### Group: per-participant `lastReadAt` cursor
`markAsRead` updates `conversation_participants.lastReadAt = now()`. Unread count = messages where `createdAt > COALESCE(lastReadAt, '1970-01-01') AND senderId != me`.

**Why two systems:** DMs need per-message precision for read receipts (the other person sees which messages you've read). Groups would require N rows per message (one per participant) which doesn't scale — a cursor is O(1) per participant.

**Unread count query:** The `getConversations` endpoint computes unread counts in a single batch query using a `CASE WHEN` that branches on conversation type:
- Group: `messages.createdAt > COALESCE(lastReadAt, '1970-01-01'::timestamp)`
- DM: `messages.readAt IS NULL`

---

## Bilateral Delete (DM Only)

**What:** `deleteConversation` soft-deletes the conversation. Both participants lose access.

**Why DM-only:** Group conversations have many participants. Bilateral delete would destroy shared history for everyone. Group members who want to leave use `groups.leave` instead.

**Why soft-delete (not hard delete):** Preserves data for GDPR export requests during the retention window and allows potential recovery.

**Config:**
- Optional `rating` (integer 1-5) stored in `conversation_ratings` table
- Sets `conversations.deletedAt = now()`
- Emits `conversationDeleted` WS event to the other participant(s)
- Typing listener for the conversation is cleaned up (prevents memory leak from orphaned EventEmitter listeners)

---

## Message Delete (Client Optimistic Flow)

**What:** Individual message delete (`messages.deleteMessage`) sets `messages.deletedAt` server-side. Client renders a "Wiadomość usunięta" placeholder bubble for rows where `deletedAt` is set — the row stays in the list, content is hidden.

**Why placeholder instead of removal:** Preserves conversation chronology and reply-threading references. Other participants see the same placeholder via the regular message fetch (no WS event is emitted for deletes; the next fetch/reconnect pulls the `deletedAt`).

**Optimistic update path (mobile):** `chat/[id].tsx → deleteMessage.onMutate` patches the cached row via `messagesStore.updateMessage(convId, messageId, { deletedAt, content: "" })`. On error, it reverts via another `updateMessage` call that clears `deletedAt` and restores `content` from the captured original.

**Important:** `replaceOptimistic` must NOT be used for delete. It was designed for the send-race (drop temp if real message already present) and will drop the target row from the list instead of marking it deleted.

**Permission:** `isMine` check (`senderId === ctx.userId`) in the tRPC procedure and in the client context menu — only own messages can be deleted in DMs; admins/owners can delete any message in groups.

**Context menu positioning:** The long-press context menu (`MessageContextMenu.tsx`) reserves `CHAT_INPUT_RESERVED = 72px` from the bottom in addition to the safe-area inset. Without this, long-pressing the last visible message renders the action menu under the chat input bar, clipping "Usuń".

---

## Push Notification Behavior

#### DM push: every message buzzes
No suppression. Every message from the other person triggers an audible push notification. Title = sender's display name. Body = message preview (truncated at 97 chars + "...").

#### Group push: collapseId suppression
**What:** Groups use `collapseId` to batch unread notifications. First unread message gets an audible push. Subsequent messages while unreads exist get a silent update that replaces the previous notification.

**Why:** A busy group chat would otherwise buzz the user's phone dozens of times. One audible notification per "unread batch" (until the user reads) strikes the right balance.

**Config:**
- `collapseId: "group:{conversationId}"` — set when recipient has existing unreads
- Unread detection: batch query counts unread messages per recipient using `lastReadAt` cursor
- If unread count > 1 (current message already inserted): collapsed push with body `"{count} nowych wiadomości"`
- If unread count <= 1: normal audible push with body `"{senderName}: {messagePreview}"`
- Title for groups = group name (or sender display name fallback)

---

## Typing Indicators

**What:** Real-time typing status broadcast via WebSocket.

**Why lazy listener init:** Typing listeners are created per-conversation on first interaction (first `getMessages` call or first typing event). This avoids pre-allocating listeners for conversations that may never be opened.

**Config:**
- WS message format: `{ type: "typing", conversationId: "...", isTyping: true/false }`
- Rate limit: 10 typing messages per 10 seconds per user (silent drop, no error)
- Global WS rate limit: 30 messages per 60 seconds per user
- Server-side: `ensureTypingListener(conversationId)` creates an EventEmitter listener that broadcasts to all conversation subscribers
- Cleanup: `removeTypingListener` called on conversation delete to prevent memory leaks

Typing events flow two ways:
1. **Via WS message** — client sends `{ type: "typing", ... }` directly on the WebSocket
2. **Via tRPC mutation** — `messages.setTyping` which calls `ensureTypingListener` + publishes the event

---

## Mute Conversation

**What:** Per-participant push suppression via `conversationParticipants.mutedUntil`.

**Endpoints:** `messages.muteConversation({ conversationId, duration })` and `messages.unmuteConversation({ conversationId })`. Mutations only — reading the muted state happens via `getConversations` which returns `mutedUntil` per conversation.

**Durations:**
- `"1h"` → `Date.now() + 3_600_000`
- `"8h"` → `Date.now() + 28_800_000`
- `"forever"` → `new Date("9999-12-31")` (sentinel far-future date — keeps the column non-null when muted indefinitely so the comparison stays trivial)

`unmuteConversation` sets `mutedUntil = null`.

**Enforcement:** When `sendPushToUser` resolves recipients for a conversation push (DM or group), it checks `participant.mutedUntil` — if not null and > now, the recipient is skipped. The message still arrives via WebSocket (the mute only suppresses the push notification), so the recipient sees it on their next app open or WS refresh.

**No WS event on mute change.** The mutation is local to the acting user, and the next `getConversations` refresh reflects the new state. No other participants need to know.

---

## Conversation List (`getConversations`)

**What:** Returns all conversations for the current user with last message, unread count, and participant info.

**Why batch architecture:** Instead of N+1 queries per conversation, the endpoint runs 4 parallel queries (conversations, participants, last messages, unread counts) then joins in-memory. Additional batch queries fetch DM participant profiles and group last-message sender names.

**Config:**
- Last message: raw SQL with `DISTINCT ON (conversation_id)` — PostgreSQL-specific, no Drizzle equivalent
- Soft-deleted conversations filtered out (`deletedAt IS NULL`)
- Soft-deleted DM partners filtered out (profile not in profileMap = conversation skipped)
- Sorted by last message date descending (most recent conversation first)

---

## WebSocket Events

| Event | Payload | Broadcast |
|-------|---------|-----------|
| `newMessage` | Full message object (includes `seq`) + senderName + senderAvatarUrl | All conversation subscribers |
| `typing` | conversationId, userId, isTyping | All conversation subscribers |
| `reaction` | messageId, emoji, userId, action (added/removed) | All conversation subscribers |
| `conversationDeleted` | conversationId | Specific user (other participant) |

---

## Impact Map

If you change this system, also check:
- **`apps/api/src/trpc/procedures/groups.ts`** — group creation creates conversations; group info includes topic list
- **`apps/api/src/trpc/procedures/topics.ts`** — topic CRUD; messages reference topics via `topicId`
- **`apps/api/src/trpc/procedures/waves.ts`** — wave accept/mutual ping creates DM conversations with metadata
- **`apps/api/src/ws/handler.ts`** — WS subscription management, typing listener lifecycle, rate limiting
- **`apps/api/src/ws/events.ts`** — event type definitions (NewMessageEvent, TypingEvent, ReactionEvent, etc.)
- **`apps/api/src/services/push.ts`** — push notification delivery, collapseId handling
- **`apps/api/src/config/rateLimits.ts`** — `messages.send` (30/60s), `messages.sendGlobal` (500/h)
- **`apps/api/src/db/schema.ts`** — messages, messageReactions, conversations, conversationParticipants, conversationRatings, topics tables
- **`packages/shared/src/validators.ts`** — sendMessageSchema, deleteMessageSchema, reactToMessageSchema, searchMessagesSchema
- **`apps/api/src/services/data-export.ts`** — GDPR export includes messages
- **`apps/api/src/services/moderation.ts`** — `moderateContent` called on text messages before insert (images/locations skipped)
- **`apps/mobile/src/stores/messagesStore.ts`** — single source of truth for messages (React Query cache removed); lifecycle-safe mutations (`send()`, `react()`, `deleteMessage()`, `markAsRead()`) live in store, not components; `ChatCache` tracks `seq` and `status` ('partial'|'hydrated'); gap detection on `prepend()` + batch `syncGaps` on WS reconnect; skips own WS echo for `newMessage`
- **`apps/mobile/src/lib/trpc.ts`** — exports `vanillaClient` for imperative tRPC calls from stores (outside React tree)
- **`apps/mobile/src/components/chat/MessageContextMenu.tsx`** — long-press context menu; reserves `CHAT_INPUT_RESERVED` space at bottom so "Usuń" doesn't clip
- **`apps/mobile/src/components/chat/ChatInput.tsx`** — double-tap send guard prevents duplicate messages
- **`apps/mobile/app/chat/[id].tsx`** — chat screen; reads from messagesStore (not React Query); eager preload of top 15 conversations on tab mount
- **`apps/mobile/app/(tabs)/_layout.tsx`** — eager preload of top 15 conversations replaces on-scroll `usePrefetchMessages`
