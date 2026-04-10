import { schema } from "@repo/db";
import type { Job, Queue } from "bullmq";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/lib/db";
import { enqueueMaintenanceAndWait, getAiQueue, getMaintenanceQueue, getOpsQueue } from "~/lib/queue";
import { protectedProcedure, router } from "../trpc";

const JOB_STATES = ["active", "waiting", "delayed", "completed", "failed"] as const;
const JOB_SOURCES = ["ai", "ops", "maintenance"] as const;
type JobSource = (typeof JOB_SOURCES)[number];

type StateCounts = Record<(typeof JOB_STATES)[number], number>;

const EMPTY_COUNTS: StateCounts = { active: 0, waiting: 0, delayed: 0, completed: 0, failed: 0 };

function getQueueBySource(source: JobSource): Queue {
  switch (source) {
    case "ai":
      return getAiQueue();
    case "ops":
      return getOpsQueue();
    case "maintenance":
      return getMaintenanceQueue();
  }
}

export const queueRouter = router({
  feed: protectedProcedure
    .input(
      z.object({
        source: z.enum(JOB_SOURCES).optional(),
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
        const sources: JobSource[] = input.source ? [input.source] : [...JOB_SOURCES];
        const queues = sources.map((source) => ({ queue: getQueueBySource(source), source }));
        const { type, state, limit } = input;

        const statesToFetch = state ? [state] : [...JOB_STATES];

        const jobsByStatePerQueue = await Promise.all(
          queues.flatMap(({ queue, source }) =>
            statesToFetch.map(async (s) => {
              const jobs = await queue.getJobs([s], 0, limit - 1);
              return jobs.map((job) => mapJob(job, s, source));
            }),
          ),
        );

        let allJobs = jobsByStatePerQueue.flat();

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

  runConsistencySweep: protectedProcedure.mutation(async () => {
    const result = await enqueueMaintenanceAndWait("consistency-sweep", { type: "consistency-sweep" });
    return result as {
      zombieProfiles: { found: number; enqueued: number };
      stuckSessions: { found: number; enqueued: number };
      abandonedSessions: { found: number; cleaned: number };
    };
  }),

  stats: protectedProcedure.query(async () => {
    const empty = {
      ai: { ...EMPTY_COUNTS },
      ops: { ...EMPTY_COUNTS },
      maintenance: { ...EMPTY_COUNTS },
      total: { ...EMPTY_COUNTS },
    };

    if (!process.env.REDIS_URL) return empty;

    try {
      const [ai, ops, maintenance] = await Promise.all([
        getAiQueue().getJobCounts(),
        getOpsQueue().getJobCounts(),
        getMaintenanceQueue().getJobCounts(),
      ]);

      const pick = (c: Record<string, number>): StateCounts => ({
        active: c.active ?? 0,
        waiting: c.waiting ?? 0,
        delayed: c.delayed ?? 0,
        completed: c.completed ?? 0,
        failed: c.failed ?? 0,
      });

      const aiCounts = pick(ai);
      const opsCounts = pick(ops);
      const maintenanceCounts = pick(maintenance);

      return {
        ai: aiCounts,
        ops: opsCounts,
        maintenance: maintenanceCounts,
        total: {
          active: aiCounts.active + opsCounts.active + maintenanceCounts.active,
          waiting: aiCounts.waiting + opsCounts.waiting + maintenanceCounts.waiting,
          delayed: aiCounts.delayed + opsCounts.delayed + maintenanceCounts.delayed,
          completed: aiCounts.completed + opsCounts.completed + maintenanceCounts.completed,
          failed: aiCounts.failed + opsCounts.failed + maintenanceCounts.failed,
        },
      };
    } catch {
      return empty;
    }
  }),
});

function mapJob(job: Job, state: string, source: JobSource) {
  return {
    id: job.id ?? "",
    type: job.name,
    state,
    source,
    data: job.data as Record<string, unknown>,
    createdAt: job.timestamp,
    processedOn: job.processedOn ?? null,
    finishedOn: job.finishedOn ?? null,
    duration: job.processedOn && job.finishedOn ? job.finishedOn - job.processedOn : null,
    failedReason: job.failedReason || null,
    attemptsMade: job.attemptsMade,
  };
}
