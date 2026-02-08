# Blisko — Backlog

Remaining work, grouped by area. Auth, profiles, geolocation, waves, chat, and the design book are done.

---

## Chat — DONE

Full chat implementation complete:

- [x] Conversation list screen with unread badges, relative time, last message preview
- [x] Chat screen with infinite scroll, keyboard avoidance, inverted FlatList
- [x] Message sending with optimistic updates (onMutate/onError/onSettled)
- [x] Read receipts — single check (sent) / double check (read)
- [x] Reply/quote — long-press menu, reply bar above input, quoted message in bubble
- [x] Soft delete — "Wiadomość usunięta" placeholder
- [x] Emoji reactions — 6-emoji picker, toggle, grouped chips under bubbles
- [x] Image messages — expo-image-picker, upload to /uploads endpoint, preview in bubble
- [x] Location messages — expo-location, pin icon, tap opens native maps
- [x] Real-time WebSocket — Bun native WS, EventEmitter pub/sub, auto-reconnect
- [x] Typing indicators — debounced WS messages, "pisze..." display
- [x] Message search — ILIKE search, search bar in chat header
- [x] Tab bar unread badge
- [x] Design book mockups (ChatList + ChatConversation screens)

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
