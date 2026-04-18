# Mobile Architecture

> v1 --- AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-10 — `messagesStore.updateMessage()` added for in-place message patches (fixes delete dropping message from list).
> Updated 2026-04-12 — Nearby screen rewrite: supercluster clustering, viewport-synced list, split endpoints (`useNearbyMapMarkers` + `useNearbyList` + `useSupercluster` hooks), removed `nearbyOnly` toggle (BLI-189).
> Updated 2026-04-12 — BLI-189 hotfix: supercluster config `radius: 30`, `maxZoom: 20`; viewport debounce 500ms (coupled with 20/10s rate limit — max 2 req/s fits in the window).
> Updated 2026-04-13 — BLI-220: nearby empty states with contextual messages + "Wróć do mojej lokalizacji" button. `NearbyMapRef.animateToRegion` now takes delta (required), not zoom. `DEFAULT_MAP_DELTA` constant. Cluster tap zoom fix (+2 levels guard). "+ UTWÓRZ" action in groups header.
> Updated 2026-04-11 — Single sign-out path `signOutAndReset()` exported from `app/_layout.tsx` — the 4 logout sites (settings, account deletion, onboarding abort, ACCOUNT_DELETED error handler) now call it instead of reimplementing store resets. Clears auth/profiles/conversations/messages/waves/onboarding stores + `queryClient` + SecureStore tokens; `locationStore` and `preferencesStore` intentionally untouched (BLI-204).
> Updated 2026-04-11 — Fixed pings-list crash in `(tabs)/chats.tsx`: two sibling `FlatList`-es (pings vs conversations) in a ternary were sharing one React instance; switching filter mutated `onViewableItemsChanged` from function → undefined, triggering `Invariant Violation: Changing onViewableItemsChanged nullability on the fly is not supported` (SIGABRT). Fix: distinct `key` props so React treats them as separate instances. See "Gotchas" below.
> Updated 2026-04-11 — Chats tab `tabBarBadge` now sums unread messages **and** unviewed pending pings (was: unread messages only). Mirrors the `unviewedPingCount` already shown on the sonar pill inside the chats screen — both numbers come from the same `wavesStore.viewedWaveIds` cursor, so the user sees a consistent "things demanding attention" count from the tab bar and from inside the screen (BLI-207). See "Tab badges" under Key Conventions.
> Updated 2026-04-12 — Migrated toast system from custom ToastProvider/ToastBanner/ToastOverlay to sonner-native. Added react-native-reanimated + react-native-gesture-handler as new dependencies. Thin `showToast()` wrapper in `lib/toast.ts` preserves per-type haptic feedback (BLI-216).
> Updated 2026-04-14 — messaging single source of truth, vanilla tRPC client, lifecycle-safe mutations (BLI-224).
> Updated 2026-04-19 — BLI-196 onboarding primitives: `OnboardingStepHeader` (Stack.Screen header slot, not in-content), `OnboardingScreen` wrapper (ScrollView + SafeAreaView bottom + footer slot with `flexGrow: 1` + `flex: 1` hang-at-bottom pattern), `Toggle` primitive (Reanimated pill with icons/labels variants, replaces native Switch). New theme consts: `layout.headerHeight = 44` (iOS standard, normalized across 5 custom-header call sites) and `symbols.bullet = "·"`. `OnboardingQuestion.examples` renamed from `hints`/back; persona-driven example voice documented in shared/models.ts.

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
_layout.tsx                         Root Stack (GestureHandlerRootView + tRPC + QueryClient + WS + Notifications + Toaster)
|
+-- (auth)/                         Auth group (redirects to tabs if session exists)
|   +-- _layout.tsx                 Stack, headerShown: false
|   +-- login.tsx                   OAuth buttons (Apple, Google, Facebook, LinkedIn) + email
|   +-- email.tsx                   Email OTP entry
|   +-- verify.tsx                  OTP verification
|
+-- (tabs)/                         Main tab navigator (redirects to auth/onboarding as needed)
|   +-- _layout.tsx                 Tabs: 3 tabs, WS handler, hydration, background sync
|   +-- index.tsx                   "W okolicy" --- map (supercluster) + viewport-synced list
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

