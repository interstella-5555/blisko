import { RedisClient } from "bun";

/**
 * Redis-buffered batch writer.
 *
 * `append()` pushes events to a Redis list (fire-and-forget, ~0.1ms).
 * `flush()` atomically drains the list and calls the provided callback with all buffered events.
 *
 * Designed to be flushed periodically (e.g. BullMQ repeatable job every 15s).
 * If flush fails, events in the processing key are lost (best-effort logging).
 *
 * Usage:
 *   const buffer = createBatchBuffer<MyEvent>({
 *     key: "blisko:my-log",
 *     onFlush: async (events) => { await db.insert(table).values(events); },
 *   });
 *
 *   buffer.append({ ... });          // from hot path — near-zero overhead
 *   await buffer.flush();            // from periodic job — batch write
 */

interface BatchBufferOptions<T> {
  /** Redis list key for buffering events */
  key: string;
  /** Callback to persist a batch of events (e.g. DB insert) */
  onFlush: (events: T[]) => Promise<void>;
}

export function createBatchBuffer<T>(options: BatchBufferOptions<T>) {
  const { key, onFlush } = options;
  const processingKey = `${key}:processing`;

  let _redis: RedisClient | null = null;

  function getRedis(): RedisClient | null {
    if (!process.env.REDIS_URL) return null;
    if (!_redis) {
      _redis = new RedisClient(process.env.REDIS_URL);
    }
    return _redis;
  }

  return {
    /** Push event to Redis buffer. Fire-and-forget — never throws, never blocks. */
    append(event: T): void {
      try {
        const redis = getRedis();
        if (!redis) return;
        void redis.send("RPUSH", [key, JSON.stringify(event)]);
      } catch {
        // Best-effort — don't break the caller
      }
    },

    /** Drain buffer and flush all events via onFlush callback. Returns count of flushed events. */
    async flush(): Promise<number> {
      const redis = getRedis();
      if (!redis) return 0;

      // Atomic swap: new appends go to the original key while we process the snapshot
      try {
        await redis.send("RENAME", [key, processingKey]);
      } catch {
        // Key doesn't exist = nothing buffered
        return 0;
      }

      let raw: string[];
      try {
        raw = (await redis.send("LRANGE", [processingKey, "0", "-1"])) as string[];
      } catch {
        await redis.send("DEL", [processingKey]).catch(() => {});
        return 0;
      }

      if (!raw || raw.length === 0) {
        await redis.send("DEL", [processingKey]).catch(() => {});
        return 0;
      }

      const events = raw.map((item) => JSON.parse(item) as T);

      try {
        await onFlush(events);
      } catch (err) {
        console.error(`[batch-buffer:${key}] flush failed for ${events.length} events:`, err);
      }

      await redis.send("DEL", [processingKey]).catch(() => {});
      return events.length;
    },
  };
}
