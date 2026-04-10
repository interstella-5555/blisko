import { Queue, QueueEvents } from "bullmq";

const AI_QUEUE_NAME = "ai";
const OPS_QUEUE_NAME = "ops";
const JOB_TIMEOUT_MS = 15_000;

function getConnectionConfig() {
  const url = new URL(process.env.REDIS_URL!);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}

let _aiQueue: Queue | null = null;
let _opsQueue: Queue | null = null;
let _opsQueueEvents: QueueEvents | null = null;

export function getAiQueue(): Queue {
  if (!_aiQueue) {
    _aiQueue = new Queue(AI_QUEUE_NAME, {
      connection: { ...getConnectionConfig(), connectTimeout: 3000 },
    });
  }
  return _aiQueue;
}

export function getOpsQueue(): Queue {
  if (!_opsQueue) {
    _opsQueue = new Queue(OPS_QUEUE_NAME, {
      connection: { ...getConnectionConfig(), connectTimeout: 3000 },
    });
  }
  return _opsQueue;
}

function getOpsQueueEvents(): QueueEvents {
  if (!_opsQueueEvents) {
    _opsQueueEvents = new QueueEvents(OPS_QUEUE_NAME, { connection: getConnectionConfig() });
  }
  return _opsQueueEvents;
}

export async function enqueueAndWait<T extends Record<string, unknown>>(
  jobName: string,
  data: T,
  opts?: { jobId?: string },
): Promise<void> {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is not configured");
  }

  const job = await getOpsQueue().add(jobName, data, {
    jobId: opts?.jobId,
    removeOnComplete: { count: 200, age: 3600 },
    // Matches ops queue default (admin actions are low-volume, 90-day audit retention)
    removeOnFail: { age: 7_776_000 },
  });

  await job.waitUntilFinished(getOpsQueueEvents(), JOB_TIMEOUT_MS);
}
