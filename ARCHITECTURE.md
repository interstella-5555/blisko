# Blisko — Architecture

## Stack Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        MOBILE CLIENT                            │
├─────────────────────────────────────────────────────────────────┤
│  React Native 0.81 + Expo SDK 54                                │
│  Expo Router v6 (file-based routing)                            │
│  TypeScript · Zustand v5 · tRPC client · Better Auth client     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API SERVER                               │
├─────────────────────────────────────────────────────────────────┤
│  Hono (web framework) · tRPC (type-safe API)                    │
│  Better Auth (magic link) · Drizzle ORM                         │
│  OpenAI (embeddings) · Resend (email) · Expo Push API           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     RAILWAY POSTGRESQL                           │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL (embeddings stored as float arrays)                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      DESIGN BOOK (web)                           │
├─────────────────────────────────────────────────────────────────┤
│  React 19 · TanStack Start · Tailwind CSS 4 · Vite 7           │
│  13 design variants · component gallery · screenshot mode       │
└─────────────────────────────────────────────────────────────────┘
```

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Mobile | React Native + Expo SDK 54 | Cross-platform app |
| Routing | Expo Router v6 | File-based navigation |
| State | Zustand v5 | Client state management |
| Backend | Hono ^4.5 | HTTP framework |
| API | tRPC v11 | End-to-end type safety |
| ORM | Drizzle ^0.45 | Type-safe PostgreSQL access |
| Auth | Better Auth ^1.4 | Self-hosted magic link email |
| Database | Railway PostgreSQL | Managed Postgres |
| Email | Resend | Transactional email |
| AI | OpenAI | Profile embeddings |
| Design | TanStack Start + Tailwind | Design system gallery |
| Tests | Vitest + Maestro | Unit + E2E |

---

## Monorepo Structure

```
blisko/
├── apps/
│   ├── mobile/                     # Expo app (React Native)
│   │   ├── app/                    # Expo Router routes
│   │   │   ├── (auth)/             # login, verify
│   │   │   ├── onboarding/         # name, bio, looking-for
│   │   │   └── (tabs)/             # nearby, waves, chats, profile
│   │   ├── src/
│   │   │   ├── components/         # UI + feature components
│   │   │   ├── hooks/
│   │   │   ├── lib/                # trpc client, auth client
│   │   │   ├── stores/             # Zustand (auth, chat, location, onboarding)
│   │   │   ├── types/
│   │   │   └── utils/
│   │   └── .maestro/               # E2E tests
│   │
│   ├── api/                        # Hono backend (Railway)
│   │   ├── src/
│   │   │   ├── index.ts            # Hono entry
│   │   │   ├── auth.ts             # Better Auth config
│   │   │   ├── trpc/
│   │   │   │   ├── router.ts
│   │   │   │   ├── context.ts
│   │   │   │   └── procedures/     # profiles, waves, messages
│   │   │   ├── db/
│   │   │   │   └── schema.ts       # Drizzle schema
│   │   │   └── services/
│   │   │       └── ai.ts           # OpenAI embeddings
│   │   └── drizzle/
│   │       └── migrations/
│   │
│   └── design/                     # Design book (web, TanStack Start)
│       ├── src/
│       │   ├── routes/             # design-book, proposals
│       │   ├── components/
│       │   │   └── design-book/    # Screens, FormElements, Typography, etc.
│       │   └── variants/           # 13 design variants (v1-*, v2-*)
│       └── content/                # Content collections
│
├── packages/
│   └── shared/                     # Shared types + Zod validators
│
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `user` | Accounts (Better Auth managed) |
| `session` | Sessions (Better Auth managed) |
| `account` | Auth providers (Better Auth managed) |
| `verification` | Email verification tokens |
| `profiles` | Display name, bio, lookingFor, avatar URL, embedding, location |
| `waves` | Wave requests (from → to, message, status) |
| `conversations` | Chat conversations |
| `conversationParticipants` | Conversation membership |
| `messages` | Chat messages |
| `blocks` | User block list |
| `pushTokens` | Expo push notification tokens |

---

## Environment Variables

### Backend (`apps/api/.env`)

```bash
DATABASE_URL=postgresql://...       # Railway PostgreSQL
BETTER_AUTH_SECRET=...              # Auth secret
BETTER_AUTH_URL=...                 # API base URL
RESEND_API_KEY=...                  # Transactional email
OPENAI_API_KEY=...                  # Profile embeddings
ENABLE_DEV_LOGIN=true               # @example.com auto-login (dev only)
```

### Mobile (`apps/mobile/.env.local`)

```bash
EXPO_PUBLIC_API_URL=...             # API server URL
```

---

## Development

```bash
pnpm dev                            # Start all services
pnpm --filter mobile start          # Mobile only
pnpm --filter api dev               # API only
pnpm --filter @repo/design dev      # Design book only
pnpm --filter api db:push           # Push DB migrations
pnpm test                           # Run all tests
```
