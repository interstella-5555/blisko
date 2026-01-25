# Meet - Architektura Techniczna

## Przegląd Stosu Technologicznego

```
┌─────────────────────────────────────────────────────────────────┐
│                     KLIENT MOBILNY                               │
├─────────────────────────────────────────────────────────────────┤
│  React Native + Expo SDK 52+                                     │
│  TypeScript                                                      │
│  Expo Router v3 (file-based routing)                            │
│  Zustand v5 (state management)                                  │
│  @trpc/react-query (type-safe API)                              │
│  @supabase/supabase-js (auth, realtime)                         │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
┌─────────────────┐  ┌─────────────┐  ┌─────────────────┐
│  RAILWAY        │  │  SUPABASE   │  │  SUPABASE       │
│  Backend API    │  │  Auth       │  │  Realtime       │
├─────────────────┤  ├─────────────┤  ├─────────────────┤
│  Hono + tRPC    │  │  Email      │  │  Chat           │
│  Drizzle ORM    │  │  Magic Link │  │  Presence       │
│  Business Logic │  │  Sessions   │  │  WebSocket      │
│  OpenAI API     │  └─────────────┘  └─────────────────┘
│  Expo Push      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SUPABASE DATABASE                            │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL + PostGIS + pgvector                                │
│  (accessed via Drizzle from Railway backend)                    │
└─────────────────────────────────────────────────────────────────┘
```

### Podział Odpowiedzialności

| Komponent | Supabase | Railway Backend |
|-----------|----------|-----------------|
| **Auth** | ✅ Email magic link, sessions | Weryfikacja JWT |
| **Database** | ✅ PostgreSQL hosting | Drizzle ORM queries |
| **Realtime** | ✅ WebSocket (chat, presence) | - |
| **Storage** | ✅ Zdjęcia profilowe | - |
| **API** | - | ✅ tRPC endpoints |
| **Business Logic** | - | ✅ Matching, interactions |
| **AI** | - | ✅ OpenAI embeddings |
| **Push** | - | ✅ Expo Push API |

---

## Decyzje Technologiczne

