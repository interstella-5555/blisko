import { schema } from "@repo/db";
import { aliasedTable, and, avg, count, desc, eq, gte, ilike, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/lib/db";
import { protectedProcedure, router } from "../trpc";

export const matchingRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        tierFilter: z.enum(["all", "t1", "t2", "t3"]).default("all"),
        sort: z.enum(["newest", "highest"]).default("newest"),
        limit: z.number().min(1).max(100).default(25),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const { search, tierFilter, sort, limit, offset } = input;

      const fromUser = aliasedTable(schema.user, "from_user");
      const toUser = aliasedTable(schema.user, "to_user");
      const fromProfile = aliasedTable(schema.profiles, "from_profile");
      const toProfile = aliasedTable(schema.profiles, "to_profile");

      const conditions = [];

      if (tierFilter !== "all") {
        conditions.push(eq(schema.connectionAnalyses.tier, tierFilter));
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
        id: schema.connectionAnalyses.id,
        aiMatchScore: schema.connectionAnalyses.aiMatchScore,
        tier: schema.connectionAnalyses.tier,
        shortSnippet: schema.connectionAnalyses.shortSnippet,
        createdAt: schema.connectionAnalyses.createdAt,
        fromDisplayName: fromProfile.displayName,
        fromAvatarUrl: fromProfile.avatarUrl,
        fromEmail: fromUser.email,
        toDisplayName: toProfile.displayName,
        toAvatarUrl: toProfile.avatarUrl,
        toEmail: toUser.email,
      };

      const orderBy =
        sort === "highest" ? desc(schema.connectionAnalyses.aiMatchScore) : desc(schema.connectionAnalyses.createdAt);

      const baseQuery = db
        .select(selectFields)
        .from(schema.connectionAnalyses)
        .innerJoin(fromUser, eq(schema.connectionAnalyses.fromUserId, fromUser.id))
        .innerJoin(fromProfile, eq(fromUser.id, fromProfile.userId))
        .innerJoin(toUser, eq(schema.connectionAnalyses.toUserId, toUser.id))
        .innerJoin(toProfile, eq(toUser.id, toProfile.userId));

      const rows = await baseQuery.where(where).orderBy(orderBy).limit(limit).offset(offset);

      const [{ total }] = await db
        .select({ total: count() })
        .from(schema.connectionAnalyses)
        .innerJoin(fromUser, eq(schema.connectionAnalyses.fromUserId, fromUser.id))
        .innerJoin(fromProfile, eq(fromUser.id, fromProfile.userId))
        .innerJoin(toUser, eq(schema.connectionAnalyses.toUserId, toUser.id))
        .innerJoin(toProfile, eq(toUser.id, toProfile.userId))
        .where(where);

      return { analyses: rows, total };
    }),

  stats: protectedProcedure.query(async () => {
    const [totals] = await db.select({ count: count() }).from(schema.connectionAnalyses);

    const [avgScore] = await db
      .select({ avg: avg(schema.connectionAnalyses.aiMatchScore) })
      .from(schema.connectionAnalyses);

    const [highMatches] = await db
      .select({ count: count() })
      .from(schema.connectionAnalyses)
      .where(gte(schema.connectionAnalyses.aiMatchScore, 75));

    const [lowMatches] = await db
      .select({ count: count() })
      .from(schema.connectionAnalyses)
      .where(lt(schema.connectionAnalyses.aiMatchScore, 25));

    return {
      total: totals.count,
      avgScore: avgScore.avg ? Math.round(Number(avgScore.avg)) : 0,
      highMatches: highMatches.count,
      lowMatches: lowMatches.count,
    };
  }),
});
