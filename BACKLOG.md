# Meet - Backlog i Milestony

## Zasady Pracy

### Definicja Ukończenia (Definition of Done)
1. ✅ Kod napisany i działa
2. ✅ Testy napisane i przechodzą (Vitest/Maestro)
3. ✅ Brak błędów TypeScript
4. ✅ Lint przechodzi

### Konwencja Testów
- **Unit tests (Vitest)**: Logika biznesowa, utils, tRPC procedures
- **E2E tests (Maestro)**: Krytyczne ścieżki użytkownika

---

## Milestone 0: Monorepo Setup
**Cel**: Skonfigurowane środowisko z monorepo, backend i mobile

### M0.1 - Inicjalizacja Monorepo
```bash
mkdir meet && cd meet
pnpm init
```

**Pliki do utworzenia**:
- `pnpm-workspace.yaml`
- `package.json` (root)
- `turbo.json`
- `.gitignore`

**Kryteria akceptacji**:
- [ ] pnpm workspaces działa
- [ ] `pnpm install` przechodzi

---

### M0.2 - Backend (apps/api)
**Opis**: Hono + tRPC + Drizzle skeleton

**Pliki**:
- `apps/api/package.json`
- `apps/api/src/index.ts` - Hono entry
- `apps/api/src/trpc/router.ts`
- `apps/api/src/trpc/context.ts`
- `apps/api/src/db/schema.ts`
- `apps/api/Dockerfile`

**Test**:
```typescript
// apps/api/__tests__/health.test.ts
describe('Health endpoint', () => {
  it('returns ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });
});
```

**Kryteria akceptacji**:
- [ ] `pnpm --filter api dev` startuje serwer
- [ ] `/health` zwraca 200
- [ ] tRPC router działa

---

### M0.3 - Mobile (apps/mobile)
**Opis**: Expo z TypeScript i Expo Router

```bash
cd apps
npx create-expo-app mobile -t expo-template-blank-typescript
```