| Warstwa | Technologia | Uzasadnienie |
|---------|-------------|--------------|
| Mobile | React Native + Expo SDK 52+ | Cross-platform |
| Routing | Expo Router v3 | File-based routing |
| State | Zustand v5 | Prostszy niż Redux |
| **Backend** | **Hono** | Ultraszybki, Web Standards |
| **API** | **tRPC** | End-to-end type safety |
| **ORM** | **Drizzle** | Type-safe, PostgreSQL native |
| **Auth** | **Supabase Auth** | Gotowe, email magic link |
| **Realtime** | **Supabase Realtime** | Gotowe WebSockets |
| **Database** | **Supabase PostgreSQL** | Managed, pgvector + PostGIS |
| **Testy** | **Vitest** + Maestro | Natywne TS |

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
│   │   │   ├── (tabs)/
│   │   │   │   ├── _layout.tsx
│   │   │   │   ├── index.tsx      # Osoby w okolicy
│   │   │   │   ├── waves.tsx      # Zaczepienia
│   │   │   │   ├── chats.tsx      # Lista czatów
│   │   │   │   └── profile.tsx    # Profil
│   │   │   ├── (modals)/
│   │   │   │   ├── user/[id].tsx
│   │   │   │   └── chat/[id].tsx
│   │   │   ├── _layout.tsx
│   │   │   └── +not-found.tsx
│   │   │
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ui/            # Button, Input, Card...
│   │   │   │   ├── user/          # UserCard, UserList...
│   │   │   │   └── chat/          # Message, ChatBubble...
│   │   │   ├── lib/
│   │   │   │   ├── trpc.ts        # tRPC client
│   │   │   │   ├── supabase.ts    # Supabase client (auth, realtime)
│   │   │   │   └── queryClient.ts
│   │   │   ├── stores/
│   │   │   │   ├── authStore.ts
│   │   │   │   └── locationStore.ts
│   │   │   ├── hooks/
│   │   │   │   ├── useLocation.ts
│   │   │   │   └── useChat.ts
│   │   │   └── utils/
│   │   │       └── location.ts
│   │   │
│   │   ├── __tests__/             # Vitest
│   │   ├── .maestro/              # E2E tests
│   │   ├── app.json
│   │   ├── eas.json
│   │   └── package.json
│   │
│   └── api/                       # Hono backend (Railway)
│       ├── src/
│       │   ├── index.ts           # Hono entry + tRPC
│       │   ├── trpc/
│       │   │   ├── router.ts      # Main router
│       │   │   ├── context.ts     # Auth context
│       │   │   └── procedures/
│       │   │       ├── users.ts
│       │   │       ├── profiles.ts
│       │   │       ├── interactions.ts
│       │   │       └── messages.ts
│       │   ├── services/
│       │   │   ├── ai.ts          # OpenAI embeddings
│       │   │   └── push.ts        # Expo Push
│       │   └── db/
│       │       ├── index.ts       # Drizzle client
│       │       ├── schema.ts      # Drizzle schema
│       │       └── migrate.ts
│       │
│       ├── drizzle/
│       │   └── migrations/
│       │
│       ├── Dockerfile
│       ├── drizzle.config.ts
│       └── package.json
│
├── packages/
│   └── shared/                    # Shared types/validators
│       ├── src/
│       │   ├── types.ts
│       │   └── validators.ts      # Zod schemas
│       └── package.json
│
├── supabase/
│   └── config.toml                # Supabase local dev config
│
├── .github/
│   └── workflows/
│       ├── test.yml
│       └── deploy.yml
│
├── pnpm-workspace.yaml
├── package.json
└── turbo.json
```

---

## 1. Backend (Railway)

### 1.1 Hono + tRPC Setup

```typescript
// apps/api/src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { trpcServer } from '@hono/trpc-server';
import { appRouter } from './trpc/router';
import { createContext } from './trpc/context';

const app = new Hono();

app.use('*', cors());

app.use('/trpc/*', trpcServer({
  router: appRouter,
  createContext,
}));

app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;
```

### 1.2 tRPC Router

```typescript
// apps/api/src/trpc/router.ts
import { router } from './trpc';
import { usersRouter } from './procedures/users';
import { profilesRouter } from './procedures/profiles';
import { interactionsRouter } from './procedures/interactions';

export const appRouter = router({
  users: usersRouter,
  profiles: profilesRouter,
  interactions: interactionsRouter,
});

export type AppRouter = typeof appRouter;
```

### 1.3 tRPC Context (Auth verification)

```typescript
// apps/api/src/trpc/context.ts
import { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function createContext({ req }: FetchCreateContextFnOptions) {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null };
  }

  const token = authHeader.slice(7);

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { user: null };
  }

  return { user };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

### 1.4 Example Procedure