**Single source of truth** for all message data. React Query cache is no longer used for messages — the store owns the data, and components read directly from it via Zustand selectors.

Per-conversation message cache using `Map<string, ChatCache>`. Each `ChatCache` stores items (newest first for inverted FlatList), `hasMore` flag, `oldestCursor` for pagination, `seq` (latest known sequence number), and `status` (`'partial'` | `'hydrated'`).

**Lifecycle-safe mutations:** `send()`, `react()`, `deleteMessage()`, `markAsRead()` live in the store (not in components), using a vanilla tRPC client (`vanillaClient` from `lib/trpc.ts`) for imperative calls outside the React tree. This eliminates the problem of mutations being cancelled when the user navigates away from the chat screen.

**Key methods:** `set()`, `prepend()` (new messages, dedup, gap detection via seq), `appendOlder()` (pagination, dedup), `updateReaction()` (add/remove with count tracking). **Optimistic updates:** `addOptimistic()`, `replaceOptimistic()` (handles WS race — if real message arrived first, removes temp, otherwise swaps temp→real), `removeOptimistic()`, `updateMessage()` (in-place patch by messageId — used for optimistic delete to set `deletedAt` without removing the row).

**Own WS echo skip:** When a `newMessage` WS event arrives, the store skips it if the sender is the current user — the HTTP response from `send()` is the authoritative confirmation, preventing duplicates.

**Gap detection:** On `prepend()`, if `msg.seq > newestSeq + 1`, a gap is detected. On WS reconnect, the store calls `syncGaps` with a `{convId: newestSeq}` map across all cached conversations to batch-fill missed messages.

**Eager preload:** Top 15 conversations are preloaded on tab mount (replaces the previous on-scroll `usePrefetchMessages` hook).

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

Persisted to SecureStore. `nearbyRadiusMeters`: 500 / 1000 / 2000 (default 2000). `photoOnly` filter (`nearbyOnly` removed in BLI-189 — viewport sync is default). `notificationPrefs`: newWaves, waveResponses, newMessages, groupInvites (all default `true`).

---

## tRPC Client

`apps/mobile/src/lib/trpc.ts`. Created via `createTRPCReact<AppRouter>()` with `httpBatchLink`. Server URL from `EXPO_PUBLIC_API_URL` env var (fallback: `http://localhost:3000`).

**Vanilla client:** `vanillaClient` is also exported — a non-React tRPC client for imperative calls from Zustand stores and other non-component code. Used by `messagesStore` for lifecycle-safe mutations (`send()`, `react()`, `deleteMessage()`, `markAsRead()`, `syncGaps`).

**Auth:** Headers include `Authorization: Bearer <token>` --- tries Better Auth session first, falls back to SecureStore (for dev auto-login). Also sends `x-app-version` header.

**Error handling:** Global error interceptor on `QueryCache` and `MutationCache` handles: `ACCOUNT_DELETED` (alert + sign out), `TOO_MANY_REQUESTS` (toast with friendly rate-limit message). Retries: up to 3 for normal errors, 0 for account-deleted and rate-limited.

---

## WebSocket

`apps/mobile/src/lib/ws.ts`. Singleton connection, module-level state. URL derived from `EXPO_PUBLIC_API_URL` (http -> ws, appends `/ws`).

**Connection lifecycle:** Connects on user login. Disconnects on app background. Reconnects on app foreground. Auto-reconnect on close after 3s delay. `forceDisconnect` message from server suppresses reconnect (used for session invalidation).

**Authentication:** After WebSocket opens, sends `{ type: "auth", token }`. Token sourced from: (1) Zustand authStore, (2) Better Auth HTTP call, (3) SecureStore fallback.

**Reconnection handling:** On re-auth after reconnect, dispatches synthetic `"reconnected"` event to all handlers, which triggers full reconciliation (refetch waves, conversations) and batch `syncGaps` call to fill missed messages across all cached conversations.

