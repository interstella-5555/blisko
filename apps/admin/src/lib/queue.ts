import { Queue, QueueEvents } from "bullmq";

const AI_QUEUE_NAME = "ai";
const OPS_QUEUE_NAME = "ops";
const MAINTENANCE_QUEUE_NAME = "maintenance";
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
let _aiQueueEvents: QueueEvents | null = null;
let _opsQueue: Queue | null = null;
let _opsQueueEvents: QueueEvents | null = null;
let _maintenanceQueue: Queue | null = null;
let _maintenanceQueueEvents: QueueEvents | null = null;

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

export function getMaintenanceQueue(): Queue {
  if (!_maintenanceQueue) {
    _maintenanceQueue = new Queue(MAINTENANCE_QUEUE_NAME, {
      connection: { ...getConnectionConfig(), connectTimeout: 3000 },
    });
  }
  return _maintenanceQueue;
}

function getAiQueueEvents(): QueueEvents {
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

/** Enqueue an AI job and wait for it to finish. For admin-triggered AI operations (reanalyze, regenerate). */
export async function enqueueAiAndWait<T extends Record<string, unknown>>(jobName: string, data: T): Promise<void> {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is not configured");
  }

  const job = await getAiQueue().add(jobName, data, {
    removeOnComplete: { count: 200, age: 3600 },
    removeOnFail: { count: 100 },
  });

  await job.waitUntilFinished(getAiQueueEvents(), JOB_TIMEOUT_MS);
}

/** Enqueue an ops job and wait for it to finish. For admin actions (delete, restore, disconnect). */
export async function enqueueOpsAndWait<T extends Record<string, unknown>>(
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

function getMaintenanceQueueEvents(): QueueEvents {
  if (!_maintenanceQueueEvents) {
    _maintenanceQueueEvents = new QueueEvents(MAINTENANCE_QUEUE_NAME, { connection: getConnectionConfig() });
  }
  return _maintenanceQueueEvents;
}

/** Enqueue a maintenance job and wait for it to finish. Returns the job's return value. */
export async function enqueueMaintenanceAndWait<T extends Record<string, unknown>>(
  jobName: string,
  data: T,
): Promise<unknown> {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is not configured");
  }

  const job = await getMaintenanceQueue().add(jobName, data, {
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 10 },
  });

  return await job.waitUntilFinished(getMaintenanceQueueEvents(), 30_000);
}
