import { schema } from "@repo/db";
import { aliasedTable, and, count, desc, eq, gte, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/lib/db";
import { publicProcedure, router } from "../trpc";

export const conversationsRouter = router({
  list: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(25),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const { search, limit, offset } = input;

      const p1 = aliasedTable(schema.conversationParticipants, "p1");
      const p2 = aliasedTable(schema.conversationParticipants, "p2");
      const u1 = aliasedTable(schema.user, "u1");
      const u2 = aliasedTable(schema.user, "u2");
      const prof1 = aliasedTable(schema.profiles, "prof1");
      const prof2 = aliasedTable(schema.profiles, "prof2");

      const messageCountSq = db
        .select({
          conversationId: schema.messages.conversationId,
          messageCount: count().as("message_count"),
          lastMessageAt: sql<Date>`max(${schema.messages.createdAt})`.as("last_message_at"),
        })
        .from(schema.messages)
        .where(isNull(schema.messages.deletedAt))
        .groupBy(schema.messages.conversationId)
        .as("msg_counts");

      const conditions = [
        eq(schema.conversations.type, "dm"),
        isNull(schema.conversations.deletedAt),
        sql`${p1.userId} < ${p2.userId}`,
      ];

      if (search) {
        conditions.push(
          or(
            ilike(prof1.displayName, `%${search}%`),
            ilike(u1.email, `%${search}%`),
            ilike(prof2.displayName, `%${search}%`),
            ilike(u2.email, `%${search}%`),
          )!,
        );
      }

      const where = and(...conditions);

      const selectFields = {
        id: schema.conversations.id,
        createdAt: schema.conversations.createdAt,
        p1DisplayName: prof1.displayName,
        p1AvatarUrl: prof1.avatarUrl,
        p1Email: u1.email,
        p2DisplayName: prof2.displayName,
        p2AvatarUrl: prof2.avatarUrl,
        p2Email: u2.email,
        messageCount: messageCountSq.messageCount,
        lastMessageAt: messageCountSq.lastMessageAt,
      };

      const baseQuery = db
        .select(selectFields)
        .from(schema.conversations)
        .innerJoin(p1, eq(schema.conversations.id, p1.conversationId))
        .innerJoin(p2, eq(schema.conversations.id, p2.conversationId))
        .innerJoin(u1, eq(p1.userId, u1.id))
        .innerJoin(u2, eq(p2.userId, u2.id))
        .innerJoin(prof1, eq(u1.id, prof1.userId))
        .innerJoin(prof2, eq(u2.id, prof2.userId))
        .leftJoin(messageCountSq, eq(schema.conversations.id, messageCountSq.conversationId));

      const rows = await baseQuery
        .where(where)
        .orderBy(desc(sql`coalesce(${messageCountSq.lastMessageAt}, ${schema.conversations.createdAt})`))
        .limit(limit)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: count() })
        .from(schema.conversations)
        .innerJoin(p1, eq(schema.conversations.id, p1.conversationId))
        .innerJoin(p2, eq(schema.conversations.id, p2.conversationId))
        .innerJoin(u1, eq(p1.userId, u1.id))
        .innerJoin(u2, eq(p2.userId, u2.id))
        .innerJoin(prof1, eq(u1.id, prof1.userId))
        .innerJoin(prof2, eq(u2.id, prof2.userId))
        .where(where);

      return {
        conversations: rows.map((row) => ({
          ...row,
          messageCount: row.messageCount ?? 0,
        })),
        total,
      };
    }),

  stats: publicProcedure.query(async () => {
    const dmCondition = and(eq(schema.conversations.type, "dm"), isNull(schema.conversations.deletedAt));

    const [totals] = await db.select({ count: count() }).from(schema.conversations).where(dmCondition);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [active] = await db.select({ count: count() }).from(
      db
        .selectDistinct({ conversationId: schema.messages.conversationId })
        .from(schema.messages)
        .innerJoin(schema.conversations, and(eq(schema.messages.conversationId, schema.conversations.id), dmCondition))
        .where(and(gte(schema.messages.createdAt, sevenDaysAgo), isNull(schema.messages.deletedAt)))
        .as("active_convos"),
    );

    const [totalMessages] = await db
      .select({ count: count() })
      .from(schema.messages)
      .innerJoin(schema.conversations, and(eq(schema.messages.conversationId, schema.conversations.id), dmCondition))
      .where(isNull(schema.messages.deletedAt));

    return {
      total: totals.count,
      active: active.count,
      totalMessages: totalMessages.count,
    };
  }),
});
