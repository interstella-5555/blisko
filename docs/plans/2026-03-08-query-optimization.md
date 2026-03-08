# Query Optimization & Missing Indexes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate N+1 query patterns, add missing database indexes, wrap critical mutations in transactions, and use prepared statements for hot-path queries.

**Architecture:** Six independent tasks: (1) add indexes via Drizzle migration, (2) batch reactions in getMessages, (3) batch data-export loops, (4) batch getConversations, (5) wrap critical mutations in transactions, (6) add prepared statements for hot-path queries. Each task is self-contained — can be committed independently.

**Tech Stack:** Drizzle ORM, PostgreSQL, tRPC

---

### Task 1: Add missing database indexes

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: migration via `npx drizzle-kit generate`

**Step 1: Add indexes to `statusMatches` table**

In `apps/api/src/db/schema.ts`, change `statusMatches` from:

```ts
export const statusMatches = pgTable("status_matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  matchedUserId: text("matched_user_id")
    .notNull()
    .references(() => user.id),
  reason: text("reason").notNull(),
  matchedVia: text("matched_via").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

to:

```ts
export const statusMatches = pgTable(
  "status_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    matchedUserId: text("matched_user_id")
      .notNull()
      .references(() => user.id),
    reason: text("reason").notNull(),
    matchedVia: text("matched_via").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("sm_user_id_idx").on(table.userId),
    matchedUserIdIdx: index("sm_matched_user_id_idx").on(table.matchedUserId),
  }),
);
```

**Step 2: Add composite index to `messages` table**

In the `messages` table definition, add a composite index for `(conversationId, createdAt)` and `(conversationId, deletedAt)`:

```ts
// Change the indexes block from:
(table) => ({
  conversationIdx: index("messages_conversation_idx").on(table.conversationId),
  senderIdx: index("messages_sender_idx").on(table.senderId),
  createdAtIdx: index("messages_created_at_idx").on(table.createdAt),
  topicIdx: index("messages_topic_idx").on(table.topicId),
}),

// to:
(table) => ({
  convCreatedIdx: index("messages_conv_created_idx").on(table.conversationId, table.createdAt),
  senderIdx: index("messages_sender_idx").on(table.senderId),
  topicIdx: index("messages_topic_idx").on(table.topicId),
}),
```

Note: the composite `(conversationId, createdAt)` replaces the individual `conversationIdx` and `createdAtIdx` — a composite index on (A, B) serves queries filtering on A alone too.

**Step 3: Add composite indexes to `waves` table**

```ts
// Change from:
(table) => ({
  fromUserIdx: index("waves_from_user_idx").on(table.fromUserId),
  toUserIdx: index("waves_to_user_idx").on(table.toUserId),
  statusIdx: index("waves_status_idx").on(table.status),
}),

// to:
(table) => ({
  fromUserStatusIdx: index("waves_from_user_status_idx").on(table.fromUserId, table.status),
  toUserStatusIdx: index("waves_to_user_status_idx").on(table.toUserId, table.status),
}),
```

Same principle — composite `(fromUserId, status)` replaces individual `fromUserIdx` and `statusIdx`.

**Step 4: Add composite index to `profilingSessions` table**

```ts
// Change from:
(table) => ({
  userIdIdx: index("ps_user_id_idx").on(table.userId),
}),

// to:
(table) => ({
  userStatusIdx: index("ps_user_status_idx").on(table.userId, table.status),
}),
```

**Step 5: Generate and review migration**

Run:
```bash
cd apps/api && npx drizzle-kit generate --name=add-missing-indexes
```

Review the generated SQL file in `apps/api/drizzle/` — it should contain only `CREATE INDEX` and `DROP INDEX` statements, no table alterations.

**Step 6: Apply migration**

Run:
```bash
cd apps/api && npx drizzle-kit migrate
```

**Step 7: Verify typecheck**

Run: `pnpm --filter @repo/api typecheck`
Expected: No errors

**Step 8: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle/
git commit -m "Add missing indexes for statusMatches, messages, waves, profilingSessions (BLI-76)"
```

---

### Task 2: Batch reactions fetch in getMessages

**Files:**
- Modify: `apps/api/src/trpc/procedures/messages.ts:254-326`

**Step 1: Replace N+1 reactions fetch with batch query**

In `getMessages` (around line 254), replace the entire `Promise.all(result.map(...))` block with a batch approach. The current code fetches reactions per-message in a loop. Replace with:

