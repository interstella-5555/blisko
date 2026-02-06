# Blisko — Backlog

Remaining work, grouped by area. Auth, profiles, geolocation, waves, and the design book are done.

---

## Chat

Backend is complete — tRPC procedures for conversations, messages, sending, read receipts, pagination, and unread counts all exist.

Frontend TODO:

- [ ] Conversation list screen — wire up `messages.getConversations` (stub screen exists at `(tabs)/chats.tsx`)
- [ ] Chat screen — create `(modals)/chat/[id].tsx` (directory exists but is empty)
- [ ] Wire up message sending and read receipts
- [ ] Real-time updates (polling, WebSocket, or tRPC subscriptions)

## Push Notifications

DB table exists and `expo-notifications` dependency is installed, but there is zero implementation.

- [ ] Register push tokens (`useNotifications` hook — `src/hooks/` is empty)
- [ ] Send push on wave received / accepted
- [ ] Send push on new message
- [ ] Handle notification tap → deep link to wave/chat

## User Profile Modal

Directory at `(modals)/user/[id]` exists but is empty — no screen file yet.

- [ ] Create `(modals)/user/[id].tsx`
- [ ] Show full profile (name, bio, lookingFor, distance)
- [ ] Wave / block actions

## Avatar Upload

Schema has `avatarUrl` on profiles but no storage integration.

- [ ] Pick image from gallery
- [ ] Upload to object storage (S3, R2, or similar)
- [ ] Save URL to profile

## Polish & UX

**Done:**
- Empty states for all major screens (waves, chats, nearby, permission denied)
- Error handling with `Alert.alert` and retry UI
- Loading indicators (`ActivityIndicator` on all screens)

**Still TODO:**
- [ ] Loading skeletons / shimmer effects
- [ ] Onboarding flow refinements

## Beta Release

- [ ] App Store assets (icon, screenshots, description)
- [ ] EAS production build configuration
- [ ] TestFlight / internal testing distribution

## Future Ideas

- Groups / shared interests matching
- Phone number auth (alternative to magic link)
- Profile verification
- Report system
