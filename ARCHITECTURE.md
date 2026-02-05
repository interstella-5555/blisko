# Meet - Architektura Techniczna

## Przegląd Stosu Technologicznego

```
┌─────────────────────────────────────────────────────────────────┐
│                     KLIENT MOBILNY                               │
├─────────────────────────────────────────────────────────────────┤
│  React Native + Expo SDK 54                                      │
│  TypeScript                                                      │
│  Expo Router v3 (file-based routing)                            │
│  Zustand v5 (state management)                                  │
│  @trpc/react-query (type-safe API)                              │
│  Better Auth (authentication)                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     RAILWAY BACKEND                              │
├─────────────────────────────────────────────────────────────────┤
│  Hono (web framework)                                            │
│  tRPC (type-safe API)                                           │
│  Better Auth (authentication)                                    │
│  Drizzle ORM                                                    │
│  OpenAI API (embeddings)                                        │
│  Expo Push API                                                  │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     RAILWAY POSTGRESQL                           │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL + pgvector (similarity search)                      │
└─────────────────────────────────────────────────────────────────┘
```

### Podział Odpowiedzialności

| Komponent | Technologia |
|-----------|-------------|
| **Auth** | Better Auth (magic link email) |
| **Database** | Railway PostgreSQL + Drizzle ORM |
| **API** | Hono + tRPC |
| **AI** | OpenAI embeddings |
| **Push** | Expo Push API |

---

## Decyzje Technologiczne

| Warstwa | Technologia | Uzasadnienie |
|---------|-------------|--------------|
| Mobile | React Native + Expo SDK 54 | Cross-platform |
| Routing | Expo Router v3 | File-based routing |
| State | Zustand v5 | Prostszy niż Redux |
| **Backend** | **Hono** | Ultraszybki, Web Standards |
| **API** | **tRPC** | End-to-end type safety |
| **ORM** | **Drizzle** | Type-safe, PostgreSQL native |
| **Auth** | **Better Auth** | Self-hosted, magic link |
| **Database** | **Railway PostgreSQL** | Managed, pgvector |
| **Testy** | **Vitest** + Maestro | Natywne TS + E2E |

---

## Struktura Monorepo

```
/meet
├── apps/
│   ├── mobile/                    # Expo app (React Native)
│   │   ├── app/                   # Expo Router routes
│   │   │   ├── (auth)/
│   │   │   │   ├── _layout.tsx
│   │   │   │   ├── login.tsx
│   │   │   │   └── verify.tsx
│   │   │   ├── onboarding/
│   │   │   │   ├── index.tsx      # Step 1: Name
│   │   │   │   ├── bio.tsx        # Step 2: Bio
│   │   │   │   └── looking-for.tsx # Step 3: Looking for
│   │   │   ├── (tabs)/
│   │   │   │   ├── _layout.tsx
│   │   │   │   ├── index.tsx      # Osoby w okolicy
│   │   │   │   ├── waves.tsx      # Zaczepienia
│   │   │   │   ├── chats.tsx      # Lista czatów
│   │   │   │   └── profile.tsx    # Profil
│   │   │   ├── (modals)/
│   │   │   │   ├── user/[id].tsx
│   │   │   │   └── chat/[id].tsx
│   │   │   └── _layout.tsx
│   │   │
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── trpc.ts        # tRPC client
│   │   │   │   └── auth.ts        # Better Auth client
│   │   │   ├── stores/
│   │   │   │   ├── authStore.ts
│   │   │   │   ├── locationStore.ts
│   │   │   │   └── onboardingStore.ts
│   │   │   └── hooks/
│   │   │
│   │   ├── .maestro/              # E2E tests
│   │   └── package.json
│   │
│   └── api/                       # Hono backend (Railway)
│       ├── src/
│       │   ├── index.ts           # Hono entry
│       │   ├── auth.ts            # Better Auth setup
│       │   ├── trpc/
│       │   │   ├── router.ts      # Main router
│       │   │   ├── context.ts     # Auth context
│       │   │   └── procedures/
│       │   │       ├── profiles.ts
│       │   │       ├── waves.ts
│       │   │       └── messages.ts
│       │   └── db/
│       │       ├── index.ts       # Drizzle client
│       │       └── schema.ts      # Drizzle schema
│       │
│       ├── drizzle/
│       │   └── migrations/
│       └── package.json
│
├── packages/
│   └── shared/                    # Shared types/validators
│
├── .github/
│   └── workflows/
│       └── e2e-tests.yml
│
├── pnpm-workspace.yaml
├── package.json
└── turbo.json
```

---

## Environment Variables

### Backend (apps/api/.env)

```bash
# Server
PORT=3000

# Database (Railway PostgreSQL)
DATABASE_URL=postgresql://user:pass@host:5432/railway

# Better Auth
BETTER_AUTH_SECRET=your-secret
BETTER_AUTH_URL=https://your-api.up.railway.app

# Email (Resend)
RESEND_API_KEY=re_xxx

# OpenAI (for embeddings)
OPENAI_API_KEY=sk-xxx

# Development
ENABLE_DEV_LOGIN=true  # Enable @example.com auto-login
```

### Mobile (apps/mobile/.env.local)

```bash
EXPO_PUBLIC_API_URL=https://your-api.up.railway.app
```

---

## Development Workflow

```bash
# Start all services
pnpm dev

# Mobile only
pnpm --filter mobile start

# API only
pnpm --filter api dev

# Run E2E tests
pnpm --filter mobile test:e2e

# Database migrations
pnpm --filter api db:push
```

---

## Koszty

### POC/Development

| Usługa | Koszt/miesiąc |
|--------|---------------|
| Railway (API + DB) | ~$5 |
| OpenAI | ~$0 (pay-per-use) |
| Resend | Free tier |
| **Razem** | **~$5** |

### Produkcja (~10k users)

| Usługa | Koszt/miesiąc |
|--------|---------------|
| Railway Pro | ~$20 |
| OpenAI | ~$10 |
| Resend | ~$20 |
| **Razem** | **~$50** |