```ts
// Batch-fetch all reactions for these messages
const messageIds = result.map((m) => m.id);
const allReactions =
  messageIds.length > 0
    ? await db.select().from(schema.messageReactions).where(inArray(schema.messageReactions.messageId, messageIds))
    : [];

// Group reactions by messageId
const reactionsMap = new Map<string, typeof allReactions>();
for (const r of allReactions) {
  const arr = reactionsMap.get(r.messageId);
  if (arr) arr.push(r);
  else reactionsMap.set(r.messageId, [r]);
}

// Batch-fetch reply-to messages
const replyToIds = result.map((m) => m.replyToId).filter((id): id is string => id !== null);
const replyToMessages =
  replyToIds.length > 0
    ? await db
        .select({
          id: schema.messages.id,
          content: schema.messages.content,
          senderId: schema.messages.senderId,
        })
        .from(schema.messages)
        .where(inArray(schema.messages.id, replyToIds))
    : [];

// Fetch any reply sender profiles not already in senderProfileMap
const replySenderIds = replyToMessages
  .map((m) => m.senderId)
  .filter((id) => !senderProfileMap.has(id));
if (replySenderIds.length > 0) {
  const replyProfiles = await db
    .select({
      userId: schema.profiles.userId,
      displayName: schema.profiles.displayName,
      avatarUrl: schema.profiles.avatarUrl,
    })
    .from(schema.profiles)
    .where(inArray(schema.profiles.userId, replySenderIds));
  for (const sp of replyProfiles) {
    senderProfileMap.set(sp.userId, {
      displayName: sp.displayName,
      avatarUrl: sp.avatarUrl,
    });
  }
}

const replyToMap = new Map(replyToMessages.map((m) => [m.id, m]));

// Enrich messages (no more async — all data pre-fetched)
const enrichedMessages = result.map((msg) => {
  // Reply-to
  let replyTo = null;
  if (msg.replyToId) {
    const replyMsg = replyToMap.get(msg.replyToId);
    if (replyMsg) {
      const senderProfile = senderProfileMap.get(replyMsg.senderId);
      replyTo = {
        id: replyMsg.id,
        content: replyMsg.content,
        senderName: senderProfile?.displayName ?? "Użytkownik",
      };
    }
  }

  // Reactions — group by emoji
  const reactionsData = reactionsMap.get(msg.id) ?? [];
  const reactionGroups = new Map<string, { emoji: string; count: number; userIds: string[] }>();
  for (const r of reactionsData) {
    const existing = reactionGroups.get(r.emoji);
    if (existing) {
      existing.count++;
      existing.userIds.push(r.userId);
    } else {
      reactionGroups.set(r.emoji, { emoji: r.emoji, count: 1, userIds: [r.userId] });
    }
  }
  const reactions = Array.from(reactionGroups.values()).map((r) => ({
    emoji: r.emoji,
    count: r.count,
    myReaction: r.userIds.includes(ctx.userId),
  }));

  // Sender info for groups
  const senderInfo = isGroup ? (senderProfileMap.get(msg.senderId) ?? null) : null;

  return {
    ...msg,
    replyTo,
    reactions,
    senderName: senderInfo?.displayName ?? null,
    senderAvatarUrl: senderInfo?.avatarUrl ?? null,
  };
});
```

This replaces lines 254-326 (the entire `const enrichedMessages = await Promise.all(...)` block through the return). The `return { messages: enrichedMessages, nextCursor }` stays as-is.

**Step 2: Verify typecheck**

Run: `pnpm --filter @repo/api typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/api/src/trpc/procedures/messages.ts
git commit -m "Batch-fetch reactions and reply-to in getMessages (BLI-76)"
```

---

### Task 3: Batch data-export loop queries

**Files:**
- Modify: `apps/api/src/services/data-export.ts:107-168`

**Step 1: Add `inArray` to imports**

Change:
```ts
import { eq, or } from "drizzle-orm";
```
to:
```ts
import { eq, inArray, or } from "drizzle-orm";
```

**Step 2: Replace conversation loop with batch queries**

Replace lines 107-139 (the participations fetch + loop) with:

```ts
// 5. Conversations & messages
const participations = await db
  .select()
  .from(schema.conversationParticipants)
  .where(eq(schema.conversationParticipants.userId, userId));

const conversationIds = participations.map((p) => p.conversationId);

// Batch-fetch all participants and messages for all conversations
const [allParticipants, allMessages] = await Promise.all([
  conversationIds.length > 0
    ? db
        .select({ conversationId: schema.conversationParticipants.conversationId, userId: schema.conversationParticipants.userId })
        .from(schema.conversationParticipants)
        .where(inArray(schema.conversationParticipants.conversationId, conversationIds))
    : Promise.resolve([]),
  conversationIds.length > 0
    ? db
        .select()
        .from(schema.messages)
        .where(inArray(schema.messages.conversationId, conversationIds))
    : Promise.resolve([]),
]);

// Group by conversationId
const participantsByConv = new Map<string, typeof allParticipants>();
for (const p of allParticipants) {
  const arr = participantsByConv.get(p.conversationId);
  if (arr) arr.push(p);
  else participantsByConv.set(p.conversationId, [p]);
}

const messagesByConv = new Map<string, typeof allMessages>();
for (const m of allMessages) {
  const arr = messagesByConv.get(m.conversationId);
  if (arr) arr.push(m);
  else messagesByConv.set(m.conversationId, [m]);
}

const otherUserIds = new Set<string>();

// Collect other user IDs from waves
for (const w of sentWaves) otherUserIds.add(w.toUserId);
for (const w of receivedWaves) otherUserIds.add(w.fromUserId);

// Collect from conversations
const conversationsExport = conversationIds.map((convId) => {
  const convParticipants = participantsByConv.get(convId) ?? [];
  const convMessages = messagesByConv.get(convId) ?? [];

  for (const pp of convParticipants) {
    if (pp.userId !== userId) otherUserIds.add(pp.userId);
  }
  for (const m of convMessages) {
    if (m.senderId !== userId) otherUserIds.add(m.senderId);
  }

  return { conversationId: convId, allParticipants: convParticipants, messages: convMessages };
});
```

**Step 3: Batch profiling QA queries**

Replace lines 154-168 (the profiling sessions loop) with:

```ts
// 8. Profiling sessions & QA
const sessions = await db.select().from(schema.profilingSessions).where(eq(schema.profilingSessions.userId, userId));

const sessionIds = sessions.map((s) => s.id);
const allQA =
  sessionIds.length > 0
    ? await db.select().from(schema.profilingQA).where(inArray(schema.profilingQA.sessionId, sessionIds))
    : [];

const qaBySession = new Map<string, typeof allQA>();
for (const q of allQA) {
  const arr = qaBySession.get(q.sessionId);
  if (arr) arr.push(q);
  else qaBySession.set(q.sessionId, [q]);
}

const sessionsExport = sessions.map((s) => ({
  createdAt: s.createdAt.toISOString(),
  questions: (qaBySession.get(s.id) ?? []).map((q) => ({
    question: q.question,
    answer: q.answer,
  })),
}));
```

**Step 4: Verify typecheck**

Run: `pnpm --filter @repo/api typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/api/src/services/data-export.ts
git commit -m "Batch-fetch conversations, messages, and QA in data export (BLI-76)"
```

---

### Task 4: Batch getConversations queries

**Files:**
- Modify: `apps/api/src/trpc/procedures/messages.ts:14-156`

This is the biggest refactor. The current code does 5+ queries per conversation inside `Promise.all(map(...))`. Replace with batch queries up front.

**Step 1: Replace the N+1 loop with batch queries**

Replace lines 14-156 (the entire `getConversations` procedure body) with:

```ts
getConversations: protectedProcedure.query(async ({ ctx }) => {
  // Get conversations where user is participant
  const userConversations = await db
    .select({
      conversationId: schema.conversationParticipants.conversationId,
      lastReadAt: schema.conversationParticipants.lastReadAt,
    })
    .from(schema.conversationParticipants)
    .where(eq(schema.conversationParticipants.userId, ctx.userId));

  const conversationIds = userConversations.map((c) => c.conversationId);

  if (conversationIds.length === 0) {
    return [];
  }

  const lastReadMap = new Map(userConversations.map((c) => [c.conversationId, c.lastReadAt]));

  // Batch-fetch all data in parallel
  const [conversations, allParticipants, lastMessages, unreadCounts] = await Promise.all([
    // 1. All conversations
    db
      .select()
      .from(schema.conversations)
      .where(inArray(schema.conversations.id, conversationIds)),

    // 2. All participants (for DM other-user + group member count)
    db
      .select({
        conversationId: schema.conversationParticipants.conversationId,
        userId: schema.conversationParticipants.userId,
      })
      .from(schema.conversationParticipants)
      .where(inArray(schema.conversationParticipants.conversationId, conversationIds)),

    // 3. Last message per conversation (using DISTINCT ON)
    db.execute(sql`
      SELECT DISTINCT ON (conversation_id) *
      FROM messages
      WHERE conversation_id = ANY(${conversationIds})
        AND deleted_at IS NULL
      ORDER BY conversation_id, created_at DESC
    `),

    // 4. Unread counts per conversation
    db.execute(sql`
      SELECT
        m.conversation_id,
        count(*) AS count
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      JOIN conversation_participants cp
        ON cp.conversation_id = m.conversation_id AND cp.user_id = ${ctx.userId}
      WHERE m.conversation_id = ANY(${conversationIds})
        AND m.sender_id != ${ctx.userId}
        AND m.deleted_at IS NULL
        AND (
          CASE
            WHEN c.type = 'group' THEN
              m.created_at > COALESCE(cp.last_read_at, '1970-01-01'::timestamp)
            ELSE
              m.read_at IS NULL
          END
        )
      GROUP BY m.conversation_id
    `),
  ]);

  // Build lookup maps
  const convMap = new Map(conversations.map((c) => [c.id, c]));

  // Participants grouped by conversation
  const participantsByConv = new Map<string, string[]>();
  for (const p of allParticipants) {
    const arr = participantsByConv.get(p.conversationId);
    if (arr) arr.push(p.userId);
    else participantsByConv.set(p.conversationId, [p.userId]);
  }

  // Last messages map
  const lastMsgMap = new Map<string, (typeof lastMessages.rows)[0]>();
  for (const row of lastMessages.rows) {
    lastMsgMap.set(row.conversation_id as string, row);
  }

  // Unread counts map
  const unreadMap = new Map<string, number>();
  for (const row of unreadCounts.rows) {
    unreadMap.set(row.conversation_id as string, Number(row.count));
  }

  // For DMs: batch-fetch other participant profiles (filter soft-deleted)
  const dmOtherUserIds: string[] = [];
  for (const [convId, members] of participantsByConv) {
    const conv = convMap.get(convId);
    if (conv?.type !== "group") {
      const otherId = members.find((id) => id !== ctx.userId);
      if (otherId) dmOtherUserIds.push(otherId);
    }
  }

  const dmProfiles =
    dmOtherUserIds.length > 0
      ? await db
          .select({ profile: schema.profiles })
          .from(schema.profiles)
          .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
          .where(and(inArray(schema.profiles.userId, dmOtherUserIds), isNull(schema.user.deletedAt)))
      : [];

  const profileMap = new Map(dmProfiles.map((p) => [p.profile.userId, p.profile]));

  // For groups: batch-fetch sender names for last messages
  const groupLastMsgSenderIds: string[] = [];
  for (const [convId, row] of lastMsgMap) {
    const conv = convMap.get(convId);
    if (conv?.type === "group" && row.sender_id) {
      groupLastMsgSenderIds.push(row.sender_id as string);
    }
  }

  const senderProfiles =
    groupLastMsgSenderIds.length > 0
      ? await db
          .select({ userId: schema.profiles.userId, displayName: schema.profiles.displayName })
          .from(schema.profiles)
          .where(inArray(schema.profiles.userId, groupLastMsgSenderIds))
      : [];

  const senderNameMap = new Map(senderProfiles.map((p) => [p.userId, p.displayName]));

  // Assemble results
  const result = conversationIds
    .map((convId) => {
      const conversation = convMap.get(convId);
      if (!conversation) return null;

      const isGroup = conversation.type === "group";
      const members = participantsByConv.get(convId) ?? [];

      // DM: other participant profile. Group: member count.
      let participant = null;
      let memberCount = null;

      if (isGroup) {
        memberCount = members.length;
      } else {
        const otherId = members.find((id) => id !== ctx.userId);
        participant = otherId ? (profileMap.get(otherId) ?? null) : null;
      }

      // Skip DMs where other participant is deleted
      if (!isGroup && !participant) return null;

      // Last message
      const lastMsgRow = lastMsgMap.get(convId);
      const lastMessage = lastMsgRow
        ? {
            id: lastMsgRow.id as string,
            conversationId: lastMsgRow.conversation_id as string,
            senderId: lastMsgRow.sender_id as string,
            content: lastMsgRow.content as string,
            type: lastMsgRow.type as string,
            metadata: lastMsgRow.metadata,
            replyToId: lastMsgRow.reply_to_id as string | null,
            topicId: lastMsgRow.topic_id as string | null,
            createdAt: new Date(lastMsgRow.created_at as string),
            readAt: lastMsgRow.read_at ? new Date(lastMsgRow.read_at as string) : null,
            deletedAt: null,
          }
        : null;

      const lastMessageSenderName =
        isGroup && lastMsgRow ? (senderNameMap.get(lastMsgRow.sender_id as string) ?? null) : null;

      const unreadCount = unreadMap.get(convId) ?? 0;

      return {
        conversation,
        participant,
        lastMessage,
        lastMessageSenderName,
        memberCount,
        unreadCount,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Sort by last message date
  result.sort((a, b) => {
    const dateA = a.lastMessage?.createdAt || a.conversation.createdAt;
    const dateB = b.lastMessage?.createdAt || b.conversation.createdAt;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  return result;
}),
```