```typescript
// apps/api/src/trpc/procedures/profiles.ts
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import { profiles } from '../../db/schema';
import { eq, sql } from 'drizzle-orm';
import { generateEmbedding } from '../../services/ai';

export const profilesRouter = router({
  getMyProfile: protectedProcedure
    .query(async ({ ctx }) => {
      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, ctx.user.id));

      return profile;
    }),

  updateProfile: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(50),
      gender: z.enum(['male', 'female', 'other']),
      age: z.number().min(18).max(120).optional(),
      aboutMe: z.string().max(1000).optional(),
      lookingFor: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Generate embedding if text fields changed
      let embedding = null;
      if (input.aboutMe || input.lookingFor) {
        embedding = await generateEmbedding(
          `${input.aboutMe || ''} ${input.lookingFor || ''}`
        );
      }

      const [updated] = await db
        .update(profiles)
        .set({
          ...input,
          embedding,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, ctx.user.id))
        .returning();

      return updated;
    }),

  getNearbyUsers: protectedProcedure
    .input(z.object({
      latitude: z.number(),
      longitude: z.number(),
      radiusMeters: z.number().default(5000),
      limit: z.number().default(30),
    }))
    .query(async ({ ctx, input }) => {
      // First update user's location
      await db
        .update(profiles)
        .set({
          location: sql`ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography`,
          locationUpdatedAt: new Date(),
        })
        .where(eq(profiles.id, ctx.user.id));

      // Then find nearby users
      const nearbyUsers = await db.execute(sql`
        SELECT
          p.id,
          p.name,
          p.avatar_url,
          p.summary,
          p.tags,
          ST_Distance(p.location, ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography) as distance_meters,
          CASE
            WHEN p.embedding IS NOT NULL
            THEN 1 - (p.embedding <=> (SELECT embedding FROM profiles WHERE id = ${ctx.user.id}))
            ELSE 0.5
          END as similarity_score
        FROM profiles p
        WHERE p.id != ${ctx.user.id}
          AND p.is_active = true
          AND p.location IS NOT NULL
          AND ST_DWithin(
            p.location,
            ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography,
            ${input.radiusMeters}
          )
          AND NOT EXISTS (
            SELECT 1 FROM blocks
            WHERE (blocker_id = ${ctx.user.id} AND blocked_id = p.id)
               OR (blocker_id = p.id AND blocked_id = ${ctx.user.id})
          )
        ORDER BY similarity_score DESC, distance_meters ASC
        LIMIT ${input.limit}
      `);

      return nearbyUsers;
    }),
});
```

### 1.5 Drizzle Schema

```typescript
// apps/api/src/db/schema.ts
import { pgTable, uuid, text, integer, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  gender: text('gender').notNull(),
  age: integer('age'),
  avatarUrl: text('avatar_url'),

  aboutMe: text('about_me'),
  lookingFor: text('looking_for'),

  summary: text('summary'),
  tags: text('tags').array(),
  embedding: text('embedding'), // vector stored as text, casted in queries

  location: text('location'), // geography stored as text
  locationUpdatedAt: timestamp('location_updated_at'),

  isActive: boolean('is_active').default(true),
  isVerified: boolean('is_verified').default(false),
  lastSeenAt: timestamp('last_seen_at').defaultNow(),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  activeIdx: index('idx_profiles_active').on(table.isActive),
}));

export const interactions = pgTable('interactions', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  fromUserId: uuid('from_user_id').references(() => profiles.id).notNull(),
  toUserId: uuid('to_user_id').references(() => profiles.id).notNull(),
  type: text('type').notNull(), // 'wave', 'wave_back', 'ignore', 'block'
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uniqueInteraction: uniqueIndex('idx_unique_interaction').on(table.fromUserId, table.toUserId),
  toUserIdx: index('idx_interactions_to_user').on(table.toUserId),
}));

export const blocks = pgTable('blocks', {
  blockerId: uuid('blocker_id').references(() => profiles.id).notNull(),
  blockedId: uuid('blocked_id').references(() => profiles.id).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  pk: uniqueIndex('blocks_pk').on(table.blockerId, table.blockedId),
}));

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  type: text('type').notNull().default('direct'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const conversationParticipants = pgTable('conversation_participants', {
  conversationId: uuid('conversation_id').references(() => conversations.id).notNull(),
  userId: uuid('user_id').references(() => profiles.id).notNull(),
  joinedAt: timestamp('joined_at').defaultNow(),
  lastReadAt: timestamp('last_read_at'),
  isMuted: boolean('is_muted').default(false),
}, (table) => ({
  pk: uniqueIndex('conversation_participants_pk').on(table.conversationId, table.userId),
}));

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  conversationId: uuid('conversation_id').references(() => conversations.id).notNull(),
  senderId: uuid('sender_id').references(() => profiles.id),
  content: text('content').notNull(),
  type: text('type').default('text'),
  metadata: text('metadata'), // JSON
  createdAt: timestamp('created_at').defaultNow(),
  isDeleted: boolean('is_deleted').default(false),
}, (table) => ({
  conversationIdx: index('idx_messages_conversation').on(table.conversationId, table.createdAt),
}));

export const pushTokens = pgTable('push_tokens', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  userId: uuid('user_id').references(() => profiles.id).notNull(),
  token: text('token').notNull(),
  platform: text('platform').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uniqueToken: uniqueIndex('idx_unique_push_token').on(table.userId, table.token),
}));
```

