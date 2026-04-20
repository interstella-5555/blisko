import type { Worker } from "bullmq";
import { RedisClient } from "bun";
import { recordJobCompleted, recordJobFailed } from "./queue-metrics";
import { Sentry } from "./sentry";

export const QUEUE_NAMES = {
  ai: "ai",
  ops: "ops",
  maintenance: "maintenance",
} as const;

export function getConnectionConfig() {
  const url = new URL(process.env.REDIS_URL!);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}

let _redisPub: RedisClient | null = null;

export function getRedisPub(): RedisClient | null {
  if (!process.env.REDIS_URL) return null;
  if (!_redisPub) {
    _redisPub = new RedisClient(process.env.REDIS_URL);
  }
  return _redisPub;
}

/** Attach standard completed/failed logging and metrics to a worker. */
export function attachWorkerLogger(worker: Worker, queueName: string) {
  worker.on("completed", (job) => {
    const durationMs = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
    recordJobCompleted(queueName, durationMs);
    console.log(`[queue:${queueName}] Job ${job.id} completed (${job.data.type}) ${durationMs}ms`);
  });
  worker.on("failed", (job, err) => {
    recordJobFailed(queueName);
    console.error(`[queue:${queueName}] Job ${job?.id} failed:`, err.message);
    // Only report to Sentry once attempts are exhausted — we don't want noise from
    // intermediate retry failures that BullMQ recovers from.
    if (job && (!job.opts.attempts || job.attemptsMade >= job.opts.attempts)) {
      Sentry.captureException(err, {
        tags: { queue: queueName, jobType: (job.data as { type?: string })?.type ?? "unknown" },
        extra: { jobId: job.id, attemptsMade: job.attemptsMade },
      });
    }
  });
}