**Handler pattern:** Global `Set<MessageHandler>` --- multiple components register via `useWebSocket(handler)`. The `(tabs)/_layout.tsx` registers the main handler processing all event types.

**Event types handled in tabs layout:** `newWave`, `waveResponded`, `newMessage`, `reaction`, `profileReady`, `groupMember`, `groupUpdated`, `topicEvent`, `conversationDeleted`, `groupInvited`, `reconnected`.

**Self-healing failure events** (handled by dedicated retry hooks — see Hook Catalog below): `analysisFailed`, `profilingFailed`, `profileFailed`, `questionFailed`, `statusMatchingFailed`. Each failure event triggers the corresponding retry mutation from its own hook, separate from the main tabs-layout handler so the retry logic only mounts where the user is actually waiting on that job (e.g. profile retry on the onboarding result screen, not the map tab).

**Typing indicators:** `useTypingIndicator(conversationId)` hook. Sends typing state, auto-stops after 3s. Receives others' typing, auto-clears after 5s.

---

## Push Notifications

`apps/mobile/src/hooks/usePushNotifications.ts`. Uses Expo Notifications SDK.

**Token registration:** On mount (login / cold start) and on every foreground resume, `usePushNotifications` reconciles system permission + `getExpoPushTokenAsync()` + `authStore.pushToken` (local mirror of server state). Registers via `pushTokens.register` when granted and local mirror is stale; unregisters via `pushTokens.unregister` when permission is revoked and the mirror is non-null. `authStore.reset()` (called by `signOutAndReset`) clears the mirror on logout. Simulator gracefully skips (no push support).

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

## Providers & Overlays

### Toast System (sonner-native)

`<Toaster>` from `sonner-native` renders at the end of the root layout JSX, inside `GestureHandlerRootView`. Config: `position="top-center"`, `duration={4000}`, `visibleToasts={3}`, `swipeToDismissDirection="up"`, `richColors`, `theme="light"`.

**Triggering toasts:** Import `showToast` from `@/lib/toast` (thin wrapper that adds haptic feedback per type via `expo-haptics`, then delegates to `toast.success/error/info` from sonner-native). Works both inside and outside the React tree — `sonner-native`'s `toast()` is a module-level function. The tRPC global error interceptor (`handleRateLimitError`, `handleContentModeration` in `_layout.tsx`) calls `showToast` directly.

For advanced usage (promise toasts, custom JSX, programmatic dismiss), import `toast` from `@/lib/toast` (re-exported from sonner-native).

**Dependencies:** `react-native-reanimated` (60fps animations, requires babel plugin in `babel.config.js`), `react-native-gesture-handler` (swipe-to-dismiss, requires `GestureHandlerRootView` wrapper at app root).

### In-App Notifications (via sonner-native)

WS-driven banners (new ping, wave response, new message, group invite) use the same sonner-native toast system via `showNotification(category, id, jsx)` from `@/lib/toast`. This function gates on `preferencesStore.notificationPrefs[category]` before showing — if the user disabled a category in settings, the notification is silently dropped. Uses `toast.custom()` to render `NotificationToast` (`components/ui/NotificationToast.tsx`) — a banner with avatar, title, subtitle, accent border, and tap-to-navigate (calls `onPress` + `toast.dismiss(id)`).

The `useInAppNotifications` hook in `(tabs)/_layout.tsx` maps WS events to `showNotification()` calls with the appropriate category and navigation action. No provider or context needed — everything is imperative via sonner-native's module-level API.

Both toasts and notifications are ephemeral in-memory — neither persists across sessions. The Push Notifications section's "in-app notification overlay handles those instead" refers to the `NotificationToast` banners rendered by sonner-native.

---

## Hook Catalog

Hooks live in `apps/mobile/src/hooks/`. All are React hooks, mounted high in the tree (typically `app/_layout.tsx` or `app/(tabs)/_layout.tsx`) rather than per-screen so subscriptions live for the entire session.

