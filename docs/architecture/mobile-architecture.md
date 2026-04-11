# Mobile Architecture

> v1 --- AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-10 — `messagesStore.updateMessage()` added for in-place message patches (fixes delete dropping message from list).
> Updated 2026-04-11 — Single sign-out path `signOutAndReset()` exported from `app/_layout.tsx` — the 4 logout sites (settings, account deletion, onboarding abort, ACCOUNT_DELETED error handler) now call it instead of reimplementing store resets. Clears auth/profiles/conversations/messages/waves/onboarding stores + `queryClient` + SecureStore tokens; `locationStore` and `preferencesStore` intentionally untouched (BLI-204).

React Native 0.81.5, Expo SDK 54, Expo Router v6 (file-based routing), TypeScript. Bundle ID: `com.blisko.app`. URI scheme: `blisko://`. Portrait-only.

## Terminology & Product Alignment

| PRODUCT.md term | Code term | UI label (PL) |
|-----------------|-----------|---------------|
| Ping | Wave | "Ping" / "Pinguje Cie!" |
| Banka na mapie | Map bubble / nearby user | (visual element) |
| Status | currentStatus + statusVisibility | "Twoj status" |
| Ninja / Semi-Open / Full Nomad | visibilityMode: `ninja` / `semi_open` / `full_nomad` | "Tryb widocznosci" |
| Nie przeszkadzac | doNotDisturb boolean | "Nie przeszkadzac" |
| Co nas laczy | shortSnippet / connection analysis | "Co Was laczy" |
| Profil Match % | matchScore (0--100) | % on bubble |
| Ghost profile | createGhostProfile, isComplete=false | "Na razie tylko imie" |
| Premium+ Grupy | group conversations, type="group" | "Grupy" |

---

## Navigation Structure

Full route tree from `apps/mobile/app/`:

```
_layout.tsx                         Root Stack (tRPC + QueryClient + WS + Notifications + Toast)
|
+-- (auth)/                         Auth group (redirects to tabs if session exists)
|   +-- _layout.tsx                 Stack, headerShown: false
|   +-- login.tsx                   OAuth buttons (Apple, Google, Facebook, LinkedIn) + email
|   +-- email.tsx                   Email OTP entry
|   +-- verify.tsx                  OTP verification
|
+-- (tabs)/                         Main tab navigator (redirects to auth/onboarding as needed)
|   +-- _layout.tsx                 Tabs: 3 tabs, WS handler, hydration, background sync
|   +-- index.tsx                   "W okolicy" --- map + nearby list (sonar ping filter)
|   +-- chats.tsx                   "Czaty" --- conversation list (DM + group), unread badge
|   +-- profile.tsx                 "Profil" --- own profile view
|
+-- onboarding/                     Onboarding flow (stack, slide_from_right animation)
|   +-- _layout.tsx                 Stack, initialRouteName: "hook"
|   +-- hook.tsx                    Animated intro (pulsing bubbles, 5s auto-advance)
|   +-- index.tsx                   Name + age confirmation (Step 1)
|   +-- visibility.tsx              Ghost vs full profile choice (Step 2)
|   +-- questions.tsx               7 questions + AI follow-ups (Step 3)
|   +-- profiling-result.tsx        AI summary review + edit (Step 4)
|
+-- (modals)/                       Modal presentation group
|   +-- _layout.tsx                 Stack with custom header (SafeAreaView pattern)
|   +-- user/[userId].tsx           User profile modal ("Profil")
|   +-- group/[id].tsx              Group detail ("Grupa")
|   +-- group/members/[id].tsx      Group members list ("Czlonkowie")
|
+-- settings/                       Settings stack
|   +-- _layout.tsx                 Stack with custom header (SafeAreaView pattern)
|   +-- index.tsx                   Settings hub ("Ustawienia")
|   +-- profile.tsx                 Profile view ("Profil")
|   +-- edit-profile.tsx            Edit profile ("Edytuj profil")
|   +-- profiling.tsx               Re-profiling ("Profilowanie")
|   +-- profiling-result.tsx        Re-profiling result ("Wynik profilowania")
|   +-- account.tsx                 Account management ("Konto")
|   +-- change-email.tsx            Email change ("Zmien email")
|   +-- verify-email.tsx            Email verification ("Weryfikacja")
|   +-- privacy.tsx                 Privacy settings ("Prywatnosc")
|   +-- blocked-users.tsx           Blocked users ("Zablokowani")
|   +-- notifications.tsx           Notification prefs ("Powiadomienia")
|   +-- help.tsx                    Help screen ("Pomoc")
|
+-- chat/[id].tsx                   Chat screen (conversation detail)
+-- create-group.tsx                Group creation ("Nowa grupa") — full screen, custom header
+-- set-status.tsx                  Status form sheet (fitToContents, grabber, radius 20)
+-- filters.tsx                     Nearby filters form sheet (same presentation)
+-- group/
|   +-- _layout.tsx                 Headerless stack
|   +-- join/[code].tsx             Group join via invite code
```