Note: this uses raw SQL for `DISTINCT ON` and the unread count CASE query — there's no clean Drizzle equivalent. The `sql` template and `db.execute()` are already imported. Also need to add `isNull` to the imports on line 3.

**Step 2: Update imports**

Make sure line 3 includes `isNull`:
```ts
import { and, desc, eq, gt, ilike, inArray, isNotNull, isNull, lt, ne, notInArray, sql } from "drizzle-orm";
```

**Step 3: Verify typecheck**

Run: `pnpm --filter @repo/api typecheck`
Expected: No errors

**Step 4: Test manually**

Run the API (`cd apps/api && pnpm dev`) and test getConversations via the mobile app or dev-cli:
```bash
pnpm dev-cli -- chats <username>
```

Verify: conversations load correctly, last message shown, unread counts match, DMs with deleted users are hidden.

**Step 5: Commit**

```bash
git add apps/api/src/trpc/procedures/messages.ts
git commit -m "Batch-fetch all data in getConversations to eliminate N+1 (BLI-76)"
```

---

### Task 5: Wrap critical mutations in transactions

**Files:**
- Modify: `apps/api/src/trpc/procedures/waves.ts`
- Modify: `apps/api/src/trpc/procedures/accounts.ts`

Zero `db.transaction` calls in the codebase. Several multi-step mutations can leave inconsistent state if any step fails.

**Step 1: Wrap `waves.respond` (accept path) in transaction**

In `apps/api/src/trpc/procedures/waves.ts`, the accept branch (lines 189-202) does: update wave → create conversation → insert participants. Wrap in transaction:

```ts
// Replace lines 189-202 with:
if (input.accept) {
  const { updatedWave, conversation } = await db.transaction(async (tx) => {
    const [updatedWave] = await tx
      .update(schema.waves)
      .set({ status: "accepted" })
      .where(eq(schema.waves.id, input.waveId))
      .returning();

    const [conversation] = await tx.insert(schema.conversations).values({}).returning();

    await tx.insert(schema.conversationParticipants).values([
      { conversationId: conversation.id, userId: wave.fromUserId },
      { conversationId: conversation.id, userId: ctx.userId },
    ]);

    return { updatedWave, conversation };
  });

  // Side effects (push, WS) outside transaction — they don't need atomicity
  const [responderProfile] = await db
    .select({ displayName: schema.profiles.displayName, avatarUrl: schema.profiles.avatarUrl })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, ctx.userId));

  void sendPushToUser(wave.fromUserId, {
    title: "Blisko",
    body: `${responderProfile?.displayName ?? "Ktoś"} — zaczepka przyjęta!`,
    data: { type: "chat", conversationId: conversation.id },
  });

  ee.emit("waveResponded", {
    fromUserId: wave.fromUserId,
    waveId: wave.id,
    accepted: true,
    conversationId: conversation.id,
    responderProfile: responderProfile
      ? { displayName: responderProfile.displayName, avatarUrl: responderProfile.avatarUrl }
      : { displayName: "Ktoś", avatarUrl: null },
  });

  return { wave: updatedWave, conversationId: conversation.id };
}

// Decline path (no transaction needed — single update)
const [updatedWave] = await db
  .update(schema.waves)
  .set({ status: "declined" })
  .where(eq(schema.waves.id, input.waveId))
  .returning();
```

Note: the current code sets `newStatus` then updates — the refactored version inlines "accepted"/"declined" directly.

**Step 2: Wrap `waves.send` check+insert in transaction to prevent duplicates**

