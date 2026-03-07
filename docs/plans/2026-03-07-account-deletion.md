# Account Deletion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** GDPR-compliant account deletion with 14-day soft delete grace period, OTP verification, and scheduled hard delete via BullMQ.

**Architecture:** Soft delete sets `deletedAt` on the user row, kills sessions, and schedules a BullMQ delayed job. The delayed job (14 days) performs hard delete of all user data including S3 files. tRPC middleware blocks soft-deleted users from using the API. Mobile sends OTP before deletion and handles the soft-delete error on login.

**Tech Stack:** Drizzle ORM, BullMQ, Better Auth, tRPC, Bun S3Client, Expo Router

**Design doc:** `docs/plans/2026-03-07-account-deletion-design.md`

---

### Task 1: Add `deletedAt` column to `user` table

**Files:**
- Modify: `apps/api/src/db/schema.ts:17-25`
- Create: `apps/api/drizzle/XXXX_add-user-deleted-at.sql` (via drizzle-kit generate)

**Step 1: Add column to schema**

In `apps/api/src/db/schema.ts`, add `deletedAt` to the `user` table:

```typescript
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),  // <-- add this
});
```

**Step 2: Generate migration**

```bash
cd apps/api && npx drizzle-kit generate --name=add-user-deleted-at
```

Expected: creates migration SQL file with `ALTER TABLE "user" ADD COLUMN "deleted_at" timestamp;`

**Step 3: Apply migration**

```bash
cd apps/api && npx drizzle-kit migrate
```

**Step 4: Verify**

```bash
pnpm --filter @repo/api typecheck
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle/
git commit -m "Add deletedAt column to user table (BLI-XX)"
```

---

### Task 2: Add soft-delete check to tRPC middleware

**Files:**
- Modify: `apps/api/src/trpc/trpc.ts`

**Step 1: Update the `isAuthed` middleware to check `deletedAt`**

The middleware needs to query the user's `deletedAt` and throw a specific error if set. Use error code `FORBIDDEN` with a specific message the mobile app can detect.

```typescript
import { initTRPC, TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import type { TRPCContext } from './context';
import { db } from '../db';
import { user } from '../db/schema';

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to perform this action',
    });
  }

  // Check if user is soft-deleted
  const [userData] = await db
    .select({ deletedAt: user.deletedAt })
    .from(user)
    .where(eq(user.id, ctx.userId));

  if (userData?.deletedAt) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'ACCOUNT_DELETED',
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});

export const protectedProcedure = t.procedure.use(isAuthed);
```

**Step 2: Verify typecheck**

```bash
pnpm --filter @repo/api typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/api/src/trpc/trpc.ts
git commit -m "Block soft-deleted users in tRPC middleware (BLI-XX)"
```

---

### Task 3: Add hard delete BullMQ job and `requestDeletion` tRPC procedure

**Files:**
- Modify: `apps/api/src/services/queue.ts`
- Modify: `apps/api/src/trpc/procedures/accounts.ts`

**Step 1: Add hard-delete job type and processor to queue.ts**

Add a new job type `HardDeleteUserJob` and its processor. Add it to the `AIJob` union type and the `processJob` switch. Add an `enqueueHardDeleteUser` export function.

In `apps/api/src/services/queue.ts`:

Add import at top:
```typescript
import { user, session, account, profiles, waves, conversations, conversationParticipants, topics, messages, messageReactions, blocks, pushTokens, statusMatches, connectionAnalyses, profilingSessions } from '../db/schema';
import { or } from 'drizzle-orm';
```

Add job type (after existing job types ~line 86):
```typescript
interface HardDeleteUserJob {
  type: 'hard-delete-user';
  userId: string;
}
```

Add to the AIJob union:
```typescript
type AIJob =
  | AnalyzePairJob
  | AnalyzeUserPairsJob
  | GenerateProfileAIJob
  | GenerateProfilingQuestionJob
  | GenerateProfileFromQAJob
  | StatusMatchingJob
  | HardDeleteUserJob;
```

