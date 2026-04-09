import { schema } from "@repo/db";
import { aliasedTable, and, count, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/lib/db";
import { protectedProcedure, router } from "../trpc";

export const wavesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z.enum(["all", "pending", "accepted", "declined"]).default("all"),
        limit: z.number().min(1).max(100).default(25),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const { search, status, limit, offset } = input;

      const fromUser = aliasedTable(schema.user, "from_user");
      const toUser = aliasedTable(schema.user, "to_user");
      const fromProfile = aliasedTable(schema.profiles, "from_profile");
      const toProfile = aliasedTable(schema.profiles, "to_profile");

      const conditions = [];

      if (status !== "all") {
        conditions.push(eq(schema.waves.status, status));
      }

      if (search) {
        conditions.push(
          or(
            ilike(fromUser.name, `%${search}%`),
            ilike(fromUser.email, `%${search}%`),
            ilike(fromProfile.displayName, `%${search}%`),
            ilike(toUser.name, `%${search}%`),
            ilike(toUser.email, `%${search}%`),
            ilike(toProfile.displayName, `%${search}%`),
          ),
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const selectFields = {
        id: schema.waves.id,
        status: schema.waves.status,
        senderStatusSnapshot: schema.waves.senderStatusSnapshot,
        recipientStatusSnapshot: schema.waves.recipientStatusSnapshot,
        respondedAt: schema.waves.respondedAt,
        createdAt: schema.waves.createdAt,
        fromDisplayName: fromProfile.displayName,
        fromAvatarUrl: fromProfile.avatarUrl,
        fromEmail: fromUser.email,
        toDisplayName: toProfile.displayName,
        toAvatarUrl: toProfile.avatarUrl,
        toEmail: toUser.email,
      };

      const baseQuery = db
        .select(selectFields)
        .from(schema.waves)
        .innerJoin(fromUser, eq(schema.waves.fromUserId, fromUser.id))
        .innerJoin(fromProfile, eq(fromUser.id, fromProfile.userId))
        .innerJoin(toUser, eq(schema.waves.toUserId, toUser.id))
        .innerJoin(toProfile, eq(toUser.id, toProfile.userId));

      const rows = await baseQuery.where(where).orderBy(schema.waves.createdAt).limit(limit).offset(offset);

      const [{ total }] = await db
        .select({ total: count() })
        .from(schema.waves)
        .innerJoin(fromUser, eq(schema.waves.fromUserId, fromUser.id))
        .innerJoin(fromProfile, eq(fromUser.id, fromProfile.userId))
        .innerJoin(toUser, eq(schema.waves.toUserId, toUser.id))
        .innerJoin(toProfile, eq(toUser.id, toProfile.userId))
        .where(where);

      return { waves: rows, total };
    }),

  stats: protectedProcedure.query(async () => {
    const [totals] = await db.select({ count: count() }).from(schema.waves);

    const [pending] = await db.select({ count: count() }).from(schema.waves).where(eq(schema.waves.status, "pending"));

    const [accepted] = await db
      .select({ count: count() })
      .from(schema.waves)
      .where(eq(schema.waves.status, "accepted"));

    const [declined] = await db
      .select({ count: count() })
      .from(schema.waves)
      .where(eq(schema.waves.status, "declined"));

    const acceptRate =
      accepted.count + declined.count > 0 ? Math.round((accepted.count / (accepted.count + declined.count)) * 100) : 0;

    return {
      total: totals.count,
      pending: pending.count,
      accepted: accepted.count,
      declined: declined.count,
      acceptRate,
    };
  }),
});
