import { schema } from "@repo/db";
import type { Job } from "bullmq";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/lib/db";
import { getQueue } from "~/lib/queue";
import { protectedProcedure, router } from "../trpc";

const JOB_STATES = ["active", "waiting", "delayed", "completed", "failed"] as const;

export const queueRouter = router({
  feed: protectedProcedure
    .input(
      z.object({
        type: z.string().optional(),
        state: z.enum(JOB_STATES).optional(),
        limit: z.number().min(1).max(200).default(50),
      }),
    )
    .query(async ({ input }) => {
      if (!process.env.REDIS_URL)
        return { jobs: [] as ReturnType<typeof mapJob>[], nameMap: {} as Record<string, string> };

      let result: ReturnType<typeof mapJob>[];
      try {
        const queue = getQueue();
        const { type, state, limit } = input;

        const statesToFetch = state ? [state] : [...JOB_STATES];

        const jobsByState = await Promise.all(
          statesToFetch.map(async (s) => {
            const jobs = await queue.getJobs([s], 0, limit - 1);
            return jobs.map((job) => mapJob(job, s));
          }),
        );

        let allJobs = jobsByState.flat();

        if (type) {
          allJobs = allJobs.filter((j) => j.type === type);
        }

        result = allJobs.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
      } catch {
        return { jobs: [], nameMap: {} };
      }

      // Resolve userIds to display names (best-effort)
      let nameMap: Record<string, string> = {};
      try {
        const userIds = new Set<string>();
        for (const job of result) {
          for (const key of ["userId", "userAId", "userBId"]) {
            const val = job.data[key];
            if (typeof val === "string" && val.length > 8) userIds.add(val);
          }
        }

        if (userIds.size > 0) {
          const profiles = await db
            .select({ userId: schema.profiles.userId, displayName: schema.profiles.displayName })
            .from(schema.profiles)
            .where(inArray(schema.profiles.userId, [...userIds]));
          nameMap = Object.fromEntries(profiles.map((p) => [p.userId, p.displayName ?? ""]));
        }
      } catch {
        // DB unavailable — return jobs without names
      }

      return { jobs: result, nameMap };
    }),

  stats: protectedProcedure.query(async () => {
    if (!process.env.REDIS_URL) {
      return { active: 0, waiting: 0, delayed: 0, completed: 0, failed: 0 };
    }

    try {
      const queue = getQueue();
      const counts = await queue.getJobCounts();
      return {
        active: counts.active ?? 0,
        waiting: counts.waiting ?? 0,
        delayed: counts.delayed ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
      };
    } catch {
      return { active: 0, waiting: 0, delayed: 0, completed: 0, failed: 0 };
    }
  }),
});

function mapJob(job: Job, state: string) {
  return {
    id: job.id ?? "",
    type: job.name,
    state,
    data: job.data as Record<string, unknown>,
    createdAt: job.timestamp,
    processedOn: job.processedOn ?? null,
    finishedOn: job.finishedOn ?? null,
    duration: job.processedOn && job.finishedOn ? job.finishedOn - job.processedOn : null,
    failedReason: job.failedReason || null,
    attemptsMade: job.attemptsMade,
  };
}
