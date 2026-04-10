import { RedisClient } from "bun";

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