| Hook | Purpose |
|---|---|
| `usePushNotifications` | Token registration + permission sync + tap routing (see Push Notifications section) |
| `useInAppNotifications` | WS → in-app banner routing (see In-App Notifications section) |
| `useBackgroundSync` | App-resume + periodic refetch (see Background Sync section) |
| `useProfileGate` | Imperative "require complete profile" check used by action buttons (waves, groups, status). Reads `profilesStore.isComplete` and surfaces a non-dismissable `ProfileGateSheet` when blocked; returns a predicate/action wrapper rather than rendering anything itself. The third gate layer below routing guards. |
| `usePrefetchMessages` | **Deprecated** — replaced by eager preload of top 15 conversations in `messagesStore` on tab mount. Previously warmed React Query caches on tab focus. |
| `useRetryProfileOnFailure` | Listens for `profilingFailed` WS event, calls `profiling.retryProfileGeneration` — self-healing for `generate-profile-from-qa` failures (BLI-162) |
| `useRetryProfileAIOnFailure` | Listens for `profileFailed` WS event, calls `profiles.retryProfileAI` — self-healing for `generate-profile-ai` failures (BLI-163), the final onboarding step |
| `useRetryQuestionOnFailure` | Listens for `questionFailed` WS event, calls `profiling.retryQuestion` — self-healing for next-question generation failures during profiling Q&A (BLI-161) |
| `useRetryStatusMatchingOnFailure` | Listens for `statusMatchingFailed` WS event, calls `profiles.retryStatusMatching` — self-healing for the ambient status-matching pipeline (BLI-164) |

The four retry hooks collectively implement the client side of the BLI-158/161/162/163/164 self-healing pattern (see `queues-jobs.md` worker-failure section). Each one is a thin wrapper around a specific WS-event → tRPC-retry-mutation pair; they exist as separate files because each mount point differs (question retry only on profiling Q&A screen, profile retry only after onboarding submit, etc.).

### Nearby screen hook stack

The "W okolicy" tab (`(tabs)/index.tsx`) uses three dedicated hooks:

| Hook | File | Purpose |
|---|---|---|
| `useNearbyMapMarkers` | `src/hooks/useNearbyMapMarkers.ts` | Fetches lightweight columnar markers (ids, names, avatars, real coords, statusMatch) — no scoring, no pagination |
| `useNearbyList` | `src/hooks/useNearbyList.ts` | Fetches rich list (bio, match score, snippet, cursor pagination). Accepts `bbox` viewport filter. Debounces viewport changes at **500ms** before issuing a request |
| `useSupercluster` | `src/hooks/useSupercluster.ts` | Client-side clustering of map markers using the `supercluster` library. Config: `radius: 30`, `maxZoom: 20`. Zoom/pan triggers re-cluster in JS — **no HTTP request** |

**Rate limit coupling:** `useNearbyList` debounces at 500ms, which caps the client at 2 req/s. The server limit for `profiles.getNearby` is 20/10s. At sustained max rate (2 req/s × 10s = 20 req), the client reaches but never exceeds the limit. See `src/hooks/useNearbyList.ts` comment for the formula.

### Map view API

`NearbyMapView` exposes a `NearbyMapRef` with one method:

- `animateToRegion(lat, lng, delta)` — all three params required. `delta` is in degrees (Apple Maps operates on lat/lng deltas, not zoom levels). `DEFAULT_MAP_DELTA` (0.05° ≈ 5.5 km) is the single source of truth for the initial map view, exported from `NearbyMapView.tsx`.

**Cluster tap zoom:** `supercluster.getClusterExpansionZoom()` can return the same zoom level as the current view (rounding mismatch between `getClusters` and `getExpansionZoom`). The handler guards against this by always zooming at least 2 levels past `max(expansionZoom, currentZoom)`, guaranteeing a visible change on tap.

**Empty states:** When the viewport drifts outside `nearbyRadiusMeters` from the user's GPS (detected via equirectangular distance approximation in `approxDistanceMeters()`), empty states show an explanatory message instead of generic "no results" text. A "Wróć do mojej lokalizacji" button animates the map back to the user's GPS at `DEFAULT_MAP_DELTA`.