### 1.6 Dockerfile

```dockerfile
# apps/api/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

---

## 2. Mobile (Expo)

### 2.1 tRPC Client

```typescript
// apps/mobile/src/lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@meet/api';
import { supabase } from './supabase';

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${process.env.EXPO_PUBLIC_API_URL}/trpc`,
        async headers() {
          const { data: { session } } = await supabase.auth.getSession();
          return {
            Authorization: session?.access_token
              ? `Bearer ${session.access_token}`
              : '',
          };
        },
      }),
    ],
  });
}
```

### 2.2 Supabase Client (Auth + Realtime only)

```typescript
// apps/mobile/src/lib/supabase.ts
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

// Auth helpers
export const signInWithEmail = async (email: string) => {
  return supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: 'meet://auth/callback',
    },
  });
};

export const signOut = async () => {
  return supabase.auth.signOut();
};

// Realtime helper for chat
export const subscribeToChat = (
  conversationId: string,
  onMessage: (message: any) => void
) => {
  return supabase
    .channel(`chat:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onMessage(payload.new)
    )
    .subscribe();
};
```

### 2.3 Using tRPC in Components

```typescript
// apps/mobile/app/(tabs)/index.tsx
import { View, FlatList, RefreshControl } from 'react-native';
import { trpc } from '../../src/lib/trpc';
import { useLocationStore } from '../../src/stores/locationStore';
import { UserCard } from '../../src/components/user/UserCard';

export default function NearbyUsersScreen() {
  const { currentLocation, searchRadius } = useLocationStore();

  const { data: users, isLoading, refetch } = trpc.profiles.getNearbyUsers.useQuery(
    {
      latitude: currentLocation?.latitude ?? 0,
      longitude: currentLocation?.longitude ?? 0,
      radiusMeters: searchRadius,
    },
    {
      enabled: !!currentLocation,
    }
  );

  const waveMutation = trpc.interactions.wave.useMutation({
    onSuccess: () => refetch(),
  });

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <UserCard
            user={item}
            onWave={() => waveMutation.mutate({ toUserId: item.id })}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
      />
    </View>
  );
}
```

---

## 3. Supabase Setup

### 3.1 Extensions (run in Supabase SQL Editor)

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;

-- Create tables (same schema as Drizzle, but with proper types)
-- Run Drizzle migrations from Railway backend
```

### 3.2 Realtime Configuration

Enable realtime for `messages` table in Supabase Dashboard:
1. Go to Database → Replication
2. Add `messages` table to replication

### 3.3 Storage Bucket

```sql
-- Create storage bucket for avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

-- Policy: anyone can view
CREATE POLICY "Public avatars" ON storage.objects
FOR SELECT USING (bucket_id = 'avatars');

-- Policy: authenticated users can upload own
CREATE POLICY "Users upload own avatar" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

---

## 4. Koszty

### POC

| Usługa | Koszt/miesiąc |
|--------|---------------|
| Supabase Free | $0 |
| Railway Hobby | $5 |
| OpenAI | ~$0 (pay-per-use) |
| Expo EAS Free | $0 |
| **Razem** | **~$5** |

### Produkcja (~10k users)

| Usługa | Koszt/miesiąc |
|--------|---------------|
| Supabase Pro | $25 |
| Railway Pro | $20 |
| OpenAI | ~$10 |
| **Razem** | **~$55** |

---

## 5. Development Workflow

```bash
# Start all services
pnpm dev

# Mobile only
pnpm --filter mobile dev

# API only
pnpm --filter api dev

# Run tests
pnpm test

# Run E2E
pnpm --filter mobile test:e2e

# Deploy
pnpm --filter api deploy  # Railway
```