In `waves.ts`, the send mutation (lines 63-88) checks for existing wave then inserts. Race condition: two concurrent requests pass the check. Wrap in serializable transaction:

```ts
// Replace lines 63-88 with:
const [wave] = await db.transaction(async (tx) => {
  const [existingWave] = await tx
    .select()
    .from(schema.waves)
    .where(
      and(
        eq(schema.waves.fromUserId, ctx.userId),
        eq(schema.waves.toUserId, input.toUserId),
        eq(schema.waves.status, "pending"),
      ),
    );

  if (existingWave) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "You already waved at this user",
    });
  }

  return await tx
    .insert(schema.waves)
    .values({
      fromUserId: ctx.userId,
      toUserId: input.toUserId,
    })
    .returning();
}, { isolationLevel: "serializable" });
```

**Step 3: Wrap `waves.block` in transaction**

In `waves.ts`, the block mutation (lines 256-274) creates a block then declines pending waves. Wrap:

```ts
// Replace lines 256-274 with:
const [block] = await db.transaction(async (tx) => {
  const [block] = await tx
    .insert(schema.blocks)
    .values({
      blockerId: ctx.userId,
      blockedId: input.userId,
    })
    .returning();

  await tx
    .update(schema.waves)
    .set({ status: "declined" })
    .where(
      and(
        eq(schema.waves.fromUserId, input.userId),
        eq(schema.waves.toUserId, ctx.userId),
        eq(schema.waves.status, "pending"),
      ),
    );

  return [block];
});
```

**Step 4: Wrap `accounts.requestDeletion` in transaction**

In `apps/api/src/trpc/procedures/accounts.ts`, lines 95-104:

```ts
// Replace lines 95-104 with:
await db.transaction(async (tx) => {
  // Soft delete
  await tx.update(schema.user).set({ deletedAt: new Date() }).where(eq(schema.user.id, ctx.userId));
  // Delete all sessions (logs out everywhere)
  await tx.delete(schema.session).where(eq(schema.session.userId, ctx.userId));
  // Remove push tokens (stop notifications)
  await tx.delete(schema.pushTokens).where(eq(schema.pushTokens.userId, ctx.userId));
});

// Schedule hard delete outside transaction (queue job, not DB)
await enqueueHardDeleteUser(ctx.userId);
```

**Step 5: Verify typecheck**

Run: `pnpm --filter @repo/api typecheck`
Expected: No errors

**Step 6: Commit**

```bash
git add apps/api/src/trpc/procedures/waves.ts apps/api/src/trpc/procedures/accounts.ts
git commit -m "Wrap critical mutations in transactions (BLI-76)"
```

---

### Task 6: Add prepared statements for hot-path queries

**Files:**
- Modify: `apps/api/src/trpc/context.ts`
- Modify: `apps/api/src/trpc/procedures/profiles.ts`

Prepared statements pre-compile SQL once and reuse the binary, eliminating parse overhead on every call. Best for queries called on every request with the same structure.

**Step 1: Prepare session lookup query**

In `apps/api/src/trpc/context.ts`, define the prepared statement at module level (outside the function):

```ts
import { placeholder } from "drizzle-orm";

// Prepared statement — compiled once, reused on every authenticated request
const sessionByToken = db
  .select()
  .from(schema.session)
  .where(and(eq(schema.session.token, placeholder("token")), gt(schema.session.expiresAt, placeholder("now"))))
  .limit(1)
  .prepare("session_by_token");
```

Then in `createContext`, replace the inline query (lines 34-38) with:

```ts
const [session] = await sessionByToken.execute({ token, now: new Date() });
```

**Step 2: Prepare profiles.me query**

In `apps/api/src/trpc/procedures/profiles.ts`, define at module level (after imports, before the router):

```ts
import { placeholder } from "drizzle-orm";

const profileByUserId = db
  .select()
  .from(schema.profiles)
  .where(eq(schema.profiles.userId, placeholder("userId")))
  .prepare("profile_by_user_id");
```

Then in the `me` procedure, replace:
```ts
const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, ctx.userId));
```
with:
```ts
const [profile] = await profileByUserId.execute({ userId: ctx.userId });
```

**Step 3: Verify typecheck**

Run: `pnpm --filter @repo/api typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/api/src/trpc/context.ts apps/api/src/trpc/procedures/profiles.ts
git commit -m "Add prepared statements for hot-path queries (BLI-76)"
```
