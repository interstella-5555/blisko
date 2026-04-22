import { and, eq, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { cancelHardDeleteUser, enqueueHardDeleteUser } from "@/services/queue-ops";
import { publishEvent } from "@/ws/redis-bridge";

export async function softDeleteUser(userId: string) {
  // Guard: skip if already soft-deleted (avoid resetting the 14-day grace period)
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { deletedAt: true },
  });
  if (user?.deletedAt) return;

  await db.transaction(async (tx) => {
    await tx.update(schema.user).set({ deletedAt: new Date() }).where(eq(schema.user.id, userId));
    await tx.delete(schema.session).where(eq(schema.session.userId, userId));
    await tx.delete(schema.pushTokens).where(eq(schema.pushTokens.userId, userId));
  });

  publishEvent("forceDisconnect", { userId });
  await enqueueHardDeleteUser(userId);
}

export async function restoreUser(userId: string) {
  await db.update(schema.user).set({ deletedAt: null }).where(eq(schema.user.id, userId));

  await cancelHardDeleteUser(userId);
}

export async function suspendUser(userId: string, reason: string) {
  // Guard: re-suspending is a no-op so we don't overwrite the existing reason or re-decline
  // waves that a previous suspension already closed out.
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { suspendedAt: true },
  });
  if (user?.suspendedAt) return;

  await db.transaction(async (tx) => {
    await tx
      .update(schema.user)
      .set({ suspendedAt: new Date(), suspendReason: reason })
      .where(eq(schema.user.id, userId));
    await tx.delete(schema.session).where(eq(schema.session.userId, userId));
    await tx.delete(schema.pushTokens).where(eq(schema.pushTokens.userId, userId));
    // Mirror waves.block: pending waves in either direction become stale once
    // the account is unreachable. Declining them keeps lists tidy for the peers.
    await tx
      .update(schema.waves)
      .set({ status: "declined", respondedAt: new Date() })
      .where(
        and(
          eq(schema.waves.status, "pending"),
          or(eq(schema.waves.fromUserId, userId), eq(schema.waves.toUserId, userId)),
        ),
      );
  });

  publishEvent("forceDisconnect", { userId });
}

export async function unsuspendUser(userId: string) {
  await db.update(schema.user).set({ suspendedAt: null, suspendReason: null }).where(eq(schema.user.id, userId));
}
