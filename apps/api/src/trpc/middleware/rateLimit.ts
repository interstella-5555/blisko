import { TRPCError } from "@trpc/server";
import { DEFAULT_RATE_LIMIT_MESSAGE, type RateLimitName, rateLimitMessages, rateLimits } from "@/config/rateLimits";
import { checkRateLimit } from "@/services/rate-limiter";
import { middleware } from "@/trpc/trpc";

/**
 * Per-procedure rate limit middleware.
 *
 * @param name - Key from rateLimits config
 * @param keySuffix - Optional function to derive a per-resource suffix (e.g. conversationId)
 */
export function rateLimit(name: RateLimitName, keySuffix?: (opts: { input: any }) => string) {
  const config = rateLimits[name];

  return middleware(async ({ ctx, input, next }) => {
    if (!ctx.userId) return next();

    const suffix = keySuffix ? `:${keySuffix({ input })}` : "";
    const key = `${name}:${ctx.userId}${suffix}`;

    const { limited, retryAfter } = await checkRateLimit(key, config.limit, config.window);

    if (limited) {
      const message = rateLimitMessages[name] ?? DEFAULT_RATE_LIMIT_MESSAGE;
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: JSON.stringify({
          error: "RATE_LIMITED",
          context: name,
          message,
          retryAfter,
        }),
      });
    }

    return next();
  });
}
