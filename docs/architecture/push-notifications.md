# Push Notifications

> v1 — AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-10 — Push send logging via Redis batch buffer + `push_sends` table. Every push (sent, suppressed, failed) is now recorded.
> Updated 2026-04-11 — `usePushNotifications` now bidirectionally syncs the device's push_tokens row with system permission on every `AppState === "active"`. Local mirror of server state lives in `authStore.pushToken`; register on grant, unregister on revoke, both also on mount. Drops SecureStore coordination between hook and `signOutAndReset` (BLI-205).

Expo Push API delivering notifications to iOS and Android devices. Source: `apps/api/src/services/push.ts`, `apps/api/src/trpc/procedures/pushTokens.ts`.

## Terminology & Product Alignment

| PRODUCT.md | Code | UI (Polish) |
|---|---|---|
| Ping / wave | `newWave` trigger | "Name — nowy ping!" |
| Ping accepted | `waveResponded` trigger | "Name — ping przyjety!" |
| Mutual ping | Both waves accepted simultaneously | "Pingowaliscie sie wzajemnie — to rzadkie!" |
| Status Match (ambient) | `sendAmbientPushWithCooldown()` | "Ktos z pasujacym profilem jest w poblizu" |
| Chat message (DM) | `sendMessage` in DM conversation | "Name: message preview" |
| Chat message (group) | `sendMessage` in group conversation | "Name: preview" or "N nowych wiadomosci" |
| Group invite | `create` / `addMember` in groups | "Nowe zaproszenie do grupy" |
| Nie przeszkadzaj (DND) | `profiles.doNotDisturb` | Push delivery suppressed server-side |

## Infrastructure

**Expo Push API:** Free tier, rate limit 600 notifications/second. No external push service dependency beyond Expo.

**Client library:** `expo-server-sdk` — handles token validation, message chunking, batch sending, and error parsing.

## Token Management

Source: `apps/api/src/trpc/procedures/pushTokens.ts`, `apps/mobile/src/hooks/usePushNotifications.ts`

**Register:** `pushTokens.register` mutation. Accepts `{ token: string, platform: "ios" | "android" }`. Uses `onConflictDoUpdate` on the unique `token` column — if the same device token is registered by a different user (e.g., after logout + login on same device), ownership transfers to the new user.

**Unregister:** `pushTokens.unregister` mutation. Deletes the token for the current user. Called on logout (via `signOutAndReset`) and on foreground resume when system permission has been revoked (via `usePushNotifications`).

**Multi-device:** One user can have multiple tokens (phone + tablet). All tokens receive the push.

**Stale token cleanup:** When Expo API returns a ticket with `status: "error"` and `details.error === "DeviceNotRegistered"`, the corresponding token row is deleted from the database immediately. This handles uninstalled apps and expired tokens.

### Client-side sync via `authStore.pushToken`

**What:** `usePushNotifications` in `apps/mobile/src/hooks/usePushNotifications.ts` runs a `sync()` function on mount (login / cold start) and on every `AppState === "active"` transition. The function reconciles three values and fires at most one mutation per sync:

1. **System permission** — `Notifications.getPermissionsAsync()` (with a one-time `requestPermissionsAsync()` prompt when status is `undetermined`).
2. **Device push token** — `Notifications.getExpoPushTokenAsync()`, cached natively on iOS per device.
3. **Local mirror** — `authStore.pushToken`, a `string | null` field that represents what we believe the server currently has for *this* device.

Decision matrix:

| Permission | `syncedToken` | Action |
|---|---|---|
| `granted` | `=== deviceToken` | no-op (already registered) |
| `granted` | `!== deviceToken` (null or stale) | `pushTokens.register` → `setPushToken(deviceToken)` |
| not granted | `null` | no-op (already unregistered) |
| not granted | non-null | `pushTokens.unregister(syncedToken)` → `setPushToken(null)` |

**Why this shape:**

