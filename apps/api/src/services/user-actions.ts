import { eq } from "drizzle-orm";
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