### Tab Bar

3 tabs: **W okolicy** (IconPin), **Czaty** (IconChat, unread badge), **Profil** (IconPerson). Settings gear in profile header. Create-group "+" in chats header.

**Config:** Height 75px. Label: DM Sans Medium, 8px, 1.5 letter-spacing, uppercase. Active: `colors.ink` (#1A1A1A). Inactive: `colors.muted` (#8B8680).

### Routing Guards

The `(tabs)/_layout.tsx` acts as the main auth/onboarding gate:
- No user session: `<Redirect href="/(auth)/login" />`
- Session but no profile: `<Redirect href="/onboarding" />`
- Profile exists: render tabs
- API error: show retry button with request ID (not redirect)

The `(auth)/_layout.tsx` reverses the guard: session exists redirects to `/(tabs)`.

---

## Zustand Stores

All 8 stores in `apps/mobile/src/stores/`:

### authStore

Holds the authenticated user, session token, and profile. `isLoading` starts `true`, set `false` after initial session check. `hasCheckedProfile` prevents re-fetching after onboarding completes. `reset()` clears everything on logout.

**Key state:** `user` (id, email, name, emailVerified), `session` (id, userId, token, expiresAt), `profile` (displayName, bio, lookingFor, avatarUrl, visibilityMode, doNotDisturb, isComplete, currentStatus, statusVisibility, superpower, offerType, socialLinks).

### conversationsStore

Source of truth for the chat list. Conversations sorted by `updatedAt` desc. Each entry has type (`dm` | `group`), participant info, group info, lastMessage, and `unreadCount`.

**Key methods:** `set()` (bulk hydration, also populates profilesStore), `addNew()` (dedup by id), `updateLastMessage()` (re-sorts), `incrementUnread()` / `markAsRead()`, `setActiveConversation()` (auto-marks read), `updateMemberCount()`, `updateGroupInfo()`, `remove()`.

### messagesStore

Per-conversation message cache using `Map<string, ChatCache>`. Each cache stores items (newest first for inverted FlatList), `hasMore` flag, and `oldestCursor` for pagination.

**Key methods:** `set()`, `prepend()` (new messages, dedup), `appendOlder()` (pagination, dedup), `updateReaction()` (add/remove with count tracking). **Optimistic updates:** `addOptimistic()`, `replaceOptimistic()` (handles WS race — if real message arrived first, removes temp, otherwise swaps temp→real), `removeOptimistic()`, `updateMessage()` (in-place patch by messageId — used for optimistic delete to set `deletedAt` without removing the row).

**Why `updateMessage` is separate from `replaceOptimistic`:** `replaceOptimistic` was designed for the send-race: if the real message is already in the list (delivered by WS), it **removes** the temp entry. Reusing it for delete would drop the message from the list instead of showing the "Wiadomość usunięta" placeholder. `updateMessage` patches an existing item in place.

### wavesStore

Tracks received and sent waves (pings). Maintains a derived `waveStatusByUserId` map for quick lookup: `sent` / `received` / `connected`. `viewedWaveIds` tracks which wave notifications the user has seen.

**Key methods:** `setReceived()` / `setSent()` (hydration, recomputes status map), `addReceived()` / `addSent()` (real-time from WS, dedup), `updateStatus()` (wave accepted/declined), `markViewed()`.

### profilesStore

Global cache for other users' profile data. Uses `Map<string, CachedProfile>`. Every profile has `_partial` flag: `true` = from list data (displayName + avatar only), `false` = full profile from getById.

**Key methods:** `merge()` (never downgrades `_partial: false` to `true`), `mergeMany()` (bulk merge, used by conversationsStore.set). Fields: userId, displayName, avatarUrl, bio, lookingFor, distance, matchScore, commonInterests, shortSnippet, analysisReady.

### locationStore

User's current GPS position. `permissionStatus`: `undetermined` / `granted` / `denied`. Updated by the location tracking hook.

### onboardingStore

Tracks progress through the onboarding flow: `displayName`, `bio`, `lookingFor`, `profilingSessionId`, `step` (number), `isComplete`, `answers` (Record<questionId, answer>), `skipped` (questionId[]), `isGhost`.

### preferencesStore

Persisted to SecureStore. `nearbyRadiusMeters`: 500 / 1000 / 2000 (default 2000). `photoOnly` and `nearbyOnly` filters. `notificationPrefs`: newWaves, waveResponses, newMessages, groupInvites (all default `true`).

---

## tRPC Client

`apps/mobile/src/lib/trpc.ts`. Created via `createTRPCReact<AppRouter>()` with `httpBatchLink`. Server URL from `EXPO_PUBLIC_API_URL` env var (fallback: `http://localhost:3000`).

**Auth:** Headers include `Authorization: Bearer <token>` --- tries Better Auth session first, falls back to SecureStore (for dev auto-login). Also sends `x-app-version` header.

**Error handling:** Global error interceptor on `QueryCache` and `MutationCache` handles: `ACCOUNT_DELETED` (alert + sign out), `TOO_MANY_REQUESTS` (toast with friendly rate-limit message). Retries: up to 3 for normal errors, 0 for account-deleted and rate-limited.

---

## WebSocket

`apps/mobile/src/lib/ws.ts`. Singleton connection, module-level state. URL derived from `EXPO_PUBLIC_API_URL` (http -> ws, appends `/ws`).

**Connection lifecycle:** Connects on user login. Disconnects on app background. Reconnects on app foreground. Auto-reconnect on close after 3s delay. `forceDisconnect` message from server suppresses reconnect (used for session invalidation).

**Authentication:** After WebSocket opens, sends `{ type: "auth", token }`. Token sourced from: (1) Zustand authStore, (2) Better Auth HTTP call, (3) SecureStore fallback.

**Reconnection handling:** On re-auth after reconnect, dispatches synthetic `"reconnected"` event to all handlers, which triggers full reconciliation (refetch waves, conversations).

**Handler pattern:** Global `Set<MessageHandler>` --- multiple components register via `useWebSocket(handler)`. The `(tabs)/_layout.tsx` registers the main handler processing all event types.

**Event types handled in tabs layout:** `newWave`, `waveResponded`, `newMessage`, `reaction`, `profileReady`, `groupMember`, `groupUpdated`, `topicEvent`, `conversationDeleted`, `groupInvited`, `reconnected`.

**Typing indicators:** `useTypingIndicator(conversationId)` hook. Sends typing state, auto-stops after 3s. Receives others' typing, auto-clears after 5s.

---

## Push Notifications

`apps/mobile/src/hooks/usePushNotifications.ts`. Uses Expo Notifications SDK.

**Token registration:** On user login, requests permission, gets Expo push token, registers via `pushTokens.register` tRPC mutation. Token cached in SecureStore (`lastRegisteredPushToken`) to avoid re-registering same token. Simulator gracefully skips (no push support).

**Foreground suppression:** `setNotificationHandler` suppresses all system banners/sounds in foreground --- in-app notification overlay handles those instead.

**Tap routing:** Listens to `addNotificationResponseReceivedListener`. Routes by `data.type`: `wave` -> user profile modal, `chat`/`group` -> chat screen.

---

## In-App Notifications

`apps/mobile/src/hooks/useInAppNotifications.ts`. Custom overlay (not system notifications). Triggered by WS events while app is in foreground.

Handled events: `newWave` ("Pinguje Cie!"), `waveResponded` accepted ("Przyjal(a) Twoj ping!"), `waveResponded` declined (friendly message), `groupInvited`, `newMessage` (skips own messages and active conversation). Each notification has avatar, title, subtitle, and tap action.

---

## Background Sync

`apps/mobile/src/hooks/useBackgroundSync.ts`. Safety net for missed WS events.

**App resume:** If backgrounded > 10s, refetches waves and conversations on return to foreground.

**Periodic:** Every 60s, refetches waves and conversations regardless. Silent failures --- next cycle retries.

---

## Auth Client

`apps/mobile/src/lib/auth.ts`. Better Auth client with Expo plugin (`scheme: "blisko"`, `storagePrefix: "blisko"`, SecureStore backend) and email OTP plugin.

---

## Key Conventions

**No Expo Go:** Native modules (expo-notifications, expo-location) require a dev client build. `expo-dev-client` is a direct dependency. Run via `npx expo run:ios` or `--device`.

**No EAS Build:** Local Xcode builds + manual upload via Xcode Organizer to TestFlight. EAS CLI used only for credentials management (`npx -y eas-cli@latest`).

**Custom headers (no native headers):** iOS wraps `headerLeft`/`headerRight` in `UIBarButtonItem` with an ugly capsule background that cannot be removed. All headers use `header: () => (...)` with `SafeAreaView` + centered title + back chevron pattern.

**Back button:** Always `IconChevronLeft` from `@/components/ui/icons`, size 24, `colors.ink`, `hitSlop={8}`. No text.

**Path aliases:** `@/*` maps to `src/*` (tsconfig). Same-directory `./` is fine.

**Typography:** InstrumentSerif (Regular, Italic) for headings/display. DM Sans (Regular, Medium, SemiBold) for body. Design system in `apps/mobile/src/theme.ts`.

**Colors:** ink #1A1A1A, bg #FAF7F2, accent #C0392B, rule #D5D0C4, muted #8B8680, mapBg #F0ECE3.

---

## Impact Map

If you change this system, also check:

- **WebSocket event types** --- `apps/mobile/src/lib/ws.ts` (WSMessage union), `apps/mobile/app/(tabs)/_layout.tsx` (handler), `apps/mobile/src/hooks/useInAppNotifications.ts`, `apps/api/src/ws/`
- **tRPC router changes** --- mobile auto-imports AppRouter type from `api/src/trpc/router`, but tRPC client URL and auth headers are in `apps/mobile/src/lib/trpc.ts`
- **Store shape changes** --- all stores are imported across multiple screens; changing store interfaces affects any screen reading that state
- **Navigation routes** --- deep links from push notifications (`usePushNotifications.ts`), in-app notification tap handlers, and `router.push()` calls throughout the codebase
- **Auth flow** --- Use `signOutAndReset()` from `app/_layout.tsx` for every logout path (it wraps `authClient.signOut()`, store resets, `queryClient.clear()`, and SecureStore cleanup). Never roll your own logout — missing a store leaks cached data (e.g. `onboardingStore` draft) into the next account
- **Onboarding screens** --- `onboarding/_layout.tsx` defines the screen order; adding screens requires updating both the layout and the profiling API procedures
- **Expo config** --- `app.json` plugins list, iOS `infoPlist` permissions, EAS project ID (`34d895cd-60a0-4c82-affe-7c6fa2b963ee`)
