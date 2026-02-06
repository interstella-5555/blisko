# Blisko — Connecting People with Shared Interests Nearby

## Product Vision

**Blisko** is a mobile app (iOS/Android) that lets users discover and connect with people who share their interests and happen to be nearby. Unlike dating apps, Blisko focuses on building relationships around shared passions — whether it's walking dogs, bowling, cycling, or reading Stanislaw Lem novels.

---

## Core Features

### 1. User Profile

#### Free-Text Fields
Instead of long forms, users fill in **three free-text fields**:

- **Display name** (2–50 characters)
- **"Who I am, what I like to do"** (`bio`, 10–500 characters) — a free-form self-description
  > *Example: "I'm Karol, 32. I have a golden retriever named Max. I like running in the park, I bowl on weekends, and in the evenings I read sci-fi — mostly Lem and Asimov."*
- **"What I'm looking for"** (`lookingFor`, 10–500 characters) — what the user wants from others
  > *Example: "Looking for people to walk dogs with — Max loves company. I'd also enjoy casual bowling. Would be great to chat about sci-fi books too."*

An `avatarUrl` field exists in the schema but is not yet used in the UI.

#### AI-Powered Matching
The system uses OpenAI (`text-embedding-3-small`) to generate an embedding vector from the combined bio and lookingFor text. This embedding powers similarity-based matching — nearby users are ranked by cosine similarity so the most relevant people appear first.

### 2. Authentication

Blisko uses **Better Auth** with the **email OTP** plugin:

1. User enters their email address
2. A 6-digit one-time code is sent via **Resend**
3. User enters the code (or taps the deep link) and is logged in
4. Sessions are stored securely via Expo SecureStore

No passwords, no phone numbers — just email magic links.

### 3. Nearby Discovery

#### Map + Bottom Sheet
The main screen shows a map (react-native-maps) with user clusters and a gesture-driven bottom sheet:

- **Map view**: clusters of nearby users, grouped by ~500m grid cells for privacy
- **Bottom sheet**: swipe up to see a list of nearby users sorted by distance
- Tap a cluster to filter the list to users in that area
- Each user row shows display name, distance (rounded to 100m), and a wave button

#### Location Privacy
Exact coordinates are never exposed to other users. The system uses **grid snapping** (~500m cells):

- `toGridCenter()` snaps lat/lng to the center of a grid cell
- Distance is rounded to the nearest 100m to prevent triangulation
- Separate API endpoints: one returns grid positions for the map, another returns distance + similarity scores for the list

### 4. Waves

The "wave" system is how users initiate contact:

1. **Send a wave**: user taps the wave button on someone's profile, optionally with a message
2. **Receive notification**: the recipient sees the wave in their waves tab
3. **Respond**: the recipient can:
   - **Accept** — a 1:1 conversation is automatically created
   - **Decline** — the wave is dismissed; the sender is not notified
   - **Block** — the sender can never contact this user again
4. **Unblock**: users can unblock from settings

Duplicate waves are prevented. Blocking auto-declines any pending waves and prevents contact in both directions.

The waves screen has two tabs: received (pending) and sent (with status tracking).

### 5. Chat

#### Backend (fully implemented)
- tRPC procedures for sending messages, fetching conversations, cursor-based message pagination
- Read status tracking (`readAt` timestamp)
- Unread message count per conversation
- Conversations are created automatically when a wave is accepted

#### Current limitations
- **Text only** — no images or media
- **No real-time updates** — standard HTTP polling, no WebSockets or SSE
- **No typing indicators** — the store structure exists but is unused
- Frontend chat UI is a stub screen

### 6. Push Notifications

A `pushTokens` table exists in the database (userId, token, platform), and `expo-notifications` is a dependency — but there is no actual push sending logic yet. Wave acceptance, new messages, and other events have `// TODO: Send push notification` markers in the backend code.

---

## Planned Features

The following features are part of the product vision but not yet built:

- **Filters** — gender, age range, interests (tags), dog owners, verified profiles
- **Avatar upload & photo gallery** — the `avatarUrl` field exists but upload and display are not implemented
- **AI tags & profile summary** — extract interest tags and a short summary from the bio text (currently only embeddings are generated)
- **Push notifications** — send notifications for waves, messages, and proximity alerts (table exists, logic pending)
- **Real-time chat** — WebSocket or SSE-based live message delivery
- **Chat media** — image/photo sharing in conversations
- **Typing indicators** — show "typing..." status in chat
- **Groups** — public/private groups with admin roles, group chat, and discovery based on member proximity
- **Smart proximity notifications** — alert users when a high-match person is nearby, with cooldown rules (moved >500m, >1h since last alert)
- **Anonymous browsing mode** — view aggregate stats ("4 dog owners nearby") without logging in

