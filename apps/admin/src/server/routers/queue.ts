import { schema } from "@repo/db";
import type { Job, Queue } from "bullmq";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/lib/db";
import { enqueueMaintenanceAndWait, getAiQueue, getMaintenanceQueue, getOpsQueue } from "~/lib/queue";
import { protectedProcedure, router } from "../trpc";

// `scheduled` is a pseudo-state we add on top of BullMQ's real states — it's the one
// permanent delayed marker each Job Scheduler keeps as "next run". Separating it from
// `delayed` keeps the real delayed count honest (= retries waiting on backoff).
const JOB_STATES = ["active", "waiting", "delayed", "scheduled", "completed", "failed"] as const;
const BULLMQ_STATES = ["active", "waiting", "delayed", "completed", "failed"] as const;
type BullmqState = (typeof BULLMQ_STATES)[number];
const JOB_SOURCES = ["ai", "ops", "maintenance"] as const;
type JobSource = (typeof JOB_SOURCES)[number];

type StateCounts = Record<(typeof JOB_STATES)[number], number>;

const EMPTY_COUNTS: StateCounts = {
  active: 0,
  waiting: 0,
  delayed: 0,
  scheduled: 0,
  completed: 0,
  failed: 0,
};

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

type SchedulerInfo = {
  key: string;
  name: string;
  next: number | null;
  pattern: string | null;
  every: number | null;
  tz: string | null;
};

type SchedulerIndex = {
  bySource: Record<JobSource, Map<string, SchedulerInfo>>;
  all: Array<SchedulerInfo & { source: JobSource }>;
};

async function loadSchedulers(sources: readonly JobSource[]): Promise<SchedulerIndex> {
  const bySource = { ai: new Map(), ops: new Map(), maintenance: new Map() } as SchedulerIndex["bySource"];
  const all: SchedulerIndex["all"] = [];

  await Promise.all(
    sources.map(async (source) => {
      try {
        const schedulers = await getQueueBySource(source).getJobSchedulers(0, -1, true);
        for (const raw of schedulers) {
          const info: SchedulerInfo = {
            key: String(raw.key ?? raw.name ?? ""),
            name: String(raw.name ?? raw.key ?? ""),
            next: typeof raw.next === "number" ? raw.next : null,
            pattern: typeof raw.pattern === "string" ? raw.pattern : null,
            every: typeof raw.every === "number" ? raw.every : null,
            tz: typeof raw.tz === "string" ? raw.tz : null,
          };
          bySource[source].set(info.name, info);
          all.push({ ...info, source });
        }
      } catch {
        // Queue unreachable — leave empty for this source
      }
    }),
  );

  return { bySource, all };
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
        const { type, state, limit } = input;

        // Scheduler index — lets us reclassify delayed markers as `scheduled`
        // and enrich them with cron/interval metadata.
        const schedulers = await loadSchedulers(sources);

        // Map requested pseudo-state back to the BullMQ state we need to fetch.
        const statesToFetch: BullmqState[] = state
          ? state === "scheduled"
            ? ["delayed"]
            : [state]
          : [...BULLMQ_STATES];

        const queues = sources.map((source) => ({ queue: getQueueBySource(source), source }));

        const jobsByStatePerQueue = await Promise.all(
          queues.flatMap(({ queue, source }) =>
            statesToFetch.map(async (bullState) => {
              const jobs = await queue.getJobs([bullState], 0, limit - 1);
              return jobs.map((job) => mapJob(job, bullState, source, schedulers.bySource[source]));
            }),
          ),
        );

        let allJobs = jobsByStatePerQueue.flat();

        // Enforce the requested pseudo-state. `delayed` now excludes scheduler markers.
        if (state) allJobs = allJobs.filter((j) => j.state === state);
        if (type) allJobs = allJobs.filter((j) => j.type === type);

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
      const schedulers = await loadSchedulers(JOB_SOURCES);

      const [ai, ops, maintenance] = await Promise.all([
        getAiQueue().getJobCounts(),
        getOpsQueue().getJobCounts(),
        getMaintenanceQueue().getJobCounts(),
      ]);

      const build = (counts: Record<string, number>, source: JobSource): StateCounts => {
        // Each scheduler keeps exactly one permanent delayed marker — subtract those
        // from `delayed` and surface them as `scheduled` instead.
        const scheduled = schedulers.bySource[source].size;
        const delayed = Math.max(0, (counts.delayed ?? 0) - scheduled);
        return {
          active: counts.active ?? 0,
          waiting: counts.waiting ?? 0,
          delayed,
          scheduled,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
        };
      };

      const aiCounts = build(ai, "ai");
      const opsCounts = build(ops, "ops");
      const maintenanceCounts = build(maintenance, "maintenance");

      return {
        ai: aiCounts,
        ops: opsCounts,
        maintenance: maintenanceCounts,
        total: {
          active: aiCounts.active + opsCounts.active + maintenanceCounts.active,
          waiting: aiCounts.waiting + opsCounts.waiting + maintenanceCounts.waiting,
          delayed: aiCounts.delayed + opsCounts.delayed + maintenanceCounts.delayed,
          scheduled: aiCounts.scheduled + opsCounts.scheduled + maintenanceCounts.scheduled,
          completed: aiCounts.completed + opsCounts.completed + maintenanceCounts.completed,
          failed: aiCounts.failed + opsCounts.failed + maintenanceCounts.failed,
        },
      };
    } catch {
      return empty;
    }
  }),
});

function mapJob(job: Job, bullState: BullmqState, source: JobSource, schedulerIndex: Map<string, SchedulerInfo>) {
  const scheduler = bullState === "delayed" ? schedulerIndex.get(job.name) : undefined;
  const state = scheduler ? "scheduled" : bullState;

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
    scheduler: scheduler
      ? {
          next: scheduler.next,
          pattern: scheduler.pattern,
          every: scheduler.every,
        }
      : null,
  };
}
