import { initTRPC, TRPCError } from "@trpc/server";
import { eq, placeholder } from "drizzle-orm";
import { DEFAULT_RATE_LIMIT_MESSAGE, rateLimitMessages, rateLimits } from "@/config/rateLimits";
import { db, preparedName, schema } from "@/db";
import { checkRateLimit } from "@/services/rate-limiter";
import { Sentry } from "@/services/sentry";
import type { TRPCContext } from "./context";

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

const userDeletionState = db
  .select({ deletedAt: schema.user.deletedAt, suspendedAt: schema.user.suspendedAt })
  .from(schema.user)
  .where(eq(schema.user.id, placeholder("userId")))
  .prepare(preparedName("user_deletion_state"));

// Middleware that requires authentication
const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    });
  }

  // Check moderation state (soft-delete takes precedence — a deleted account
  // is in the anonymization grace period, not under active moderation).
  const [userData] = await userDeletionState.execute({ userId: ctx.userId });

  if (userData?.deletedAt) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "ACCOUNT_DELETED",
    });
  }

  if (userData?.suspendedAt) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "ACCOUNT_SUSPENDED",
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});

// Tag the Sentry scope with the authenticated user id. Runs after `isAuthed` so
// `ctx.userId` is guaranteed. Sentry isolates scope per request via AsyncLocalStorage,
// so any `captureException`/`captureMessage` fired during this request — including
// from sub-functions and breadcrumbs — picks up the user automatically. The
// per-call `user` we still pass in `trpcServer.onError` is a backstop in case the
// ALS context doesn't reach the adapter callback.
const tagSentryUser = t.middleware(async ({ ctx, next }) => {
  if (ctx.userId) Sentry.setUser({ id: ctx.userId });
  return next();
});

// Global rate limit — safety net for all authenticated requests
const globalRateLimit = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) return next();

  const config = rateLimits.global;
  const { limited, retryAfter } = await checkRateLimit(`global:${ctx.userId}`, config.limit, config.window);

  if (limited) {
    const message = rateLimitMessages.global ?? DEFAULT_RATE_LIMIT_MESSAGE;
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: JSON.stringify({
        error: "RATE_LIMITED",
        context: "global",
        message,
        retryAfter,
      }),
    });
  }

  return next();
});

export const protectedProcedure = t.procedure.use(isAuthed).use(tagSentryUser).use(globalRateLimit);