Add processor function (before `processJob`):
```typescript
async function processHardDeleteUser(userId: string) {
  console.log(`[queue] hard-delete-user starting for ${userId}`);

  // 1. Get S3 file keys from profile before deleting
  const [profile] = await db
    .select({ avatarUrl: profiles.avatarUrl, portrait: profiles.portrait })
    .from(profiles)
    .where(eq(profiles.userId, userId));

  // 2. Delete S3 files
  if (profile) {
    const keysToDelete: string[] = [];
    for (const url of [profile.avatarUrl, profile.portrait]) {
      if (url) {
        // Extract key from presigned URL: uploads/uuid.ext
        const match = url.match(/uploads\/[^?]+/);
        if (match) keysToDelete.push(match[0]);
      }
    }
    if (keysToDelete.length > 0) {
      const { S3Client } = await import('bun');
      const s3 = new S3Client({
        accessKeyId: process.env.BUCKET_ACCESS_KEY_ID!,
        secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY!,
        endpoint: process.env.BUCKET_ENDPOINT!,
        bucket: process.env.BUCKET_NAME!,
      });
      for (const key of keysToDelete) {
        try {
          await s3.delete(key);
          console.log(`[queue] deleted S3 key: ${key}`);
        } catch (err) {
          console.error(`[queue] failed to delete S3 key ${key}:`, err);
        }
      }
    }
  }

  // 3. Delete non-cascading tables (order matters for FK constraints)
  await db.delete(connectionAnalyses).where(
    or(eq(connectionAnalyses.fromUserId, userId), eq(connectionAnalyses.toUserId, userId))
  );
  await db.delete(statusMatches).where(
    or(eq(statusMatches.userId, userId), eq(statusMatches.matchedUserId, userId))
  );
  await db.delete(blocks).where(
    or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId))
  );
  await db.delete(pushTokens).where(eq(pushTokens.userId, userId));

  // Messages & reactions — get user's message IDs first for reaction cleanup
  const userMessages = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.senderId, userId));
  if (userMessages.length > 0) {
    const msgIds = userMessages.map(m => m.id);
    for (const msgId of msgIds) {
      await db.delete(messageReactions).where(eq(messageReactions.messageId, msgId));
    }
  }
  // Also delete reactions by this user on other messages
  await db.delete(messageReactions).where(eq(messageReactions.userId, userId));
  await db.delete(messages).where(eq(messages.senderId, userId));

  await db.delete(conversationParticipants).where(eq(conversationParticipants.userId, userId));
  await db.delete(waves).where(
    or(eq(waves.fromUserId, userId), eq(waves.toUserId, userId))
  );

  // Set creatorId to null on conversations/topics (nullable FK)
  await db.update(conversations).set({ creatorId: null }).where(eq(conversations.creatorId, userId));
  await db.update(topics).set({ creatorId: null }).where(eq(topics.creatorId, userId));

  // 4. Delete user row — cascades to: session, account, profiles, profilingSessions
  await db.delete(user).where(eq(user.id, userId));

  console.log(`[queue] hard-delete-user completed for ${userId}`);
}
```

Add case in `processJob` switch:
```typescript
    case 'hard-delete-user':
      await processHardDeleteUser(data.userId);
      break;
```

Add enqueue function (at bottom, with other exports):
```typescript
export async function enqueueHardDeleteUser(userId: string) {
  if (!process.env.REDIS_URL) return;

  const queue = getQueue();
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
  await queue.add(
    'hard-delete-user',
    { type: 'hard-delete-user', userId },
    {
      jobId: `hard-delete-${userId}`,
      delay: FOURTEEN_DAYS_MS,
      removeOnComplete: true,
    }
  );
}

export async function cancelHardDeleteUser(userId: string) {
  if (!process.env.REDIS_URL) return;

  const queue = getQueue();
  const job = await queue.getJob(`hard-delete-${userId}`);
  if (job) {
    try { await job.remove(); } catch { /* job may have already run */ }
  }
}
```

