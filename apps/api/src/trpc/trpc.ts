import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { TRPCContext } from "./context";

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Middleware that requires authentication
const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    });
  }

  // Check if user is soft-deleted
  const [userData] = await db
    .select({ deletedAt: schema.user.deletedAt })
    .from(schema.user)
    .where(eq(schema.user.id, ctx.userId));

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

export const protectedProcedure = t.procedure.use(isAuthed);
