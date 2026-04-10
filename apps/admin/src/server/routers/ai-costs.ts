import { schema } from "@repo/db";
import { subDays, subHours } from "date-fns";
import { and, count, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/lib/db";
import { protectedProcedure, router } from "../trpc";

const WINDOW = z.enum(["24h", "7d"]);
type Window = z.infer<typeof WINDOW>;

function windowStart(window: Window): Date {
  return window === "24h" ? subHours(new Date(), 24) : subDays(new Date(), 7);
}

async function resolveDisplayNames(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const profiles = await db
    .select({ userId: schema.profiles.userId, displayName: schema.profiles.displayName })
    .from(schema.profiles)
    .where(inArray(schema.profiles.userId, userIds));
  return Object.fromEntries(profiles.map((p) => [p.userId, p.displayName ?? ""]));
}

export const aiCostsRouter = router({
  summary: protectedProcedure.input(z.object({ window: WINDOW })).query(async ({ input }) => {
    const since = windowStart(input.window);

    const [agg] = await db
      .select({
        totalCalls: count(),
        totalTokens: sql<string>`COALESCE(SUM(${schema.aiCalls.totalTokens}), 0)::bigint`,
        totalCostUsd: sql<string>`COALESCE(SUM(${schema.aiCalls.estimatedCostUsd}), 0)::numeric`,
      })
      .from(schema.aiCalls)
      .where(gte(schema.aiCalls.timestamp, since));

    const [top] = await db
      .select({
        jobName: schema.aiCalls.jobName,
        totalCostUsd: sql<string>`SUM(${schema.aiCalls.estimatedCostUsd})::numeric`,
      })
      .from(schema.aiCalls)
      .where(gte(schema.aiCalls.timestamp, since))
      .groupBy(schema.aiCalls.jobName)
      .orderBy(desc(sql`SUM(${schema.aiCalls.estimatedCostUsd})`))
      .limit(1);

    const totalCalls = Number(agg?.totalCalls ?? 0);
    const totalCost = Number(agg?.totalCostUsd ?? 0);

    return {
      totalCalls,
      totalTokens: Number(agg?.totalTokens ?? 0),
      totalCostUsd: totalCost,
      avgCostUsd: totalCalls > 0 ? totalCost / totalCalls : 0,
      topJobName: top?.jobName ?? null,
    };
  }),

  byJobName: protectedProcedure.input(z.object({ window: WINDOW })).query(async ({ input }) => {
    const since = windowStart(input.window);
    const rows = await db
      .select({
        jobName: schema.aiCalls.jobName,
        count: count(),
        totalTokens: sql<string>`SUM(${schema.aiCalls.totalTokens})::bigint`,
        avgDurationMs: sql<string>`AVG(${schema.aiCalls.durationMs})::int`,
        totalCostUsd: sql<string>`SUM(${schema.aiCalls.estimatedCostUsd})::numeric`,
      })
      .from(schema.aiCalls)
      .where(gte(schema.aiCalls.timestamp, since))
      .groupBy(schema.aiCalls.jobName)
      .orderBy(desc(sql`SUM(${schema.aiCalls.estimatedCostUsd})`));

    return rows.map((r) => ({
      jobName: r.jobName,
      count: Number(r.count),
      totalTokens: Number(r.totalTokens),
      avgDurationMs: Number(r.avgDurationMs),
      totalCostUsd: Number(r.totalCostUsd),
    }));
  }),

  byModel: protectedProcedure.input(z.object({ window: WINDOW })).query(async ({ input }) => {
    const since = windowStart(input.window);
    const rows = await db
      .select({
        model: schema.aiCalls.model,
        count: count(),
        totalTokens: sql<string>`SUM(${schema.aiCalls.totalTokens})::bigint`,
        totalCostUsd: sql<string>`SUM(${schema.aiCalls.estimatedCostUsd})::numeric`,
      })
      .from(schema.aiCalls)
      .where(gte(schema.aiCalls.timestamp, since))
      .groupBy(schema.aiCalls.model)
      .orderBy(desc(sql`SUM(${schema.aiCalls.estimatedCostUsd})`));

    return rows.map((r) => ({
      model: r.model,
      count: Number(r.count),
      totalTokens: Number(r.totalTokens),
      totalCostUsd: Number(r.totalCostUsd),
    }));
  }),

  byDay: protectedProcedure.input(z.object({ window: WINDOW.default("7d") })).query(async ({ input }) => {
    const since = windowStart(input.window);
    const rows = await db
      .select({
        day: sql<string>`DATE_TRUNC('day', ${schema.aiCalls.timestamp})::date::text`,
        calls: count(),
        totalCostUsd: sql<string>`SUM(${schema.aiCalls.estimatedCostUsd})::numeric`,
      })
      .from(schema.aiCalls)
      .where(gte(schema.aiCalls.timestamp, since))
      .groupBy(sql`DATE_TRUNC('day', ${schema.aiCalls.timestamp})`)
      .orderBy(sql`DATE_TRUNC('day', ${schema.aiCalls.timestamp})`);

    return rows.map((r) => ({
      day: r.day,
      calls: Number(r.calls),
      totalCostUsd: Number(r.totalCostUsd),
    }));
  }),

  topUsers: protectedProcedure
    .input(z.object({ window: WINDOW, limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      const since = windowStart(input.window);
      const rows = await db
        .select({
          userId: schema.aiCalls.userId,
          calls: count(),
          totalCostUsd: sql<string>`SUM(${schema.aiCalls.estimatedCostUsd})::numeric`,
        })
        .from(schema.aiCalls)
        .where(and(gte(schema.aiCalls.timestamp, since), isNotNull(schema.aiCalls.userId)))
        .groupBy(schema.aiCalls.userId)
        .orderBy(desc(sql`SUM(${schema.aiCalls.estimatedCostUsd})`))
        .limit(input.limit);

      const userIds = rows.map((r) => r.userId).filter((id): id is string => id !== null);
      const nameMap = await resolveDisplayNames(userIds);

      return rows.map((r) => ({
        userId: r.userId as string,
        displayName: r.userId ? (nameMap[r.userId] ?? "") : "",
        calls: Number(r.calls),
        totalCostUsd: Number(r.totalCostUsd),
      }));
    }),

  feed: protectedProcedure
    .input(
      z.object({
        jobName: z.string().optional(),
        userId: z.string().optional(),
        status: z.enum(["success", "failed"]).optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const conditions = [];
      if (input.jobName) conditions.push(eq(schema.aiCalls.jobName, input.jobName));
      if (input.userId) conditions.push(eq(schema.aiCalls.userId, input.userId));
      if (input.status) conditions.push(eq(schema.aiCalls.status, input.status));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select()
        .from(schema.aiCalls)
        .where(where)
        .orderBy(desc(schema.aiCalls.timestamp))
        .limit(input.limit)
        .offset(input.offset);

      const userIds = [...new Set(rows.flatMap((r) => [r.userId, r.targetUserId]).filter((id): id is string => !!id))];
      const nameMap = await resolveDisplayNames(userIds);

      return { rows, nameMap };
    }),
});
