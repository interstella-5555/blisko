# Grupy w Blisko

> Dokument designowy — zaprojektowany 2026-02-15, do realizacji w przyszłości.

## Czym są grupy?

Lokalne społeczności wokół miejsc i aktywności. Od 2-osobowej ekipy na padla po 1000-osobową konferencję. Każda grupa ma stały punkt na mapie i jest odkrywana przez bliskość.

### Use case'y

| Rozmiar | Przykład | Główna komunikacja | Odkrywanie |
|---------|----------|-------------------|------------|
| 2-3 | "Poszukam kogoś na padla jutro" | czat | mapa lokalna |
| 5-10 | ekipa RPG, grupa biegowa | czat + okazjonalne ogłoszenia | mapa lokalna |
| 20-50 | klub jogi na Ochocie, sąsiedzi bloku | ogłoszenia + czat | mapa lokalna |
| 50-100 | track na konferencji, "React talks" | ogłoszenia + dyskusja | mapa (venue) |
| 200-1000 | cała konferencja frontendowa | głównie ogłoszenia, czat ograniczony | mapa (venue) |

## Kluczowe decyzje

- **Podejście C** (wybrane): Grupy w profilu + odkrywanie na mapie. Grupy jako markery na mapie obok ludzi, czaty grupowe w zakładce Czaty, "Moje grupy" w zakładce Profil. Bez nowego taba — 4 taby bez zmian.
- **Oba modele odkrywania**: grupy widoczne na mapie + tworzenie z poznanych ludzi
- **Komunikacja**: czat grupowy + przypięte ogłoszenia (wzorowane na Telegramie)
- **Dołączanie**: konfigurowalne (open vs closed)
- **chatMode**: `everyone` (czat otwarty) vs `admins_only` (kanał ogłoszeń, jak Telegram channels)
- **Grupy płaskie** — bez podgrup/hierarchii. Konferencja tworzy kilka osobnych grup w tym samym miejscu.
- **Invite links**: must-have v1 — krytyczne dla konferencji
- **Tylko admini** mogą udostępniać invite linki
- **Architektura**: grupy reużywają istniejący system `conversations` + `conversationParticipants` + `messages` + WebSocket broadcasting. Zero nowej infrastruktury czatu.

## Inspiracje z Telegrama

| Telegram | Opis | Czy dla Blisko? |
|----------|------|----------------|
| **Grupy** (do 200k) | Wszyscy piszą, czat grupowy | Tak — nasz `chatMode: everyone` |
| **Kanały** (broadcast) | Admin pisze, reszta czyta | Tak — nasz `chatMode: admins_only` |
| **Pinned messages** | Wiele przypiętych wiadomości | Tak |
| **Invite links** | Link/QR do dołączenia | Tak — krytyczne dla konferencji |
| **Topics (forum mode)** | Wątki w dużej grupie | Może v2 — fajne, ale złożone |
| **Join requests** | Admin zatwierdza | Tak — nasz `type: closed` |
| **Slow mode** | Limit częstości wysyłania | Może v2 — dla dużych grup |
| **Admin permissions** | Granularne uprawnienia | Uproszczone (admin/member wystarczy na start) |
| **Message reactions** | Emoji reactions | Już mamy w schema! |
| **Media sharing** | Zdjęcia, pliki | v2 (messages.type już obsługuje image) |

**Co warto zaadaptować:**
1. **Invite links** — organizer wysyła link, klikasz → dołączasz. Bez tego konferencyjne use case'y nie działają.
2. **Kanał vs Grupa w jednym** — nasz `chatMode` robi to samo co Telegram "discussion" mode.
3. **Wiele pinned messages** — lista przypiętych, można scrollować. Idealne na ogłoszenia.
4. **Proste dołączanie** — zero wave'ów, zero akceptacji (dla open groups). Niski próg wejścia.

---

## Model danych

### Nowe tabele

**`groups`** — definicja grupy

| Pole | Typ | Opis |
|------|-----|------|
| id | uuid | PK |
| name | text (3-80) | Nazwa grupy |
| description | text (10-500) | Opis |
| avatarUrl | text? | Opcjonalny avatar |
| latitude, longitude | double | Stały punkt na mapie |
| type | 'open' \| 'closed' | Dołączanie: wolne vs na akceptację |
| chatMode | 'everyone' \| 'admins_only' | Kto może pisać |
| inviteCode | text, unique | Kod do invite linka |
| conversationId | FK → conversations | Powiązana konwersacja |
| createdById | FK → user | Założyciel (auto-admin) |
| createdAt, updatedAt | timestamp | |

**`groupMembers`** — członkostwo

