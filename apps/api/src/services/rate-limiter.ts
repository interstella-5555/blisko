import { RedisClient } from "bun";

const redis = new RedisClient(process.env.REDIS_URL!);

/**
 * Sliding window counter — atomic Redis Lua script.
 *
 * Uses two fixed-window counters with weighted overlap to approximate a true sliding window.
 * - Lower memory than sliding window log (2 keys per limit vs 1 sorted set per request)
 * - No boundary burst exploit (unlike pure fixed window)
 *
 * On each check:
 * 1. Calculate which fixed window we're in (current) and the previous one
 * 2. Weight previous window's count by how far we are into the current window
 * 3. If estimated count >= limit, reject with retryAfter seconds
 * 4. Otherwise, increment current window counter
 */
const SLIDING_WINDOW_SCRIPT = `
local key_prefix = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local current_window = math.floor(now / window)
local prev_window = current_window - 1
local elapsed = now - (current_window * window)
local weight = elapsed / window

local prev_key = key_prefix .. ":" .. prev_window
local curr_key = key_prefix .. ":" .. current_window

local prev_count = tonumber(redis.call("GET", prev_key) or "0")
local curr_count = tonumber(redis.call("GET", curr_key) or "0")

local estimated = prev_count * (1 - weight) + curr_count

if estimated >= limit then
  local retry_after = math.ceil(window - elapsed)
  return {1, retry_after}
end

redis.call("INCR", curr_key)
redis.call("EXPIRE", curr_key, window * 2)

return {0, 0}
`;

export interface RateLimitResult {
  limited: boolean;
  retryAfter: number;
}

/**
 * Check rate limit for a given key and rule.
 *
 * @param key - Unique identifier (e.g. "waves.send:userId123" or "auth.otpRequest:192.168.1.1")
 * @param limit - Max requests allowed in the window
 * @param windowSeconds - Time window in seconds
 * @returns Whether the request is rate limited and how long to wait
 *
 * Fails open on Redis errors — never blocks users because of infra issues.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const result = await redis.send("EVAL", [
      SLIDING_WINDOW_SCRIPT,
      "1",
      `rl:${key}`,
      String(limit),
      String(windowSeconds),
      String(now),
    ]);
    const [limited, retryAfter] = result as [number, number];
    return { limited: limited === 1, retryAfter };
  } catch (err) {
    console.error("[rate-limiter] Redis error, failing open:", err);
    return { limited: false, retryAfter: 0 };
  }
}
