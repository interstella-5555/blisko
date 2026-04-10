import { schema } from "@repo/db";
import { subHours } from "date-fns";
import { and, count, desc, eq, gte, ilike } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/lib/db";
import { protectedProcedure, router } from "../trpc";

const STATUSES = ["sent", "suppressed", "failed"] as const;

export const pushLogRouter = router({
  feed: protectedProcedure
    .input(
      z.object({
        status: z.enum(STATUSES).optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const { status, search, limit, offset } = input;

      const conditions = [];
      if (status) conditions.push(eq(schema.pushSends.status, status));
      if (search) conditions.push(ilike(schema.pushSends.body, `%${search}%`));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select({
          id: schema.pushSends.id,
          userId: schema.pushSends.userId,
          title: schema.pushSends.title,
          body: schema.pushSends.body,
          data: schema.pushSends.data,
          collapseId: schema.pushSends.collapseId,
          status: schema.pushSends.status,
          suppressionReason: schema.pushSends.suppressionReason,
          tokenCount: schema.pushSends.tokenCount,
          createdAt: schema.pushSends.createdAt,
        })
        .from(schema.pushSends)
        .where(where)
        .orderBy(desc(schema.pushSends.createdAt))
        .limit(limit)
        .offset(offset);

      // Resolve display names for userIds
      const userIds = [...new Set(rows.map((r) => r.userId))];
      let nameMap: Record<string, string> = {};
      if (userIds.length > 0) {
        try {
          const { inArray } = await import("drizzle-orm");
          const profiles = await db
            .select({ userId: schema.profiles.userId, displayName: schema.profiles.displayName })
            .from(schema.profiles)
            .where(inArray(schema.profiles.userId, userIds));
          nameMap = Object.fromEntries(profiles.map((p) => [p.userId, p.displayName ?? ""]));
        } catch {
          // DB lookup failed — return without names
        }
      }

      return { rows, nameMap };
    }),

  stats: protectedProcedure.query(async () => {
    const [total] = await db.select({ count: count() }).from(schema.pushSends);
    const [sent] = await db
      .select({ count: count() })
      .from(schema.pushSends)
      .where(eq(schema.pushSends.status, "sent"));
    const [suppressed] = await db
      .select({ count: count() })
      .from(schema.pushSends)
      .where(eq(schema.pushSends.status, "suppressed"));
    const [failed] = await db
      .select({ count: count() })
      .from(schema.pushSends)
      .where(eq(schema.pushSends.status, "failed"));

    // Last hour activity
    const oneHourAgo = subHours(new Date(), 1);
    const [lastHour] = await db
      .select({ count: count() })
      .from(schema.pushSends)
      .where(gte(schema.pushSends.createdAt, oneHourAgo));

    return {
      total: total.count,
      sent: sent.count,
      suppressed: suppressed.count,
      failed: failed.count,
      lastHour: lastHour.count,
    };
  }),
});
