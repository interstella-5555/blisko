import { Queue, QueueEvents } from "bullmq";

const AI_QUEUE_NAME = "ai-jobs";
const OPS_QUEUE_NAME = "ops";
const JOB_TIMEOUT_MS = 15_000;

// Job types that belong to the ops queue
const OPS_JOB_TYPES = new Set([
  "hard-delete-user",
  "export-user-data",
  "admin-soft-delete-user",
  "admin-restore-user",
  "admin-force-disconnect",
]);

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
let _aiQueueEvents: QueueEvents | null = null;
let _opsQueueEvents: QueueEvents | null = null;

export function getQueue(): Queue {
  if (!_aiQueue) {
    _aiQueue = new Queue(AI_QUEUE_NAME, {
      connection: { ...getConnectionConfig(), connectTimeout: 3000 },
    });
  }
  return _aiQueue;
}

function getOpsQueue(): Queue {
  if (!_opsQueue) {
    _opsQueue = new Queue(OPS_QUEUE_NAME, {
      connection: { ...getConnectionConfig(), connectTimeout: 3000 },
    });
  }
  return _opsQueue;
}

function getQueueEvents(): QueueEvents {
  if (!_aiQueueEvents) {
    _aiQueueEvents = new QueueEvents(AI_QUEUE_NAME, { connection: getConnectionConfig() });
  }
  return _aiQueueEvents;
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

  const isOpsJob = OPS_JOB_TYPES.has(jobName);
  const queue = isOpsJob ? getOpsQueue() : getQueue();
  const queueEvents = isOpsJob ? getOpsQueueEvents() : getQueueEvents();

  const job = await queue.add(jobName, data, {
    jobId: opts?.jobId,
    removeOnComplete: { count: 200, age: 3600 },
    removeOnFail: { count: 100 },
  });

  await job.waitUntilFinished(queueEvents, JOB_TIMEOUT_MS);
}
