import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router, protectedProcedure } from "~/trpc/trpc";
import { db, schema } from "~/db";

export const pushTokensRouter = router({
  register: protectedProcedure
    .input(
      z.object({
        token: z.string(),
        platform: z.enum(["ios", "android"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .insert(schema.pushTokens)
        .values({
          userId: ctx.userId,
          token: input.token,
          platform: input.platform,
        })
        .onConflictDoUpdate({
          target: schema.pushTokens.token,
          set: { userId: ctx.userId },
        });
    }),

  unregister: protectedProcedure
    .input(
      z.object({
        token: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(schema.pushTokens)
        .where(and(eq(schema.pushTokens.userId, ctx.userId), eq(schema.pushTokens.token, input.token)));
    }),
});
