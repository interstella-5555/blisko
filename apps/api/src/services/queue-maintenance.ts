import { type Job, Queue, Worker } from "bullmq";
import { prunePushLog, pushLogBuffer } from "./push-log";
import { recordJobCompleted, recordJobFailed } from "./queue-metrics";
import { getConnectionConfig, QUEUE_NAMES } from "./queue-shared";

// --- Job types ---

interface FlushPushLogJob {
  type: "flush-push-log";
}

interface PrunePushLogJob {
  type: "prune-push-log";
}

type MaintenanceJob = FlushPushLogJob | PrunePushLogJob;

// --- Queue (lazy init) ---

let _queue: Queue | null = null;

function getMaintenanceQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAMES.maintenance, {
      connection: getConnectionConfig(),
      defaultJobOptions: {
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 10 },
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    });
  }
  return _queue!;
}

// --- Job processor ---

async function processMaintenanceJob(job: Job<MaintenanceJob>) {
  const data = job.data;

  switch (data.type) {
    case "flush-push-log": {
      const count = await pushLogBuffer.flush();
      if (count > 0) console.log(`[queue:maintenance] flushed ${count} push log events`);
      break;
    }
    case "prune-push-log": {
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      await prunePushLog(SEVEN_DAYS_MS);
      console.log("[queue:maintenance] pruned old push log entries");
      break;
    }
  }
}

// --- Worker ---

let _worker: Worker | null = null;

export function startMaintenanceWorker() {
  if (!process.env.REDIS_URL) {
    console.warn("REDIS_URL not set, skipping maintenance queue worker");
    return;
  }

  _worker = new Worker(QUEUE_NAMES.maintenance, processMaintenanceJob, {
    connection: getConnectionConfig(),
    concurrency: 2,
  });

  _worker.on("completed", (job) => {
    const durationMs = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
    recordJobCompleted(QUEUE_NAMES.maintenance, durationMs);
    console.log(`[queue:maintenance] Job ${job.id} completed (${job.data.type}) ${durationMs}ms`);
  });

  _worker.on("failed", (job, err) => {
    recordJobFailed(QUEUE_NAMES.maintenance);
    console.error(`[queue:maintenance] Job ${job?.id} failed:`, err.message);
  });

  const queue = getMaintenanceQueue();
  void queue.upsertJobScheduler(
    "flush-push-log",
    { every: 15_000 },
    { name: "flush-push-log", data: { type: "flush-push-log" } },
  );
  void queue.upsertJobScheduler(
    "prune-push-log",
    { every: 3_600_000 },
    { name: "prune-push-log", data: { type: "prune-push-log" } },
  );

  console.log("[queue:maintenance] Maintenance worker started");
}