| Pole | Typ | Opis |
|------|-----|------|
| groupId | FK → groups | PK (composite) |
| userId | FK → user | PK (composite) |
| role | 'admin' \| 'member' | Rola |
| joinedAt | timestamp | |

**`groupJoinRequests`** — prośby o dołączenie (closed groups)

| Pole | Typ | Opis |
|------|-----|------|
| id | uuid | PK |
| groupId | FK → groups | |
| userId | FK → user | |
| status | 'pending' \| 'accepted' \| 'declined' | |
| createdAt | timestamp | |

### Zmiany w istniejących tabelach

- `messages`: dodać `isPinned: boolean` (default false) — dla ogłoszeń

### Reużycie

conversations, conversationParticipants, messages, messageReactions — cały system czatu i WebSocket broadcasting działa od razu. Pinned messages = ogłoszenia (nie potrzeba osobnego typu `announcement`).

---

## UX — ekrany i flow

### 1. Mapa (tab "W okolicy")
- Grupy jako odrębne markery obok ludzi (inna ikona — np. kółko z ikoną grupy)
- Tap na marker → modal grupy

### 2. Modal grupy (jak modal profilu usera)
- Nazwa, opis, lokalizacja, typ (otwarta/zamknięta)
- Liczba członków + lista członków (avatary)
- Przycisk: "Dołącz" (open), "Poproś o dołączenie" (closed), "Otwórz czat" (jeśli już członek)
- Invite link widoczny tylko dla adminów

### 3. Moje grupy (tab "Profil")
- Lista moich grup pod sekcją profilu
- "Utwórz grupę" → formularz: nazwa, opis, lokalizacja (pick on map), typ, chatMode

### 4. Czaty grupowe (tab "Czaty")
- Konwersacje grupowe na liście obok 1-do-1
- Ikona grupy zamiast avatara, nazwa grupy
- Unread badge działa standardowo

### 5. Ekran czatu grupy
- Sekcja pinned messages na górze (ogłoszenia) — zwijana
- Chat pod spodem (jeśli `chatMode: everyone`)
- Jeśli `admins_only` — czat read-only dla memberów, tylko admini piszą
- Admin: przycisk pin/unpin, usuwanie wiadomości, ustawienia grupy

### 6. Invite link
- Format: deep link w appce (np. `blisko://group/abc123`)
- Admin kopiuje link → wysyła WhatsAppem/mailem → odbiorca otwiera → dołącza (open) lub wysyła request (closed)
- Obsługa: Expo deep linking + web fallback

---

## Role i uprawnienia

| Akcja | Admin | Member |
|-------|-------|--------|
| Pisać w czacie (everyone mode) | Tak | Tak |
| Pisać w czacie (admins_only mode) | Tak | Nie |
| Przypinać wiadomości | Tak | Nie |
| Usuwać wiadomości | Tak | Nie (swoje tak) |
| Udostępniać invite link | Tak | Nie |
| Akceptować join requests | Tak | Nie |
| Usuwać członków | Tak | Nie |
| Edytować info grupy | Tak | Nie |
| Opuścić grupę | Tak | Tak |
| Mianować admina | Tak (założyciel) | Nie |

---

## API (tRPC endpoints)

```
groups/
├── create(name, desc, lat, lng, type, chatMode)
├── getById(groupId)
├── getNearbyGroups(lat, lng, radius)
├── getMyGroups()
├── update(groupId, ...)
├── delete(groupId)
├── join(groupId)  — dla open
├── requestJoin(groupId)  — dla closed
├── respondToRequest(requestId, accept/decline)
├── leave(groupId)
├── removeMember(groupId, userId)
├── getMembers(groupId)
├── getInviteLink(groupId)
├── getByInviteCode(inviteCode)
├── joinByInvite(inviteCode)
├── setRole(groupId, userId, role)
├── pinMessage(messageId)
├── unpinMessage(messageId)
├── getPinnedMessages(conversationId)
├── getJoinRequests(groupId)
```

## WebSocket events (nowe)

| Event | Kiedy | Do kogo |
|-------|-------|---------|
| `groupJoinRequest` | Ktoś prosi o dołączenie | Admini grupy |
| `groupMemberJoined` | Nowy członek | Wszyscy w grupie |
| `groupMemberLeft` | Ktoś wyszedł/usunięty | Wszyscy w grupie |
| `groupUpdated` | Zmiana info/settings | Wszyscy w grupie |

Wiadomości w grupie używają istniejącego `newMessage` event (bo to ta sama konwersacja).

---

## Plan implementacji — 8 faz

### Phase 1: Schema & migracja

**Cel:** Nowe tabele w bazie, pole `isPinned` na messages.

**Modify: `apps/api/src/db/schema.ts`**

Dodać 3 tabele:

- **`groups`**: id (uuid PK), name (varchar 80), description (text), avatarUrl (text?), latitude (real), longitude (real), type ('open'|'closed'), chatMode ('everyone'|'admins_only'), inviteCode (varchar 20, unique), conversationId (FK→conversations), createdById (FK→user), createdAt, updatedAt. Indeksy: location (lat+lng), inviteCode, conversationId.
- **`groupMembers`**: (groupId, userId) composite PK, role ('admin'|'member'), joinedAt. Indeksy: groupId, userId.
- **`groupJoinRequests`**: id (uuid PK), groupId (FK), userId (FK), status ('pending'|'accepted'|'declined'), createdAt. Indeksy: groupId, userId, status.

Dodać do `messages`: `isPinned: boolean` (default false).

Dodać relacje Drizzle dla nowych tabel.

**Migracja:**
```bash
cd apps/api && npx drizzle-kit generate --name=add-groups && npx drizzle-kit migrate
```

---

### Phase 2: API — Core CRUD grup

**Cel:** Tworzenie, odczyt, aktualizacja, usuwanie grup.

**Modify: `packages/shared/src/validators.ts`** — Dodać validatory: `createGroupSchema`, `updateGroupSchema`, `getNearbyGroupsSchema`.

**Create: `apps/api/src/trpc/procedures/groups.ts`** — Nowy router z procedurami:
- `create` — tworzy conversation + group + dodaje creatora jako admin w groupMembers + conversationParticipants. Generuje inviteCode (nanoid 10 znaków).
- `getById` — zwraca grupę + memberCount + rolę aktualnego usera (null jeśli nie członek)
- `getNearbyGroups` — bounding box + Haversine (wzór z `profiles.getNearbyUsersForMap`), zwraca grupy z dystansem i memberCount
- `getMyGroups` — join groupMembers↔groups where userId = ctx.userId, z unread count z konwersacji
- `update` — verify admin, update pola, emit `groupUpdated` WS event
- `delete` — verify creator, cascade delete group + members + requests

**Modify: `apps/api/src/trpc/router.ts`** — Dodać `groups: groupsRouter`.

**Reużycie:**
- Haversine bounding box pattern z `apps/api/src/trpc/procedures/profiles.ts` (getNearbyUsersForMap)
- Grid privacy z `apps/api/src/lib/grid.ts` (toGridCenter)

---

### Phase 3: API — Membership (join/leave/request)

**Cel:** Dołączanie, opuszczanie, zarządzanie członkami.

**Dodać do `apps/api/src/trpc/procedures/groups.ts`:**
- `join` — open groups: insert groupMembers + conversationParticipants, emit `groupMemberJoined`
- `requestJoin` — closed groups: insert groupJoinRequests (pending), emit `groupJoinRequest` do adminów
- `respondToRequest` — admin: accept → dodaj członka, decline → update status
- `leave` — remove z groupMembers + conversationParticipants. Jeśli ostatni admin → promuj najstarszego membera
- `removeMember` — admin only, nie można usunąć creatora
- `getMembers` — lista z profilami i rolami
- `setRole` — admin only, nie można zmienić roli creatora
- `getJoinRequests` — admin only, pending requests z profilami

**Modify: `apps/api/src/ws/events.ts`** — Dodać typy: `groupJoinRequest`, `groupMemberJoined`, `groupMemberLeft`, `groupUpdated`.

**Modify: `apps/api/src/ws/handler.ts`** — Dodać event listeners — iteracja po memberUserIds + `broadcastToUser`. Przy join: subskrybuj nowego członka do konwersacji grupy.

---

### Phase 4: API — Invite links

**Cel:** Admini udostępniają linki, userzy dołączają po kodzie.

**Dodać do `apps/api/src/trpc/procedures/groups.ts`:**
- `getInviteLink` — admin only, zwraca inviteCode + deep link URL
- `getByInviteCode` — public, zwraca basic info grupy (preview)
- `joinByInvite` — input: inviteCode, bypass open/closed, dodaj jako member

---

### Phase 5: Mobile — Czat grupowy

**Cel:** Konwersacje grupowe w zakładce Czaty, chatMode enforcement, pinned messages.

**Modify: `apps/api/src/trpc/procedures/messages.ts`**
- `getConversations` — wykryj grupowe konwersacje (lookup w tabeli `groups` po conversationId), zwróć `isGroup` flag + group info
- `send` — chatMode enforcement: jeśli grupa + admins_only → verify admin w groupMembers
- Dodać `pinMessage` / `unpinMessage` procedury (admin only)
- Dodać `getPinnedMessages` — zwraca pinned messages dla konwersacji

