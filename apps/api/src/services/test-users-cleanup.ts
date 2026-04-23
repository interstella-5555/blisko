import { and, inArray, like, lt, notLike, or } from "drizzle-orm";
import ms from "ms";
import { db, schema } from "@/db";

const DEFAULT_LIMIT = 500;
const DEFAULT_MIN_AGE_MS = ms("1 hour");

/**
 * Test user email classifier — mirrors the SQL filter used by `cleanupTestUsers`:
 *   email LIKE '%@example.com' AND email NOT LIKE 'user%@example.com'
 *
 * Used:
 *   1. by tests, to lock the predicate down
 *   2. (future, BLI-271) by /dev/auto-login to set user.isTestUser on insert
 *
 * The chatbot demo users (user0..user249@example.com) are protected by the
 * `LIKE 'user%@example.com'` exclusion. This is intentionally conservative —
 * any `user*@example.com` is preserved, even non-numeric suffixes that could
 * plausibly be test users.
 */
export function isTestUserEmail(email: string): boolean {
  return email.endsWith("@example.com") && !email.startsWith("user");
}

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

  // === "What is a test user" — single source of truth for the predicate ===
  // Today: email pattern. The chatbot demo users `user[0-249]@example.com`
  // are protected by the NOT LIKE exclusion. The 1h `createdAt` margin
  // protects an actively running CI suite from having its user yanked.
  //
  // BLI-271 will replace this WHERE with `isTestUser = true AND createdAt < cutoff`
  // once the marker column lands. When you change this definition, also check:
  //   - apps/admin/src/server/routers/users.ts — `seedFilter`
  //   - packages/dev-cli/src/cli.ts — `cleanup-e2e` command
  //   - apps/api/src/index.ts — `/dev/auto-login` (where the flag will be set)
  const candidates = await db
    .select({ id: schema.user.id, email: schema.user.email })
    .from(schema.user)
    .where(
      and(
        like(schema.user.email, "%@example.com"),
        notLike(schema.user.email, "user%@example.com"),
        lt(schema.user.createdAt, cutoff),
      ),
    )
    .limit(limit);

  if (candidates.length === 0) {
    return { found: 0, deleted: 0, sampledIds: [] };
  }

  const ids = candidates.map((u) => u.id);

  // Single transaction, dependency-ordered deletes. Mirrors
  // packages/dev-cli/src/cli.ts `cleanup-e2e` (BLI-178) in the SET of tables
  // it touches — when adding a new table with a `user` FK, update both lists
  // AND `processHardDeleteUser`.
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.statusMatches)
      .where(or(inArray(schema.statusMatches.userId, ids), inArray(schema.statusMatches.matchedUserId, ids)));
    await tx.delete(schema.messageReactions).where(inArray(schema.messageReactions.userId, ids));
    await tx.delete(schema.messages).where(inArray(schema.messages.senderId, ids));
    await tx.delete(schema.conversationParticipants).where(inArray(schema.conversationParticipants.userId, ids));
    await tx.delete(schema.conversationRatings).where(inArray(schema.conversationRatings.userId, ids));
    await tx.delete(schema.conversations).where(inArray(schema.conversations.creatorId, ids));
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