**Step 2: Add `requestDeletion` procedure to accounts router**

In `apps/api/src/trpc/procedures/accounts.ts`:

```typescript
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import { account, profiles, user, session, pushTokens } from '../../db/schema';
import { auth } from '../../auth';
import { enqueueHardDeleteUser } from '../../services/queue';

export const accountsRouter = router({
  // ... existing listConnected and disconnect ...

  requestDeletion: protectedProcedure
    .input(z.object({ otp: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      // 1. Get user email for OTP verification
      const [userData] = await db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, ctx.userId));

      if (!userData) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      // 2. Verify OTP
      const verified = await auth.api.verifyEmailOTP({
        body: { email: userData.email, otp: input.otp },
      });

      if (!verified) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid OTP' });
      }

      // 3. Soft delete — set deletedAt
      await db
        .update(user)
        .set({ deletedAt: new Date() })
        .where(eq(user.id, ctx.userId));

      // 4. Delete all sessions (logs out everywhere)
      await db.delete(session).where(eq(session.userId, ctx.userId));

      // 5. Remove push tokens (stop notifications)
      await db.delete(pushTokens).where(eq(pushTokens.userId, ctx.userId));

      // 6. Schedule hard delete in 14 days
      await enqueueHardDeleteUser(ctx.userId);

      return { ok: true };
    }),
});
```

Also add the missing import at the top of accounts.ts:
```typescript
import { TRPCError } from '@trpc/server';
```

**Step 3: Verify typecheck**

```bash
pnpm --filter @repo/api typecheck
pnpm --filter @repo/shared typecheck
```

Expected: PASS

**Step 4: Commit**

```bash
git add apps/api/src/services/queue.ts apps/api/src/trpc/procedures/accounts.ts
git commit -m "Add account deletion: soft delete procedure + hard delete job (BLI-XX)"
```

---

### Task 4: Filter soft-deleted users from nearby queries

**Files:**
- Modify: `apps/api/src/trpc/procedures/profiles.ts`
- Modify: `apps/api/src/services/queue.ts` (the `processAnalyzeUserPairs` function)

**Step 1: Add `deletedAt` filter to `getNearbyUsers` query**

In `apps/api/src/trpc/procedures/profiles.ts`, find the `getNearbyUsers` query (~line 217) and add a filter:

```typescript
import { user } from '../../db/schema';
```

In the `getNearbyUsers` query's `.where()` clause, after the existing conditions, add a subquery or join to filter soft-deleted users. The simplest approach is to join with the user table:

Add to the `.where()` `and(...)` block in `getNearbyUsers` (~line 224):
```typescript
sql`${profiles.userId} NOT IN (SELECT id FROM "user" WHERE deleted_at IS NOT NULL)`,
```

Do the same for `getNearbyUsersForMap` query (find the equivalent query further in the file).

Also add the same filter in the `updateLocation` notification query (~line 147):
```typescript
sql`${profiles.userId} NOT IN (SELECT id FROM "user" WHERE deleted_at IS NOT NULL)`,
```

**Step 2: Add filter to `processAnalyzeUserPairs` in queue.ts**

In `apps/api/src/services/queue.ts`, find `processAnalyzeUserPairs` (~line 337). Add the same filter to the nearby users query:

```typescript
sql`${profiles.userId} NOT IN (SELECT id FROM "user" WHERE deleted_at IS NOT NULL)`,
```

**Step 3: Verify typecheck**

```bash
pnpm --filter @repo/api typecheck
```

Expected: PASS

**Step 4: Commit**

```bash
git add apps/api/src/trpc/procedures/profiles.ts apps/api/src/services/queue.ts
git commit -m "Filter soft-deleted users from nearby queries (BLI-XX)"
```

---

### Task 5: Mobile — implement deletion flow in account.tsx

**Files:**
- Modify: `apps/mobile/app/settings/account.tsx`

**Step 1: Update `handleDeleteAccount` to send OTP and call deletion API**

Replace the existing `handleDeleteAccount` function and add the required state/imports:

