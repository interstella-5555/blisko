import type { RedisClient } from "bun";

const CHANNEL = "bot:events";

let redis: RedisClient | null = null;

export function initEvents(redisUrl: string) {
  try {
    redis = new Bun.RedisClient(redisUrl);
  } catch {
    // Redis is optional — monitor won't receive events but bot still works
  }
}

export function closeEvents() {
  redis?.close();
}

export interface BotEvent {
  type: string;
  bot?: string;
  from?: string;
  [key: string]: unknown;
}

export function emit(event: BotEvent) {
  console.log(`[bot] ${event.type}:`, JSON.stringify(event));
  if (!redis) return;
  const payload = { ...event, ts: Date.now() };
  redis.publish(CHANNEL, JSON.stringify(payload)).catch(() => {});
}
