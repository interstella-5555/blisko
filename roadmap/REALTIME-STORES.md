# Normalized Zustand Stores — Real-time First Architecture

## Context

The mobile app currently uses React Query (tRPC) as the primary data store. Each screen makes its own `useQuery()` calls, and WebSocket events trigger HTTP `refetch()` instead of directly updating cached data. This causes two problems:

1. **No data sharing between list and detail views** — opening a user profile from the nearby list re-fetches data we already have. Opening a chat from the conversations list ignores the last message we already loaded.
2. **Unnecessary latency on WS events** — every WebSocket event (new wave, new message, etc.) triggers a full HTTP roundtrip to the API instead of updating the UI directly from the event payload.

**Goal:** Normalized Zustand entity stores as the single source of truth. WebSocket events directly mutate stores. React Query used only for initial data hydration and background sync. Navigation between screens feels instant because data is already in memory.

## Architecture Overview

### Store Structure

```
stores/
  profilesStore.ts      — Map<userId, Profile> (partial or full)
  wavesStore.ts          — received/sent waves + waveStatusByUserId lookup
  conversationsStore.ts  — conversation list + unread counts
  messagesStore.ts       — Map<convId, { items, hasMore, oldestCursor }>

  // Keep as-is:
  authStore.ts
  locationStore.ts
  preferencesStore.ts
  onboardingStore.ts

  // Delete after migration:
  chatStore.ts           — replaced by conversationsStore + messagesStore
```

### Data Flow Pattern

Every data source (API response, WebSocket event) feeds into the same stores:

```
API response → extract entities → merge into Zustand store
WS event     → extract entities → merge into Zustand store
Components   → read from Zustand store → instant render
```

**Merge, not replace.** Partial data (from list views) gets merged with full data (from detail views). A `_partial` flag on profiles tracks completeness.

### WebSocket: Direct Store Updates (no refetch)

Current WS events already carry sufficient data for direct updates:

| Event | Payload (already exists) | Store action |
|-------|--------------------------|--------------|
| `newWave` | wave + fromProfile (name, avatar) | `wavesStore.addReceived()` + `profilesStore.merge()` |
| `waveResponded` | waveId, accepted, convId, responderProfile | `wavesStore.updateStatus()` + `conversationsStore.addNew()` |
| `newMessage` | full message object | `messagesStore.prepend()` + `conversationsStore.updateLastMessage()` |
| `reaction` | messageId, emoji, userId, action | `messagesStore.updateReaction()` |

No backend changes needed for these 4 events. `nearbyChanged` and `analysisReady` still need refetch (insufficient payload).

### Chat Prefetch on Visibility

Conversations list prefetches messages for all visible conversations:

```typescript
<FlatList
  onViewableItemsChanged={({ viewableItems }) => {
    viewableItems.forEach(item => messagesStore.prefetchIfNeeded(item.id))
  }}
/>
```

Opening any visible chat → messages already in store → instant render.

### Background Sync (fallback)

After WebSocket reconnection, one-time full fetch of waves + conversations to reconcile any missed events. Periodic sync every 60s as safety net.

---

## Implementation Plan — 3 Steps

Each step is a standalone, shippable commit. The app works correctly after each step.

### Step 1: profilesStore — Instant Profile Navigation

**Problem:** Nearby list has user data, but opening profile refetches everything from scratch.

**Files to create:**
- `apps/mobile/src/stores/profilesStore.ts`

**Files to modify:**
- `apps/mobile/app/(tabs)/index.tsx` — nearby list populates profilesStore after fetch
- `apps/mobile/app/(modals)/user/[userId].tsx` — read from profilesStore first, fetch full profile in background only if `_partial`
- `apps/mobile/src/lib/ws.ts` — `newWave` and `waveResponded` events merge profiles into store

**Store shape:**
```typescript
interface ProfilesStore {
  profiles: Map<string, CachedProfile>
  merge: (userId: string, data: Partial<CachedProfile>) => void
  mergeMany: (entries: Array<{ userId: string } & Partial<CachedProfile>>) => void
  get: (userId: string) => CachedProfile | undefined
}

interface CachedProfile {
  userId: string
  displayName: string
  avatarUrl: string | null
  bio?: string
  lookingFor?: string
  distance?: number
  matchScore?: number
  commonInterests?: string[]
  shortSnippet?: string | null
  interests?: string[] | null
  socialProfile?: string | null
  portrait?: string | null
  _partial: boolean
}
```

