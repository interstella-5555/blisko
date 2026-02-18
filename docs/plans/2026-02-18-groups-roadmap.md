# Groups Feature — Roadmap & Analysis

> Updated 2026-02-18 after completing Sprints 1–3. Includes implementation audit, gap analysis, use-case evaluation, and remaining work.

---

## Implementation Status

### Sprint 1: Database + API Foundation — DONE

| Component | Status | Files |
|-----------|--------|-------|
| Schema (conversations, participants, topics, messages) | Done | `apps/api/src/db/schema.ts` |
| Migration | Done | `apps/api/drizzle/0001_add-groups-and-topics.sql` |
| Shared validators (8 schemas + extended sendMessage) | Done | `packages/shared/src/validators.ts` |
| Groups router (11 procedures) | Done | `apps/api/src/trpc/procedures/groups.ts` (637 lines) |
| Topics router (4 procedures) | Done | `apps/api/src/trpc/procedures/topics.ts` (173 lines) |
| Messages router extensions (group branching) | Done | `apps/api/src/trpc/procedures/messages.ts` |
| Router registration | Done | `apps/api/src/trpc/router.ts` |
| WS events (4 new types + extended newMessage) | Done | `apps/api/src/ws/events.ts`, `handler.ts` |

### Sprint 2: Mobile — Groups in Chat List — DONE

| Component | Status | Files |
|-----------|--------|-------|
| ConversationEntry store (type, groupName, avatarUrl, memberCount) | Done | `apps/mobile/src/stores/conversationsStore.ts` |
| WS types (groupMember, groupUpdated, topicEvent, groupInvited) | Done | `apps/mobile/src/lib/ws.ts` |
| WS handlers in global layout | Done | `apps/mobile/app/(tabs)/_layout.tsx` (lines 128-145) |
| Hydration mapping for group fields | Done | `apps/mobile/app/(tabs)/_layout.tsx` |
| Filter chips (Wszystko / Wiadomości / Grupy) | Done | `apps/mobile/app/(tabs)/chats.tsx` |
| Create group FAB button | Done | `apps/mobile/app/(tabs)/chats.tsx` |
| ConversationRow group variant (sender prefix, group avatar) | Done | `apps/mobile/src/components/chat/ConversationRow.tsx` |
| Fixed user/[userId].tsx for new required fields | Done | `apps/mobile/app/(modals)/user/[userId].tsx` |

### Sprint 3: Mobile — Group Chat Screen — DONE

| Component | Status | Files |
|-----------|--------|-------|
| Group detection + header (avatar, name, member count subtitle) | Done | `apps/mobile/app/(modals)/chat/[id].tsx` |
| Topic support (topicId from search params, passed to queries) | Done | `apps/mobile/app/(modals)/chat/[id].tsx` |
| Sender name labels (colored, deterministic 8-color palette) | Done | `apps/mobile/app/(modals)/chat/[id].tsx` |
| Sender avatars for group messages | Done | `apps/mobile/app/(modals)/chat/[id].tsx` |
| No read receipts for groups | Done | `apps/mobile/app/(modals)/chat/[id].tsx` |
| Typing indicator with sender names | Done | `apps/mobile/app/(modals)/chat/[id].tsx` |
| EnrichedMessage extended (senderName, senderAvatarUrl, topicId) | Done | `apps/mobile/src/stores/messagesStore.ts` |

### Sprint 4: Group Management Screens — IN PROGRESS

- `apps/mobile/app/(modals)/group/[id].tsx` — group info
- `apps/mobile/app/(modals)/create-group.tsx` — create group form

### Sprint 5: Polish — NOT STARTED

---

## Technical Assessment

### What works well

1. **Type discriminator approach** — clean reuse. `conversations.type = 'dm' | 'group'` lets us share the entire messages pipeline, WS subscriptions, stores, pagination, optimistic sends, and reactions without duplication.

2. **Read tracking split** — DMs keep per-message `readAt` (for check/double-check). Groups use `lastReadAt` on `conversationParticipants`. Correct tradeoff for scalability (200 read receipts per message is impractical).

3. **Sender enrichment** — batch Map lookup in `getMessages` (one query, not N+1). WS events include sender profile so clients don't need separate lookups for incoming messages.

4. **Role-based auth** — `requireGroupParticipant(convId, userId, minRole?)` helper in groups router. Clean middleware-like pattern. Owner > Admin > Member hierarchy.

5. **Topic architecture** — separate table with denormalized `lastMessageAt` and `messageCount`. Messages carry `topicId` FK. Clean filtering via WHERE clause.

### Technical gaps / risks

1. **No migration tested** — the Drizzle migration SQL is generated but hasn't been applied. Need to run `drizzle-kit migrate` and verify column defaults don't break existing DM conversations.

2. **No API tests** — groups/topics routers have no test coverage. 15 procedures with auth checks, role validation, and WS emissions untested.

3. **Haversine query performance** — `getDiscoverable` does full-table scan with JS-level distance calc. Fine for small datasets but won't scale. Consider PostGIS extension or bounding-box pre-filter if discovery becomes popular.

4. **Topic messageCount denormalization** — incremented in `send` but no decrement on `deleteMessage`. Will drift over time if messages get deleted from topics.

5. **Member count not denormalized** — every `getConversations` does a COUNT query per group. Denormalize in Sprint 5.

6. **No group avatar upload** — `avatarUrl` is a text field but there's no upload endpoint.

7. **Invite code collision** — `generateInviteCode()` creates a random 12-char string but doesn't retry on unique constraint violation.

---

## Remaining Work

### Sprint 4A: Minimum Viable Group UI (HIGH priority)

**Goal:** Users can create and manage groups from the mobile app.

#### 4A.1 Create group screen — `apps/mobile/app/(modals)/create-group.tsx`

Single-screen form:
1. Group name input (required, max 100 chars)
2. Description textarea (optional, max 500 chars)
3. "Widoczna w okolicy" toggle
4. "Dodaj czlonkow" — multi-select from DM contacts
5. "Utworz grupe" submit button

On success: navigate to `/(modals)/chat/${newGroupId}`.

#### 4A.2 Group info screen — `apps/mobile/app/(modals)/group/[id].tsx`

Scrollable layout:
1. Group avatar (80px) + name (serif) + description (sans, muted)
2. Topics section — list with emoji + name, tap opens topic in chat
3. Members section — first 5 rows (Avatar 36px + name + role badge), "Pokaz wszystkich" link
4. Actions: "Link zaproszenia" (copy/share), "Wycisz", "Opusc grupe"
5. Admin actions: "Edytuj grupe", "Zarzadzaj czlonkami"

#### 4A.3 Register screens in `apps/mobile/app/(modals)/_layout.tsx`

### Sprint 4B: Topics + Discovery UI (MEDIUM priority)

- Topic list — `apps/mobile/app/(modals)/group/[id]/topics.tsx`
- Group discovery — `apps/mobile/app/(modals)/discover-groups.tsx`
- Invite link handler — `apps/mobile/app/group/join/[code].tsx`

### Sprint 5: Polish (LOW priority)

- System messages for join/leave/role changes
- Mute/unmute groups
- Topic creation from within chat screen
- Denormalize member count
- Fix topic messageCount decrement on deleteMessage
- Invite code generation retry
- Group avatar upload