- **One source of truth for "what we told the server".** The local mirror lives in `authStore` — no SecureStore, no dedicated store, no `useRef`. `authStore.reset()` (already called by `signOutAndReset`) clears it for free.
- **No GET-list round-trip.** We never fetch `push_tokens` state from the server. The client only writes, and `authStore.pushToken` holds the last successful write. Cold start starts with `pushToken: null` → first `sync()` POSTs register → value mirrors server. Idempotent via `onConflictDoUpdate`.
- **No coordination between modules through storage.** `usePushNotifications` writes `authStore.pushToken`, `signOutAndReset` reads it to know what to unregister. Both sides agree on an in-memory field; no SecureStore contract.
- **Permission changes in system Settings** (`granted → denied` or `denied → granted`) are picked up on the next foreground resume because opening Settings and coming back always transitions AppState to active.
- **Simulator safety:** `getExpoPushTokenAsync` throws on iOS simulator; the catch returns silently so the hook is a no-op there.
- **Failure handling:** register/unregister mutation errors are swallowed; next foreground resume retries. `authStore.pushToken` is only advanced on successful mutation, so a transient failure leaves local and server state consistent (both still `null` or both still stale — next retry converges).

## `sendPushToUser` Flow

Source: `apps/api/src/services/push.ts`

The central push function. Every push notification in the app goes through this single function.

**Step-by-step:**

1. **WS active check:** If the user has any active WebSocket connection (`isUserConnected()`), return immediately without sending push. The in-app real-time UI handles delivery.

2. **DND check:** Fetch `profiles.doNotDisturb` for the user. If `true`, return without sending. Server-side suppression — the push never reaches the device.

3. **Token fetch:** Query all push tokens for the user from `pushTokens` table.

4. **Token validation:** Filter tokens through `Expo.isExpoPushToken()`. Invalid tokens (malformed, wrong format) are silently skipped.