**Behavior:**
- Nearby list fetches via tRPC → `profilesStore.mergeMany(users)` with `_partial: true`
- Profile screen: `const cached = profilesStore.get(userId)` → render immediately
- If `_partial`, fetch `getById` in background → `profilesStore.merge(full)` with `_partial: false`
- WS `newWave(fromProfile)` → `profilesStore.merge({ displayName, avatarUrl, _partial: true })`

**What changes for the user:** Opening a profile from nearby list shows name, avatar, bio, match score instantly. Additional fields (interests, social profile) appear after background fetch.

---

### Step 2: conversationsStore + messagesStore — Instant Chat Navigation

**Problem:** Chat list has last message, but opening a chat loads from scratch. New messages via WS trigger HTTP refetch instead of direct update.

**Files to create:**
- `apps/mobile/src/stores/conversationsStore.ts`
- `apps/mobile/src/stores/messagesStore.ts`

**Files to modify:**
- `apps/mobile/app/(tabs)/chats.tsx` — populate conversationsStore + messagesStore from fetch, add prefetch on visibility
- `apps/mobile/app/(modals)/chat/[id].tsx` — read from messagesStore, load more in background, WS newMessage updates store directly
- `apps/mobile/src/lib/ws.ts` — `newMessage` updates messagesStore + conversationsStore directly (no refetch)
- `apps/mobile/src/hooks/useInAppNotifications.ts` — read sender name from profilesStore instead of tRPC cache

**Files to delete:**
- `apps/mobile/src/stores/chatStore.ts` — replaced by new stores. Move `activeConversationId` to conversationsStore.

**conversationsStore shape:**
```typescript
interface ConversationsStore {
  conversations: ConversationEntry[]
  activeConversationId: string | null  // moved from chatStore

  set: (conversations: ConversationEntry[]) => void
  addNew: (conv: ConversationEntry) => void
  updateLastMessage: (convId: string, message: Message) => void
  incrementUnread: (convId: string) => void
  markAsRead: (convId: string) => void
  setActiveConversation: (convId: string | null) => void
}

interface ConversationEntry {
  id: string
  participant: { userId: string; displayName: string; avatarUrl: string | null }
  lastMessage: Message | null
  unreadCount: number
  createdAt: Date
  updatedAt: Date
}
```

**messagesStore shape:**
```typescript
interface MessagesStore {
  chats: Map<string, ChatCache>

  set: (convId: string, messages: Message[], hasMore: boolean, cursor?: string) => void
  prepend: (convId: string, message: Message) => void  // new message at top
  appendOlder: (convId: string, messages: Message[], hasMore: boolean, cursor?: string) => void
  updateReaction: (convId: string, messageId: string, emoji: string, userId: string, action: 'added' | 'removed') => void
  deleteMessage: (convId: string, messageId: string) => void
  prefetchIfNeeded: (convId: string) => void  // triggers tRPC fetch if not cached
}

interface ChatCache {
  items: Message[]
  hasMore: boolean
  oldestCursor: string | null
}
```

**Behavior:**
- Chats tab fetches conversations → `conversationsStore.set(data)` + `profilesStore.mergeMany(participants)`
- FlatList `onViewableItemsChanged` → `messagesStore.prefetchIfNeeded(convId)` for visible items
- Open chat → `messagesStore.get(convId)` → render cached messages immediately → load more in background if `hasMore`
- WS `newMessage` → `messagesStore.prepend(convId, msg)` + `conversationsStore.updateLastMessage(convId, msg)` + conditional `incrementUnread`
- WS `reaction` → `messagesStore.updateReaction(convId, msgId, emoji, userId, action)`
- WS `waveResponded(accepted)` → `conversationsStore.addNew(conv)` + `profilesStore.merge(responderProfile)`