---

## SecureStore Keys

| Key | Set by | Cleared by `signOutAndReset` | Purpose |
|---|---|---|---|
| `blisko_session_token` | `lib/trpc.ts` (after login), `lib/ws.ts` (dev fallback) | Yes | Bearer token for tRPC + WS auth. |
| `onboarding-storage` | `onboardingStore` (zustand `persist` middleware) | Yes | Onboarding draft state — survives app force-quit mid-flow. Cleared on successful submission or sign-out. |
| `blisko_nearby_radius` | `preferencesStore` (`RADIUS_KEY`) | No (intentional) | Map nearby radius (500/1000/2000m). Preserved across logout. |
| `blisko_notification_prefs` | `preferencesStore` (`NOTIF_PREFS_KEY`) | No (intentional) | In-app notification toggles (newWaves, waveResponses, newMessages, groupInvites). Preserved across logout. |
| Better Auth internal keys | `lib/auth.ts` (Expo plugin, `storagePrefix: "blisko"`, SecureStore backend) | Yes (via `authClient.signOut()`) | Better Auth manages its own session + cookie storage under this namespace. Not touched directly. |

---

## Auth Client

`apps/mobile/src/lib/auth.ts`. Better Auth client with Expo plugin (`scheme: "blisko"`, `storagePrefix: "blisko"`, SecureStore backend) and email OTP plugin.

---

## Key Conventions

**No Expo Go:** Native modules (expo-notifications, expo-location) require a dev client build. `expo-dev-client` is a direct dependency. Run via `npx expo run:ios` or `--device`.

**No EAS Build:** Local Xcode builds + manual upload via Xcode Organizer to TestFlight. EAS CLI used only for credentials management (`npx -y eas-cli@latest`).

**Custom headers (no native headers):** iOS wraps `headerLeft`/`headerRight` in `UIBarButtonItem` with an ugly capsule background that cannot be removed. All headers use `header: () => (...)` with `SafeAreaView` + centered title + back chevron pattern. Height normalized via `layout.headerHeight = 44` (iOS nav bar standard) from `theme.ts`, used in: modals layout, settings layout, chat screen, create-group inline header, and `OnboardingStepHeader`.

**Onboarding primitives:** Onboarding screens share two components in `src/components/onboarding/`:
- `OnboardingStepHeader` — rendered via Stack.Screen `header: () => (...)` slot (not in-content). Props: `label` (e.g. "Krok 1", "Ostatni krok"), optional `onBack`, optional `onLogout`, optional `rightLabel` (e.g. "Pytanie 3 / 7"). Wraps itself in `SafeAreaView edges={["top"]}` + bg color.
- `OnboardingScreen` — wrapper with `SafeAreaView edges={["bottom"]}` + `ScrollView contentContainerStyle={{ flexGrow: 1 }}` + inner `<View style={{ flex: 1 }}>` for children + `<View style={styles.footer}>` for footer prop. Result: footer sits at viewport bottom when content is short, below content when content is tall (natural flow, no absolute positioning). Footer has built-in `marginTop: section` + `gap: column`.

**Toggle primitive:** `src/components/ui/Toggle.tsx` — Reanimated pill (30px height matching filter chips) replacing native Switch. Props: `value`, `onValueChange`, optional `disabled`, optional `icons?: { off?, on? }` (check/x/minus/plus built-in SVGs), optional `labels?: { off, on }` (text variant with hanging-indent layout). Default: empty off + accent check on. Haptics on tap via `expo-haptics`. Animates via `withTiming` (240ms, `Easing.out(Easing.cubic)`) — track color interpolation, thumb slide, content scale+opacity.

**Back button:** Always `IconChevronLeft` from `@/components/ui/icons`, size 24, `colors.ink`, `hitSlop={8}`. No text.

**Path aliases:** `@/*` maps to `src/*` (tsconfig). Same-directory `./` is fine.