---

## Use Cases

### UC1: Dog Walk
**Actor**: Karol (golden retriever owner)

1. Karol opens the app in the park
2. He sees that Anna with a labrador is 300m away
3. He taps "Wave" on Anna's profile
4. Anna gets a notification and accepts
5. They arrange a walk through chat
6. The dogs play, the owners talk

### UC2: Weekend Bowling
**Actor**: Adam (bowling fan)

1. Adam is looking for people to bowl with
2. He sets a filter for the "bowling" interest
3. He finds a group called "Bowling Warsaw Wola"
4. He sends a request to join
5. The admin approves
6. Adam joins the group chat and arranges the next game

### UC3: New City, New Friends
**Actor**: Maja (new in town)

1. Maja just moved to Krakow
2. She fills in her profile: likes running, books, coffee
3. The app shows nearby people and groups
4. Maja finds a running group "Parkrun Krakow"
5. She joins and meets local runners

### UC4: Chance Encounter at the Mall
**Actor**: Tomek (sci-fi fan)

1. Tomek goes to a shopping mall
2. He gets a notification: "Someone nearby also reads Lem!"
3. He opens the app and sees Kasia (~50m away)
4. He waves at Kasia, she accepts
5. They meet for coffee at the mall

### UC5: Organizing a Football Match
**Actor**: Piotr (football group admin)

1. Piotr creates a group "Sunday Kickabout Ursynow"
2. He sets it to public
3. People nearby see the group when they're close to Ursynow
4. 15 people join within a week
5. Piotr organizes the first match through the group chat

---

## Safety & Privacy

### Location Protection
- **Exact location is never shared** — positions are snapped to ~500m grid cells
- Distance is rounded to the nearest 100m to prevent triangulation
- Users can hide themselves temporarily (invisible mode — planned)

### Moderation
- Blocking system (one-way, prevents all contact)
- Reporting system (planned)
- AI chat moderation (planned)

### User Data
- GDPR compliance (planned)
- Data export (planned)
- Full account and data deletion (planned)

---

## Future Ideas

1. **Events & Meetups** — create events with date, time, and place; RSVP tracking
2. **Achievements & Gamification** — badges for activity ("First walk", "10 meetups", "Popular profile"), user levels
3. **Calendar Integration** — sync meetups with phone calendar, reminders
4. **Place Recommendations** — AI suggests meeting spots ("For a dog walk, try Skaryszewski Park — 2km from you")
5. **Schedule-Based Matching** — users share availability; system connects people with matching routines ("Adam also runs mornings in this park!")
6. **Video Verification** — optional short video to verify identity, builds trust
7. **Stories / Status Updates** — short posts like "I'm in the park with my dog right now, anyone want to join?" visible to nearby users for 24h
8. **Reputation System** — post-meetup feedback ("Great walk! The dogs got along"), builds community trust
9. **Fitbit / Apple Health Integration** — detect activity automatically ("Karol is running in the park — want to join?")
10. **"I'm Here" Mode** — broadcast to nearby users: "I'm at cafe X, happy to chat" for spontaneous meetups

---

## Success Metrics (KPIs)

### Engagement
- DAU/MAU ratio
- Average waves per user per week
- Wave-to-accept conversion rate
- Average messages per conversation

### Retention
- D1, D7, D30 retention
- % of users with a complete profile
- % of users in at least one group

### Growth
- New users per week
- Virality (average invites per user)

### Satisfaction
- App Store rating
- NPS score
- % of users who arranged a meetup

---

## Monetization (Future)

### Freemium Model
**Free**:
- Browse 10 people per day
- 1 wave per day
- Membership in 3 groups

**Premium** (~29 PLN/month):
- Unlimited browsing
- Unlimited waves
- Unlimited groups
- See who viewed your profile
- Priority in results
- No ads

### Additional Revenue
- Promoted profiles
- Local ads (cafes, gyms, etc.)
- Partnerships with event organizers

---

## Competition

| App | Focus | How Blisko Differs |
|-----|-------|--------------------|
| Bumble BFF | Friends | Less location-driven, more "swipe"-based |
| Meetup | Events | Larger groups, less spontaneous |
| Nextdoor | Neighbors | Neighborhood focus, not interest-based |
| Tinder | Dating | Romantic focus |

**Blisko's unique value**: Combining real-time location with AI-powered interest matching for spontaneous, informal meetups.
