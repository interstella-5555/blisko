import { and, eq, inArray, lt, or } from "drizzle-orm";
import ms from "ms";
import { db, schema } from "@/db";

const DEFAULT_LIMIT = 500;
const DEFAULT_MIN_AGE_MS = ms("1 hour");

export interface CleanupTestUsersResult {
  found: number;
  deleted: number;
  sampledIds: string[];
}

/**
 * Physically deletes test users (and their relational data) from the DB.
 *
 * Capped at `limit` rows per call — subsequent runs catch any overflow.
 *
 * NOT anonymization (`processHardDeleteUser`) — those users are GDPR subjects
 * whose conversation history must be preserved. Test users are pure cruft.
 */
export async function cleanupTestUsers(opts?: { limit?: number; minAgeMs?: number }): Promise<CleanupTestUsersResult> {
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const minAgeMs = opts?.minAgeMs ?? DEFAULT_MIN_AGE_MS;
  const cutoff = new Date(Date.now() - minAgeMs);

  // "What is a test user" is now a column value (BLI-271). The flag is set at
  // creation time by /dev/auto-login (defaulting to `test`; seed-users.ts
  // overrides to `demo` for the chatbot seed). The 1h `createdAt` margin
  // protects an actively running CI suite from having its user yanked.
  const candidates = await db
    .select({ id: schema.user.id, email: schema.user.email })
    .from(schema.user)
    .where(and(eq(schema.user.type, "test"), lt(schema.user.createdAt, cutoff)))
    .limit(limit);

  if (candidates.length === 0) {
    return { found: 0, deleted: 0, sampledIds: [] };
  }

  const ids = candidates.map((u) => u.id);

  // Single transaction, dependency-ordered deletes. Mirrors
  // packages/dev-cli/src/cli.ts `cleanup-e2e` (BLI-178) in the SET of tables
  // it touches — when adding a new table with a `user` FK, update both lists
  // AND `processHardDeleteUser`.
  //
  // Two phases:
  //   A) Nuke conversations OWNED by test users — with ALL their participants
  //      and ratings regardless of author. Needed because a test user may have
  //      created a group a chatbot demo (`user0..249`) joined, and
  //      `conversation_participants`/`conversation_ratings` have NO ACTION FKs
  //      to `conversations` → deleting the conversation would fail on the
  //      non-test participant's row and roll back the whole tx.
  //      `messages`/`topics`/`message_reactions` cascade via `conversations`.
  //   B) Remaining test-user rows in OTHER conversations (owned by non-test
  //      users, e.g. chatbots) + everything else keyed on user.id.
  await db.transaction(async (tx) => {
    // --- Phase A: conversations the test users created ---
    const ownedConvRows = await tx
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(inArray(schema.conversations.creatorId, ids));
    const ownedConvIds = ownedConvRows.map((c) => c.id);

    if (ownedConvIds.length > 0) {
      await tx
        .delete(schema.conversationParticipants)
        .where(inArray(schema.conversationParticipants.conversationId, ownedConvIds));
      await tx
        .delete(schema.conversationRatings)
        .where(inArray(schema.conversationRatings.conversationId, ownedConvIds));
      // messages, message_reactions, topics cascade via conversations.
      await tx.delete(schema.conversations).where(inArray(schema.conversations.id, ownedConvIds));
    }

    // --- Phase B: test-user rows everywhere else ---
    await tx
      .delete(schema.statusMatches)
      .where(or(inArray(schema.statusMatches.userId, ids), inArray(schema.statusMatches.matchedUserId, ids)));
    await tx.delete(schema.messageReactions).where(inArray(schema.messageReactions.userId, ids));
    await tx.delete(schema.messages).where(inArray(schema.messages.senderId, ids));
    await tx.delete(schema.conversationParticipants).where(inArray(schema.conversationParticipants.userId, ids));
    await tx.delete(schema.conversationRatings).where(inArray(schema.conversationRatings.userId, ids));
    await tx
      .delete(schema.connectionAnalyses)
      .where(or(inArray(schema.connectionAnalyses.fromUserId, ids), inArray(schema.connectionAnalyses.toUserId, ids)));
    await tx.delete(schema.waves).where(or(inArray(schema.waves.fromUserId, ids), inArray(schema.waves.toUserId, ids)));
    await tx
      .delete(schema.blocks)
      .where(or(inArray(schema.blocks.blockerId, ids), inArray(schema.blocks.blockedId, ids)));
    await tx.delete(schema.pushTokens).where(inArray(schema.pushTokens.userId, ids));
    await tx.delete(schema.topics).where(inArray(schema.topics.creatorId, ids));
    // CASCADE handles: profiles, sessions, account, profilingSessions, profilingQA
    await tx.delete(schema.user).where(inArray(schema.user.id, ids));
  });

  return {
    found: candidates.length,
    deleted: candidates.length,
    sampledIds: candidates.slice(0, 5).map((u) => u.id),
  };
}
