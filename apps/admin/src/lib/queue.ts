import { Queue, QueueEvents } from "bullmq";

const QUEUE_NAME = "ai-jobs";
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

let _queue: Queue | null = null;
let _queueEvents: QueueEvents | null = null;

export function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: { ...getConnectionConfig(), connectTimeout: 3000 },
    });
  }
  return _queue;
}

function getQueueEvents(): QueueEvents {
  if (!_queueEvents) {
    _queueEvents = new QueueEvents(QUEUE_NAME, { connection: getConnectionConfig() });
  }
  return _queueEvents;
}

export async function enqueueAndWait<T extends Record<string, unknown>>(
  jobName: string,
  data: T,
  opts?: { jobId?: string },
): Promise<void> {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is not configured");
  }

  const queue = getQueue();
  const queueEvents = getQueueEvents();

  const job = await queue.add(jobName, data, {
    jobId: opts?.jobId,
    removeOnComplete: { count: 200, age: 3600 },
    removeOnFail: { count: 100 },
  });

  await job.waitUntilFinished(queueEvents, JOB_TIMEOUT_MS);
}