**Pliki**:
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/app/(auth)/_layout.tsx`
- `apps/mobile/app/(tabs)/_layout.tsx`
- `apps/mobile/src/lib/trpc.ts`
- `apps/mobile/src/lib/supabase.ts`

**E2E Test**:
```yaml
# apps/mobile/.maestro/setup/app-launches.yaml
appId: com.meet.app
---
- launchApp
- assertVisible: "Meet"
```

**Kryteria akceptacji**:
- [ ] `pnpm --filter mobile start` uruchamia Expo
- [ ] Expo Router działa
- [ ] Route groups skonfigurowane

---

### M0.4 - Shared Package
**Opis**: Współdzielone typy i walidatory

**Pliki**:
- `packages/shared/package.json`
- `packages/shared/src/types.ts`
- `packages/shared/src/validators.ts`

**Kryteria akceptacji**:
- [ ] Import działa z `@meet/shared`

---

### M0.5 - Supabase Setup
**Opis**: Projekt Supabase (tylko DB, Auth, Realtime)

**Do zrobienia**:
1. Utworzyć projekt na supabase.com
2. Włączyć extensions: `uuid-ossp`, `postgis`, `vector`
3. Uruchomić migracje Drizzle
4. Skonfigurować Realtime dla `messages`
5. Utworzyć bucket `avatars`

**Kryteria akceptacji**:
- [ ] Połączenie z Supabase działa
- [ ] Extensions włączone
- [ ] Tabele utworzone

---

### M0.6 - Railway Setup
**Opis**: Deploy backendu na Railway

**Do zrobienia**:
1. Utworzyć projekt Railway (przez MCP)
2. Podłączyć repo GitHub
3. Skonfigurować env variables
4. Deploy

**Kryteria akceptacji**:
- [ ] Backend dostępny pod URL
- [ ] `/health` zwraca 200

---

### M0.7 - Vitest Setup
**Pliki**:
- `vitest.config.ts` (root)
- `apps/api/vitest.config.ts`
- `apps/mobile/vitest.config.ts`

**Kryteria akceptacji**:
- [ ] `pnpm test` uruchamia wszystkie testy
- [ ] Testy przechodzą

---

## Milestone 1: Autentykacja
**Cel**: Email magic link login przez Supabase Auth

### M1.1 - Login Screen
**Pliki**:
- `apps/mobile/app/(auth)/login.tsx`
- `apps/mobile/src/components/ui/Input.tsx`
- `apps/mobile/src/components/ui/Button.tsx`

**E2E**:
```yaml
# .maestro/auth/login.yaml
- launchApp
- assertVisible: "Zaloguj się"
- tapOn: { id: "email-input" }
- inputText: "test@example.com"
- tapOn: "Wyślij link"
- assertVisible: "Sprawdź email"
```

---

### M1.2 - Auth State Management
**Pliki**:
- `apps/mobile/src/stores/authStore.ts`
- `apps/mobile/app/_layout.tsx` (auth listener)

**Test**:
```typescript
describe('authStore', () => {
  it('stores session after login', () => {
    // ...
  });
});
```

---

### M1.3 - Protected Routes
**Opis**: Redirect niezalogowanych do login

**Kryteria akceptacji**:
- [ ] Niezalogowany → `/login`
- [ ] Zalogowany bez profilu → `/onboarding`
- [ ] Zalogowany z profilem → `/(tabs)`

---

## Milestone 2: Profil
**Cel**: Tworzenie i edycja profilu

### M2.1 - Create Profile Screen
**Pliki**:
- `apps/mobile/app/onboarding.tsx`
- `apps/api/src/trpc/procedures/profiles.ts`

**tRPC endpoint**: `profiles.create`

---

### M2.2 - Edit Profile Screen
**Pliki**:
- `apps/mobile/app/(tabs)/profile.tsx`

**tRPC endpoint**: `profiles.update`

---

### M2.3 - Avatar Upload
**Opis**: Upload do Supabase Storage

**Kryteria akceptacji**:
- [ ] Wybór z galerii
- [ ] Upload do bucket `avatars`
- [ ] URL zapisany w profilu

---

### M2.4 - AI Embeddings
**Opis**: Generowanie embeddingów po zapisie profilu

**Plik**: `apps/api/src/services/ai.ts`

**tRPC**: Po `profiles.update` → generate embedding

---

## Milestone 3: Geolokalizacja
**Cel**: Tracking lokalizacji i wyszukiwanie w okolicy

### M3.1 - Location Permission
**Pliki**:
- `apps/mobile/src/hooks/useLocation.ts`
- `apps/mobile/src/stores/locationStore.ts`

---

### M3.2 - Nearby Users Query
**tRPC endpoint**: `profiles.getNearbyUsers`

**Test**:
```typescript
describe('getNearbyUsers', () => {
  it('returns users within radius', async () => {
    // ...
  });
});
```

---

### M3.3 - Nearby Users Screen
**Plik**: `apps/mobile/app/(tabs)/index.tsx`

**E2E**:
```yaml
- launchApp
- assertVisible: "Osoby w okolicy"
```

---

## Milestone 4: Interakcje
**Cel**: Wave / Wave Back / Block

### M4.1 - User Profile Modal
**Plik**: `apps/mobile/app/(modals)/user/[id].tsx`

---

### M4.2 - Wave Action
**tRPC endpoint**: `interactions.wave`

---

### M4.3 - Waves Received Screen
**Plik**: `apps/mobile/app/(tabs)/waves.tsx`

**tRPC endpoint**: `interactions.getReceivedWaves`

---

### M4.4 - Wave Back Action
**tRPC endpoint**: `interactions.waveBack`

**Logika**: Tworzy konwersację

---

### M4.5 - Block Action
**tRPC endpoint**: `interactions.block`

---

## Milestone 5: Chat
**Cel**: Real-time messaging przez Supabase Realtime

### M5.1 - Conversations List
**Plik**: `apps/mobile/app/(tabs)/chats.tsx`

**tRPC endpoint**: `messages.getConversations`

---

### M5.2 - Chat Screen
**Plik**: `apps/mobile/app/(modals)/chat/[id].tsx`

**Supabase Realtime**: Subscribe to `messages` table

---

### M5.3 - Send Message
**tRPC endpoint**: `messages.send`

---

### M5.4 - Typing Indicator
**Supabase Presence**: Track typing state

---

## Milestone 6: Push Notifications
**Cel**: Powiadomienia o wave, message

### M6.1 - Push Token Registration
**Pliki**:
- `apps/mobile/src/hooks/useNotifications.ts`
- `apps/api/src/trpc/procedures/push.ts`

---

### M6.2 - Send Push on Wave
**Plik**: `apps/api/src/services/push.ts`

---

### M6.3 - Send Push on Message
**Trigger**: Po INSERT do `messages`

---

## Milestone 7: Polish
**Cel**: UX improvements przed beta

### M7.1 - Onboarding Flow
### M7.2 - Empty States
### M7.3 - Error Handling
### M7.4 - Loading States

---

## Milestone 8: Beta Release
**Cel**: TestFlight / Internal Testing

### M8.1 - App Store Assets
### M8.2 - EAS Build Production
### M8.3 - TestFlight Upload

---

## Priorytetyzacja

| Priorytet | Milestones |
|-----------|------------|
| **Must Have (MVP)** | M0, M1, M2, M3, M4, M5 |
| **Should Have (Beta)** | M6, M7, M8 |
| **Could Have (v2)** | Grupy, Phone Auth |

---

## Estymacja

| Milestone | Czas |
|-----------|------|
| M0: Setup | 1 dzień |
| M1: Auth | 1 dzień |
| M2: Profil | 2 dni |
| M3: Geo | 1 dzień |
| M4: Interakcje | 2 dni |
| M5: Chat | 2 dni |
| M6: Push | 1 dzień |
| M7: Polish | 2 dni |
| **MVP Total** | **~12 dni** |