```typescript
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, ActivityIndicator, Alert, TextInput } from 'react-native';
// ... existing imports ...
import { useState } from 'react';

// Inside AccountScreen component, add state:
const [isDeleting, setIsDeleting] = useState(false);
const [otpStep, setOtpStep] = useState(false);
const [otp, setOtp] = useState('');
const [otpLoading, setOtpLoading] = useState(false);

const requestDeletion = trpc.accounts.requestDeletion.useMutation();

const handleDeleteAccount = () => {
  Alert.alert(
    'Usuń konto',
    'Czy na pewno chcesz usunąć swoje konto? Twoje dane zostaną trwale usunięte w ciągu 14 dni.',
    [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Kontynuuj',
        style: 'destructive',
        onPress: async () => {
          setIsDeleting(true);
          try {
            await authClient.emailOtp.sendVerificationOtp({
              email: user!.email,
              type: 'sign-in',
            });
            setOtpStep(true);
          } catch {
            Alert.alert('Błąd', 'Nie udało się wysłać kodu weryfikacyjnego.');
          }
          setIsDeleting(false);
        },
      },
    ]
  );
};

const handleConfirmDeletion = async () => {
  if (otp.length !== 6) return;
  setOtpLoading(true);
  try {
    await requestDeletion.mutateAsync({ otp });
    await authClient.signOut();
    useAuthStore.getState().reset();
    router.replace('/(auth)/login');
  } catch {
    Alert.alert('Błąd', 'Nieprawidłowy kod. Spróbuj ponownie.');
  }
  setOtpLoading(false);
};
```

Replace the delete section at the bottom of the JSX (the `<Pressable style={styles.deleteSection}>` block) with:

```tsx
{otpStep ? (
  <View style={styles.deleteSection}>
    <Text style={styles.deleteText}>Wpisz kod weryfikacyjny</Text>
    <Text style={styles.deleteDescription}>
      Wysłaliśmy 6-cyfrowy kod na {user?.email}
    </Text>
    <TextInput
      style={styles.otpInput}
      value={otp}
      onChangeText={setOtp}
      keyboardType="number-pad"
      maxLength={6}
      placeholder="000000"
      autoFocus
    />
    <Pressable
      style={[styles.confirmDeleteButton, otp.length !== 6 && { opacity: 0.5 }]}
      onPress={handleConfirmDeletion}
      disabled={otp.length !== 6 || otpLoading}
    >
      {otpLoading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={styles.confirmDeleteText}>Usuń konto</Text>
      )}
    </Pressable>
  </View>
) : (
  <Pressable style={styles.deleteSection} onPress={handleDeleteAccount} disabled={isDeleting}>
    {isDeleting ? (
      <ActivityIndicator color={colors.muted} size="small" />
    ) : (
      <>
        <Text style={styles.deleteText}>Usuń konto</Text>
        <Text style={styles.deleteDescription}>
          Trwale usuwa Twoje konto, profil i wszystkie dane. Proces trwa do 14 dni.
        </Text>
      </>
    )}
  </Pressable>
)}
```

Add styles:
```typescript
otpInput: {
  fontFamily: fonts.sansSemiBold,
  fontSize: 24,
  letterSpacing: 8,
  textAlign: 'center',
  color: colors.ink,
  borderBottomWidth: 2,
  borderBottomColor: colors.rule,
  paddingVertical: 12,
  marginVertical: spacing.column,
  width: 200,
  alignSelf: 'center',
},
confirmDeleteButton: {
  backgroundColor: colors.accent,
  borderRadius: 8,
  paddingVertical: 14,
  paddingHorizontal: 24,
  alignSelf: 'center',
  marginTop: spacing.gutter,
},
confirmDeleteText: {
  fontFamily: fonts.sansSemiBold,
  fontSize: 14,
  color: '#fff',
  textAlign: 'center',
},
```

**Step 2: Verify typecheck**