**Tab badges:** Computed in `app/(tabs)/_layout.tsx` from store selectors — never from network. Single source of truth per badge:

- **Chats tab (`Czaty`)** — `unread messages + unviewed pending pings`. Unread comes from `conversationsStore.conversations[].unreadCount` (server-computed in `messages.getConversations`, kept in sync by WS `newMessage`/`markAsRead` events). Unviewed pings come from `wavesStore.received` filtered to `wave.status === "pending"` AND not in `wavesStore.viewedWaveIds`. The pings cursor is bumped client-side via `markViewed(waveId)` from `chats.tsx#handlePingPress` — i.e. the moment a user taps a ping row to open the sender's profile. Same number is shown on the sonar pill inside the chats screen, so the tab badge and the in-screen pill stay consistent.
- Pings cursor is **in-memory only** (Set, not persisted) — surviving an app restart re-marks all pending pings as unviewed. This is intentional: a fresh launch should resurface anything still demanding attention.
- Other tabs currently have no badges. If you add one, follow the same pattern: derive in `_layout.tsx`, never duplicate the count in another component, and document the formula here.

**Typography:** InstrumentSerif (Regular, Italic) for headings/display. DM Sans (Regular, Medium, SemiBold) for body. Design system in `apps/mobile/src/theme.ts`.

**Colors:** ink #1A1A1A, bg #FAF7F2, accent #C0392B, rule #D5D0C4, muted #8B8680, mapBg #F0ECE3.

---

## Gotchas

### Conditional `FlatList` / `VirtualizedList` instances must have distinct `key` props

When you render two or more virtualized lists in the same JSX position via ternary or `&&` (e.g. `showPings ? <FlatList pings… /> : <FlatList chats… />`), React reconciliation will **reuse one instance** across branches because the component type matches. If the branches differ in any **mount-time-only** prop — `onViewableItemsChanged`, `viewabilityConfig`, `horizontal`, `inverted`, `keyboardShouldPersistTaps` — React Native's `VirtualizedList` throws:

```
Invariant Violation: Changing onViewableItemsChanged nullability on the fly is not supported
```

In release builds this is **uncatchable** — it fires during render inside the JS microtask drain, the unhandled exception propagates up, and the app dies with SIGABRT (or, on older Hermes, manifests as a confusing SIGSEGV inside `addOwnProperty` / `BoundFunction::create` because the error construction itself corrupts heap state). Native crash reports point at Hermes internals, not at the real JS-level invariant — the only way to see the real cause is to stream device logs via `Console.app`.

**Fix:** give each branch a distinct `key` so React treats them as separate instances (full unmount + remount on filter switch).

```tsx
{showPings ? (
  <FlatList key="pings-list" data={pendingPings} … />        // no onViewableItemsChanged
) : (
  <FlatList key="chats-list" data={conversations}
    onViewableItemsChanged={…} viewabilityConfig={…} … />
)}
```

**Repro history:** crashed reliably in `apps/mobile/app/(tabs)/chats.tsx` whenever a user had pending pings and tapped the sonar pill to switch the chats tab from conversations to pings. Three confirmed production crash reports (Blisko builds 24 + 25) traced back to this single bug before the `key` fix landed.

**Scope check done 2026-04-11:** only `chats.tsx` had the pattern. Other FlatList usages (`(tabs)/index.tsx` nearby list, `chat/[id].tsx` messages, `group/members/[id].tsx`) render a single unconditional instance — safe.

The same reasoning applies to any component with mount-time-only side effects (observers, refs installed in `componentDidMount`, etc.) — if you're about to write `cond ? <X … /> : <X … />` and the two `<X>` instances differ meaningfully, reach for `key`.

Captured as lint-adjacent rule: `.claude/rules/mobile.md#mobile/conditional-flatlist-needs-key`.

### Double-tap send guard in ChatInput

`ChatInput.tsx` disables the send button immediately on press and re-enables after the store's `send()` completes. Without this, a fast double-tap submits two messages because the optimistic insert doesn't block the UI thread — the button remains pressable during the async `send()` call.

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