5. **Message assembly:** For each valid token, build an `ExpoPushMessage`:
   - `to`: the push token
   - `sound`: `"default"` for audible pushes, `undefined` for silent (when `collapseId` is set)
   - `title`, `body`: from caller payload
   - `data`: arbitrary JSON passed through to the client app
   - `_id`: set to `collapseId` when provided (Expo's collapse mechanism)

6. **Batch send:** Chunk messages via `expo.chunkPushNotifications()` and send each chunk via `expo.sendPushNotificationsAsync()`.

7. **Error handling:** Iterate tickets, delete tokens that got `DeviceNotRegistered`. All errors are caught and logged — push failures never crash the caller.

**Why fire-and-forget (`void sendPushToUser(...)`):** All call sites use `void` — push is a side effect that should not block the main mutation response. Failures are logged but don't affect the user's action.

## All Push Types (9 triggers)

| Trigger | Title | Body | collapseId | Sound | Source file |
|---|---|---|---|---|---|
| New wave (normal) | `"Blisko"` | `"{name} — nowy ping!"` | none | Yes | `waves.ts` |
| Mutual wave (both users) | `"Blisko"` | `"Pingowaliscie sie wzajemnie — to rzadkie!"` | none | Yes | `waves.ts` |
| Wave accepted | `"Blisko"` | `"{name} — ping przyjety!"` | none | Yes | `waves.ts` |
| DM message | `"{senderName}"` | `"{messagePreview}"` | none | Yes | `messages.ts` |
| Group message (first unread) | `"{groupName}"` | `"{senderName}: {preview}"` | none | Yes | `messages.ts` |
| Group message (has unreads) | `"{groupName}"` | `"{N} nowych wiadomosci"` | `"group:{conversationId}"` | No (silent) | `messages.ts` |
| Ambient status match | `"Blisko"` | `"Ktos z pasujacym profilem jest w poblizu"` | `"ambient-match"` | No (silent) | `queue.ts` |
| Group invite (create) | `"{groupName}"` | `"Nowe zaproszenie do grupy"` | `"group-invite:{conversationId}"` | No (silent) | `groups.ts` |
| Group invite (addMember) | `"{groupName}"` | `"Nowe zaproszenie do grupy"` | `"group-invite:{conversationId}"` | No (silent) | `groups.ts` |

### Wave push details

**New wave:** Sent to `input.toUserId`. Title is always "Blisko" (app name). Body includes sender's `displayName` with fallback to "Ktos". Data payload: `{ type: "wave", userId: senderId }` — client uses this to deep-link to the wave detail screen.

**Mutual wave:** When user A pings user B, and user B already has a pending wave to user A (within 30-second window), it's a mutual ping. Both users receive the same push text. Data payload: `{ type: "chat", conversationId }` — client opens the newly created conversation directly.

**Wave accepted:** Sent to the original wave sender (`wave.fromUserId`). Data payload: `{ type: "chat", conversationId }` — client opens the new conversation.

### Message push details

**DM:** Each participant (except sender) gets an individual push. Title is the sender's display name (personal feel, like iMessage). Body is the message content truncated for preview. Data: `{ type: "chat", conversationId }`.

**Group (first unread):** Same structure as DM but title is the group name (or sender name as fallback). This is the "heads up" notification that draws attention.

**Group (has unreads):** When a recipient already has unread messages (checked via `lastReadAt` comparison), the push becomes a silent update. The body changes from individual message preview to aggregate count (`"3 nowych wiadomosci"`). The `collapseId: "group:{conversationId}"` ensures the device replaces the previous notification rather than stacking.

### Ambient push details

**Status/proximity match:** Triggered by `sendAmbientPushWithCooldown()` in the queue processor — never directly from a tRPC procedure. The cooldown mechanism (see Ambient Push Cooldown section) ensures at most one push per hour per user. CollapseId `"ambient-match"` prevents stacking. Data: `{ type: "ambient_match" }`.

### Group invite details

**Create group with members:** When a group is created with initial members, each invited member receives a push. Sent outside the transaction (non-critical side effect).

**Add member to existing group:** Same push format as create. Triggered by the `addMember` mutation.

## Group Unread Suppression

**Problem:** Active group chats generate many messages quickly. Without suppression, users get buzzed for every single message — making group chats annoying.

**Solution:** CollapseId-based suppression using unread count detection.

**How it works:**

1. When a message is sent to a group conversation, the server counts unread messages per recipient (messages created after their `lastReadAt`)
2. `hasUnread` is `true` when `unreadCount > 1` (the "1" accounts for the message just inserted)
3. If `hasUnread` is false (this is the first unread message): send audible push with sender name and preview, no collapseId
4. If `hasUnread` is true (user already has unread messages): send silent push with `collapseId: "group:{conversationId}"`, body is `"{N} nowych wiadomosci"`. The collapseId causes the new push to replace the previous one on the device — user sees only the latest count
5. After the user reads messages (advancing `lastReadAt`), the next message triggers a fresh audible push again

**Why this design:** Mimics how iMessage handles group chats — first unread message makes noise, subsequent ones update silently. Prevents notification fatigue while ensuring the user knows something happened.

## DM: No Suppression

**What:** Every DM message triggers an audible push with the sender's name and message preview. No collapseId, no batching, no suppression.

**Why:** DMs are 1:1 conversations. Each message is individually important — like iMessage or WhatsApp. Suppressing would make the app feel unresponsive.

## Ambient Push Cooldown

**What:** Status matches and proximity matches trigger ambient push notifications. To prevent notification spam when a user is in a busy area, pushes are throttled per user.

**Mechanism:**
- Redis key: `ambient-push:{userId}`
- TTL: 3600 seconds (1 hour)
- Before sending: check if key exists (GET)
- If exists: skip push entirely
- If not: SET key with EX 3600, then send push

**Push payload when sent:** Title `"Blisko"`, body `"Ktos z pasujacym profilem jest w poblizu"`, collapseId `"ambient-match"`, data `{ type: "ambient_match" }`.

**Why 1 hour:** Status matches happen passively as users move around. In a dense area (conference, university campus), matches can fire every few minutes. One ambient push per hour is the upper bound of what feels "ambient" rather than "spammy."

**Why collapseId on ambient:** If two ambient pushes somehow slip through (race condition), the second replaces the first on the device rather than stacking.

## Conversation Mute (Per-Participant Push Suppression)

**What:** A user can mute a specific DM or group conversation via `messages.muteConversation` (see `messaging.md`). When mute is active (`conversationParticipants.mutedUntil > now`), `sendPushToUser` skips that recipient for any push originating from that conversation (DM message, group message, group invite).

**How:** When resolving recipients for a conversation push, `messages.ts` reads `mutedUntil` for each target participant in the same query that fetches push tokens and DND. Skip happens before the Expo chunking stage, so muted recipients aren't in the batch send at all.

**Durations:** `1h`, `8h`, or `forever` (stored as `new Date("9999-12-31")`). `unmuteConversation` sets it to `null`.

**Crucial:** Mute only suppresses push notifications. The WebSocket event still fires and the message is stored — the recipient sees the new message on their next app open or WS refresh.

## WebSocket Fallback (Push Suppression)

**What:** `sendPushToUser` checks `isUserConnected(userId)` first. If the user has any active WebSocket connection, push is skipped entirely.

**Why:** When the app is open and connected via WebSocket, real-time events are delivered instantly through the WS channel. The mobile client shows in-app banners for these events. Sending a push notification on top of the in-app banner would result in a duplicate alert — the phone buzzes while the user is already looking at the new message.

**How `isUserConnected` works:** Iterates the in-memory `clients` Set (all connected WS clients on this replica) looking for any connection where `ws.data.userId === userId`. Returns `true` on first match.

**Limitation:** Only checks the current replica's connections. If user is connected to replica B but the push is triggered on replica A, the check returns false and push is sent. In practice this rarely causes double-delivery because the user's tRPC calls (which trigger pushes) route to the same replica as their WS connection.

## Sound vs Silent Logic

The `sound` field in push messages is determined by a single rule: **if `collapseId` is set, the push is silent (`sound: undefined`); otherwise it's audible (`sound: "default"`).**

This means:
- All wave pushes: audible (no collapseId)
- All DM message pushes: audible (no collapseId)
- First group message (no unreads): audible (no collapseId)
- Subsequent group messages: silent (collapseId = `"group:{conversationId}"`)
- Ambient match: silent (collapseId = `"ambient-match"`)
- Group invites: silent (collapseId = `"group-invite:{conversationId}"`) — multiple invitations in quick succession (e.g. owner adds several members) replace each other on the device rather than stacking

**Why tie sound to collapseId:** CollapseId is used for notifications that update/replace previous ones. If the device already buzzed for the first notification, subsequent updates should silently replace the content without re-alerting. This is a UX decision: one buzz per "batch" of related events.

## Do Not Disturb (DND)

**What:** Users with `profiles.doNotDisturb = true` receive no push notifications at all. The suppression is server-side — the push is never sent to Expo.

**Data still stored:** Messages, waves, and other data are still written to the database. When DND is turned off, the user sees everything in-app — they just weren't notified in real-time.

**Why server-side (not client-side):** Server-side suppression saves Expo API quota and ensures zero device vibration/sound. Client-side DND would still cause the device to receive the notification (potentially showing briefly before being suppressed).

## Notification Data Payloads

Every push includes a `data` field that the mobile client uses for deep-linking:

| Data type | Value | Client behavior |
|---|---|---|
| `{ type: "wave", userId }` | New wave received | Navigate to wave detail / user profile |
| `{ type: "chat", conversationId }` | Message, mutual ping, wave accepted | Navigate to conversation |
| `{ type: "group", conversationId }` | Group invite | Navigate to group conversation |
| `{ type: "ambient_match" }` | Status match | Navigate to map (centered on current location) |

**Why structured data:** iOS and Android handle notification taps by passing the `data` object to the app's notification handler. The `type` field lets the client route to the correct screen without fetching additional context.

## Push Send Logging

Source: `apps/api/src/services/push-log.ts`, `apps/api/src/services/batch-buffer.ts`

Every call to `sendPushToUser()` logs the outcome — sent, suppressed (with reason), or failed — to the `push_sends` database table via a Redis-buffered batch writer.

**How it works:**

1. `sendPushToUser()` calls `logPushEvent()` at each exit point (fire-and-forget)
2. `logPushEvent()` calls `pushLogBuffer.append()` which does `RPUSH blisko:push-log <JSON>` (~0.1ms, never throws)
3. BullMQ repeatable job `flush-push-log` runs every 15s, atomically drains the Redis list, and batch-inserts all events into `push_sends`
4. BullMQ repeatable job `prune-push-log` runs every hour, deletes entries older than 7 days

**Suppression reasons recorded:**

| Reason | When |
|--------|------|
| `ws_active` | User has active WebSocket connection — in-app banner handles delivery |
| `dnd` | User has Do Not Disturb enabled |
| `no_tokens` | No push tokens registered for this user |
| `invalid_tokens` | Tokens registered but none pass `Expo.isExpoPushToken()` validation |

**Why batch via Redis:** Direct DB insert per push would add latency to the fire-and-forget hot path. Redis `RPUSH` is ~0.1ms and non-blocking. The batch flush means 1 DB INSERT per 15s regardless of push volume.

**Generic infrastructure:** `createBatchBuffer<T>()` in `batch-buffer.ts` is a reusable pattern — not push-specific. Any future feature needing low-overhead batch logging can use the same utility.

## Error Handling Philosophy

Push notification delivery is best-effort. The system is designed to never block user actions due to push failures:

1. **All call sites use `void`:** `sendPushToUser` returns a Promise, but callers discard it. The mutation response is sent to the client before push delivery completes.
2. **Entire function in try-catch:** Any error (DB query failure, Expo API error, network timeout) is caught, logged, and swallowed.
3. **Token cleanup is opportunistic:** Invalid tokens are cleaned up when Expo reports them, not proactively. A small number of stale tokens is acceptable.
4. **Redis cooldown fails open:** If Redis is unavailable for ambient push cooldown, the cooldown check returns early without error, and the push is sent. More pushes > no pushes.
5. **Push logging fails open:** If Redis is down, `logPushEvent()` silently skips — push delivery is unaffected.

## Impact Map

If you change this system, also check:
- **New push type:** Add entry to push types table above, decide on collapseId (group suppression vs always-audible), check if ambient cooldown applies
- **`pushTokens` schema:** Token registration, unregistration, and stale cleanup all rely on the current column structure
- **WS connection handling:** `isUserConnected()` iterates `clients` Set from `ws/handler.ts` — changes to connection lifecycle affect push suppression
- **Group conversation schema:** Unread suppression queries `conversationParticipants.lastReadAt` and counts messages — schema changes affect push behavior
- **DND feature:** Server-side suppression in `sendPushToUser()` — any push bypass (e.g., "critical" alerts) would need explicit DND override
- **Expo SDK upgrade:** `expo-server-sdk` handles chunking and error parsing — version changes may affect behavior
- **Redis availability:** Ambient push cooldown depends on Redis — if Redis is down, cooldown fails open (no cooldown = more pushes, not fewer)
- **Multi-replica:** `isUserConnected()` only checks local replica — adding sticky sessions or a shared connection registry would improve push suppression accuracy
- **Ambient push cooldown TTL:** Changing 3600s affects how often users get ambient match notifications — too low = spam, too high = missed matches
- **Push log (`push_sends` table):** Admin push log page reads from this table. Batch buffer uses Redis list `blisko:push-log`. Prune job deletes entries older than 7 days
- **`batch-buffer.ts`:** Generic utility — changes affect all batch buffer consumers (currently only push log)
- **Client lifecycle sync (`usePushNotifications` + `authStore.pushToken`):** Mobile hook reconciles permission state with `push_tokens` on every foreground resume, using `authStore.pushToken` as the local mirror of server state. Changes to `pushTokens.register`/`unregister` shape must be reflected on both sides. `signOutAndReset` reads `authStore.pushToken` to know what to unregister on logout — don't drop that read without replacing the mechanism