```bash
pnpm --filter @repo/mobile typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/mobile/app/settings/account.tsx
git commit -m "Implement account deletion flow with OTP verification (BLI-XX)"
```

---

### Task 6: Mobile — handle `ACCOUNT_DELETED` error on login

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/src/lib/trpc.ts`

**Step 1: Add global error handler in tRPC client**

In `apps/mobile/src/lib/trpc.ts`, find where `httpBatchLink` or `httpLink` is configured. Add an `onError` handler on the tRPC links or use a global error handling approach.

The simplest approach: intercept `ACCOUNT_DELETED` errors in the tRPC link. Check how links are configured in `apps/mobile/src/lib/trpc.ts` and add error handling.

Alternative (simpler): handle it in `_layout.tsx` in the `checkSession` flow. After `getSession()` succeeds, make a test tRPC call. If it returns `ACCOUNT_DELETED`, show alert and reset.

In `apps/mobile/app/_layout.tsx`, update `checkSession`:

```typescript
const checkSession = async () => {
  try {
    const { data } = await authClient.getSession();
    if (data?.session && data?.user) {
      setUser(data.user);
      setSession(data.session);
    }
  } catch (error) {
    console.error('Session check error:', error);
  }
  setLoading(false);
};
```

The `ACCOUNT_DELETED` error will naturally occur when the app tries to make any tRPC call (like `profiles.getMyProfile`). We need to catch it globally.

Add a global tRPC error handler. In `apps/mobile/src/lib/trpc.ts`, find the links configuration and wrap the link with error interception:

```typescript
// In the tRPC client setup, add a custom link that catches ACCOUNT_DELETED
import { Alert } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { router } from 'expo-router';
```

The exact implementation depends on how the tRPC client is currently configured. Read `apps/mobile/src/lib/trpc.ts` fully to determine the right insertion point.

A more robust approach: add a `queryClient` default `onError` in the React Query config that checks for `ACCOUNT_DELETED`:

In the QueryClient configuration (likely in `_layout.tsx` or `trpc.ts`):
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.data?.code === 'FORBIDDEN' && error?.message === 'ACCOUNT_DELETED') {
          return false; // Don't retry
        }
        return failureCount < 3;
      },
    },
    mutations: {
      onError: (error: any) => {
        if (error?.data?.code === 'FORBIDDEN' && error?.message === 'ACCOUNT_DELETED') {
          Alert.alert(
            'Konto usunięte',
            'Twoje konto jest w trakcie usuwania. Może to potrwać do 14 dni.',
            [{ text: 'OK', onPress: () => {
              authClient.signOut();
              useAuthStore.getState().reset();
            }}]
          );
        }
      },
    },
  },
});
```

**Step 2: Verify typecheck**

```bash
pnpm --filter @repo/mobile typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/mobile/src/lib/trpc.ts apps/mobile/app/_layout.tsx
git commit -m "Handle ACCOUNT_DELETED error globally in mobile app (BLI-XX)"
```

---

### Task 7: Verify end-to-end flow

**Step 1: Start API locally**

```bash
cd apps/api && pnpm dev
```

**Step 2: Run mobile in simulator**

```bash
cd apps/mobile && npx expo run:ios
```

Set simulator location:
```bash
xcrun simctl location booted set 52.2010865,20.9618980
```

**Step 3: Test deletion flow**

1. Log in with a test email
2. Go to Settings → Account → "Usuń konto"
3. Confirm alert
4. Enter OTP code (check API console for OTP)
5. Verify: app logs out and redirects to login screen
6. Try logging in again with same email → should see "Konto usunięte" alert

**Step 4: Verify data state**

Check database: user should have `deletedAt` set, sessions cleared, push tokens cleared.
Check BullMQ: delayed job should be visible with ~14 day delay.

**Step 5: Run typechecks**

```bash
pnpm --filter @repo/api typecheck
pnpm --filter @repo/shared typecheck
pnpm --filter @repo/mobile typecheck
```

Expected: all PASS

**Step 6: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "Account deletion: end-to-end verification fixes (BLI-XX)"
```
