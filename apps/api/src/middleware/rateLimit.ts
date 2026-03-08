import type { Context, Next } from "hono";
import { DEFAULT_RATE_LIMIT_MESSAGE, type RateLimitName, rateLimitMessages, rateLimits } from "@/config/rateLimits";
import { checkRateLimit } from "@/services/rate-limiter";

/**
 * Extract client IP from proxy headers or fall back to "unknown".
 */
function getClientIp(c: Context): string {
  const forwarded = c.req.header("X-Forwarded-For");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return c.req.header("X-Real-IP") ?? "unknown";
}

/**
 * Hono middleware for pre-auth rate limiting (keyed by IP).
 *
 * @param name - Key from rateLimits config
 */
export function honoRateLimit(name: RateLimitName) {
  const config = rateLimits[name];

  return async (c: Context, next: Next) => {
    const ip = getClientIp(c);
    const key = `${name}:${ip}`;

    const { limited, retryAfter } = await checkRateLimit(key, config.limit, config.window);

    if (limited) {
      const message = rateLimitMessages[name] ?? DEFAULT_RATE_LIMIT_MESSAGE;
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "RATE_LIMITED", context: name, message, retryAfter }, 429);
    }

    await next();
  };
}
