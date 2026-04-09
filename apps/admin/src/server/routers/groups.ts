import { schema } from "@repo/db";
import { and, avg, count, eq, ilike, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/lib/db";
import { protectedProcedure, router } from "../trpc";

export const groupsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        discoverable: z.enum(["all", "yes", "no"]).default("all"),
        limit: z.number().min(1).max(100).default(25),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const { search, discoverable, limit, offset } = input;

      const conditions = [eq(schema.conversations.type, "group"), isNull(schema.conversations.deletedAt)];

      if (discoverable === "yes") {
        conditions.push(eq(schema.conversations.isDiscoverable, true));
      } else if (discoverable === "no") {
        conditions.push(eq(schema.conversations.isDiscoverable, false));
      }

      if (search) {
        conditions.push(ilike(schema.conversations.name, `%${search}%`));
      }

      const where = and(...conditions);

      const memberCountSq = db
        .select({
          conversationId: schema.conversationParticipants.conversationId,
          memberCount: count().as("member_count"),
        })
        .from(schema.conversationParticipants)
        .groupBy(schema.conversationParticipants.conversationId)
        .as("member_counts");

      const rows = await db
        .select({
          id: schema.conversations.id,
          name: schema.conversations.name,
          description: schema.conversations.description,
          inviteCode: schema.conversations.inviteCode,
          isDiscoverable: schema.conversations.isDiscoverable,
          createdAt: schema.conversations.createdAt,
          creatorDisplayName: schema.profiles.displayName,
          memberCount: memberCountSq.memberCount,
        })
        .from(schema.conversations)
        .leftJoin(schema.profiles, eq(schema.conversations.creatorId, schema.profiles.userId))
        .leftJoin(memberCountSq, eq(schema.conversations.id, memberCountSq.conversationId))
        .where(where)
        .orderBy(schema.conversations.createdAt)
        .limit(limit)
        .offset(offset);

      const [{ total }] = await db.select({ total: count() }).from(schema.conversations).where(where);

      return {
        groups: rows.map((row) => ({
          ...row,
          memberCount: row.memberCount ?? 0,
        })),
        total,
      };
    }),

  stats: protectedProcedure.query(async () => {
    const groupCondition = and(eq(schema.conversations.type, "group"), isNull(schema.conversations.deletedAt));

    const [totals] = await db.select({ count: count() }).from(schema.conversations).where(groupCondition);

    const [discoverableCount] = await db
      .select({ count: count() })
      .from(schema.conversations)
      .where(and(groupCondition, eq(schema.conversations.isDiscoverable, true)));

    const [avgMembers] = await db
      .select({
        avg: avg(sql`member_count`).mapWith(Number),
      })
      .from(
        db
          .select({
            memberCount: count().as("member_count"),
          })
          .from(schema.conversationParticipants)
          .innerJoin(
            schema.conversations,
            and(eq(schema.conversationParticipants.conversationId, schema.conversations.id), groupCondition),
          )
          .groupBy(schema.conversationParticipants.conversationId)
          .as("group_members"),
      );

    return {
      total: totals.count,
      discoverable: discoverableCount.count,
      avgMembers: Math.round(avgMembers.avg || 0),
    };
  }),
});
