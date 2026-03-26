import { Queue } from "bullmq";

let _queue: Queue | null = null;

function getConnectionConfig() {
  const url = new URL(process.env.REDIS_URL!);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}

export function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue("ai-jobs", {
      connection: getConnectionConfig(),
    });
  }
  return _queue;
}