**Modify: `apps/mobile/src/components/chat/ConversationRow.tsx`** — Obsługa `isGroup`: ikona grupy zamiast avatara, nazwa grupy zamiast imienia.

**Modify: `apps/mobile/app/(modals)/chat/[id].tsx`**
- Header: nazwa grupy + member count (zamiast imienia osoby), ikona info → group detail
- Messages: `senderName` nad bąbelkami od innych (w grupach)
- Pinned bar: zwijany pasek z ostatnim pinned message
- chatMode: disable ChatInput jeśli admins_only i nie-admin

**Modify: `apps/mobile/src/components/chat/MessageBubble.tsx`** — Dodać `showSenderName` prop — wyświetla imię nadawcy nad bąbelkiem.

---

### Phase 6: Mobile — Group detail modal + moje grupy

**Cel:** Pełne zarządzanie grupami w appce.

**Create: `apps/mobile/app/(modals)/group/[groupId].tsx`** — Modal grupy: nazwa, opis, avatar, mini-mapa lokalizacji, member count, join/leave, admin section (edit, requests, invite link, members).

**Create: `apps/mobile/app/(modals)/group/members/[groupId].tsx`** — Lista członków z rolami. Admini: long-press → remove/promote/demote.

**Create: `apps/mobile/app/(modals)/group/create.tsx`** — Formularz: nazwa, opis, typ (open/closed), chatMode, location picker (drag na mapie).

**Create: `apps/mobile/app/(modals)/group/edit/[groupId].tsx`** — Jak create ale pre-filled. Admin only.

**Create: `apps/mobile/app/(modals)/group/invite/[code].tsx`** — Ekran invite: preview grupy + przycisk "Dołącz".

**Modify: `apps/mobile/app/(modals)/_layout.tsx`** — Stack.Screen entries dla nowych group routes.

**Modify: `apps/mobile/app/(tabs)/profile.tsx`** — Sekcja "Moje grupy" — lista grup z `groups.getMyGroups`, przycisk "Utwórz grupę".

**Create: `apps/mobile/src/components/groups/GroupRow.tsx`** — Reużywalny row: nazwa, memberCount, dystans, typ, rola.

---

### Phase 7: Mobile — Grupy na mapie

**Cel:** Markery grup na mapie W okolicy.

**Modify: `apps/mobile/app/(tabs)/index.tsx`** — Dodać `trpc.groups.getNearbyGroups.useQuery()`. Sekcja "Grupy w pobliżu" — horizontal scroll z kartami grup nad listą ludzi.

**Modify: `apps/mobile/src/components/nearby/NearbyMapView.tsx`** — Prop `groups`. Renderuj odrębne markery dla grup (inna ikona niż user clusters).

**Create: `apps/mobile/src/components/nearby/GroupMapMarker.tsx`** — Marker grupy: ikona grupy + member count.

**Create: `apps/mobile/src/components/groups/GroupCard.tsx`** — Kompaktowa karta do horizontal scroll: nazwa, members, dystans, typ.

---

### Phase 8: Notifications & deep linking & polish

**Modify: `apps/mobile/src/hooks/useInAppNotifications.ts`** — Handlery: groupJoinRequest ("X chce dołączyć do Y"), groupMemberJoined ("X dołączył do Y").

**Modify: `apps/mobile/src/lib/ws.ts`** — Nowe typy WSMessage dla group events.

**Deep linking setup** — Expo Router linking config dla `blisko://group/invite/{code}`. UseURL hook w `_layout.tsx`.

**Modify: `apps/mobile/app/(tabs)/_layout.tsx`** — WS handler dla group events → invalidacja queries.

---

## Ścieżka krytyczna

```
Phase 1 (schema) → Phase 2 (CRUD) → Phase 3 (membership) → Phase 5 (chat)
                                    ↘ Phase 4 (invite links)
                                    ↘ Phase 6 (mobile modals) → Phase 7 (mapa) → Phase 8 (polish)
```

Phase 3 + Phase 6 mogą częściowo iść równolegle (API + scaffolding mobile).
Phase 4, 5, 6 mogą iść równolegle po Phase 3.

## Weryfikacja (po implementacji)

1. **Schema**: `npx drizzle-kit migrate` — tabele istnieją, app działa
2. **API CRUD**: dev-cli lub tRPC calls — create group, getMyGroups, getNearbyGroups
3. **Membership**: join/leave flow, closed group request/respond
4. **Invite links**: wygeneruj link, otwórz w symulatorze, dołącz
5. **Chat grupowy**: 3+ memberów, wysyłanie wiadomości, sender names, pin messages, admins_only mode
6. **Mobile**: pełny flow — stwórz grupę z profilu → widoczna na mapie → inny user dołącza → czat grupowy działa → invite link działa
