import { initTRPC, TRPCError } from "@trpc/server";
import { eq, placeholder } from "drizzle-orm";
import { DEFAULT_RATE_LIMIT_MESSAGE, rateLimitMessages, rateLimits } from "@/config/rateLimits";
import { db, preparedName, schema } from "@/db";
import { checkRateLimit } from "@/services/rate-limiter";
import type { TRPCContext } from "./context";

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

const userDeletedAt = db
  .select({ deletedAt: schema.user.deletedAt })
  .from(schema.user)
  .where(eq(schema.user.id, placeholder("userId")))
  .prepare(preparedName("user_deleted_at"));

// Middleware that requires authentication
const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    });
  }

  // Check if user is soft-deleted
  const [userData] = await userDeletedAt.execute({ userId: ctx.userId });

  if (userData?.deletedAt) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "ACCOUNT_DELETED",
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
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

export const protectedProcedure = t.procedure.use(isAuthed).use(globalRateLimit);
