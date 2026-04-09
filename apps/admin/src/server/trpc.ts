import { initTRPC, TRPCError } from "@trpc/server";

export interface Context {
  session: { email: string } | null;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;

// All tRPC procedures require a valid admin session.
// Auth routes (request-otp, verify-otp, logout) are plain Nitro API routes, not tRPC.
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});