**What changes for the user:** Opening a chat from the list shows messages instantly (prefetched in background). New messages appear without any HTTP delay. Chat list last message updates in real-time.

---

### Step 3: wavesStore — Instant Wave Status

**Problem:** Wave status (sent/received/connected) is computed per-screen from separate queries. Opening a profile triggers fresh waves queries.

**Files to create:**
- `apps/mobile/src/stores/wavesStore.ts`

**Files to modify:**
- `apps/mobile/app/(tabs)/waves.tsx` — read from wavesStore, populate on initial fetch
- `apps/mobile/app/(tabs)/index.tsx` — read wave status from `wavesStore.waveStatusByUserId` instead of separate queries
- `apps/mobile/app/(modals)/user/[userId].tsx` — read wave status from store instead of `waves.getSent` + `waves.getReceived` queries
- `apps/mobile/src/lib/ws.ts` — `newWave`/`waveResponded` update wavesStore directly (no refetch)

**Store shape:**
```typescript
interface WavesStore {
  received: Wave[]
  sent: Wave[]

  // Derived (computed on set/update):
  waveStatusByUserId: Map<string, WaveStatus>

  setReceived: (waves: Wave[]) => void
  setSent: (waves: Wave[]) => void
  addReceived: (wave: Wave) => void
  updateStatus: (waveId: string, accepted: boolean) => void
  getStatusForUser: (userId: string) => WaveStatus | undefined
}

type WaveStatus =
  | { type: 'sent'; waveId: string }
  | { type: 'received'; waveId: string }
  | { type: 'connected'; conversationId: string }
```

**Behavior:**
- App init → fetch waves → `wavesStore.setReceived(data)` + `wavesStore.setSent(data)`
- `waveStatusByUserId` is derived automatically on every set/update
- Nearby list reads `wavesStore.getStatusForUser(userId)` → instant, no query
- Profile screen reads wave status from store → no separate wave queries
- WS `newWave` → `wavesStore.addReceived(wave)` → status map updates → all screens reflect instantly
- WS `waveResponded(accepted)` → `wavesStore.updateStatus(waveId, accepted)` → status map updates

**What changes for the user:** Wave status is always in sync everywhere. Sending a wave on profile → nearby list badge updates instantly. Receiving a wave → all screens reflect it immediately via WS.

---

### After All Steps: Background Sync + Cleanup

- Add reconciliation fetch after WS reconnection (one-time full fetch of waves + conversations)
- Add 60s periodic sync as safety net
- Verify old `chatStore.ts` is fully removed
- Remove any remaining `refetch()` calls in WS handlers

---

## Key Files Reference

| File | Role |
|------|------|
| `apps/mobile/src/stores/chatStore.ts` | **DELETE** — replaced by conversationsStore + messagesStore |
| `apps/mobile/src/lib/ws.ts` | WebSocket handlers — modify in every step |
| `apps/mobile/src/lib/trpc.ts` | tRPC client — keep for initial fetches |
| `apps/mobile/app/(tabs)/index.tsx` | Nearby screen — steps 1 + 3 |
| `apps/mobile/app/(tabs)/chats.tsx` | Chat list — step 2 |
| `apps/mobile/app/(tabs)/waves.tsx` | Waves list — step 3 |
| `apps/mobile/app/(modals)/chat/[id].tsx` | Chat thread — step 2 |
| `apps/mobile/app/(modals)/user/[userId].tsx` | User profile — steps 1 + 3 |
| `apps/mobile/src/hooks/useInAppNotifications.ts` | Notification handler — step 2 |
| `apps/api/src/ws/events.ts` | WS event types — no changes needed |

## Verification

After each step:
1. Run the app on simulator: `cd apps/mobile && npx expo start`
2. **Step 1:** Open nearby list → tap user profile → should show name/avatar/bio instantly without loader
3. **Step 2:** Open chats tab → tap a conversation → should show messages instantly. Send a message from another device/chatbot → should appear without delay
4. **Step 3:** Open nearby list → wave at someone → wave badge should appear immediately. Accept a wave on waves tab → nearby list should update immediately
5. **Cross-screen consistency:** After any action, navigate between tabs and verify all screens show consistent data
