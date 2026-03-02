import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import { pushTokens } from '../../db/schema';

export const pushTokensRouter = router({
  register: protectedProcedure
    .input(
      z.object({
        token: z.string(),
        platform: z.enum(['ios', 'android']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .insert(pushTokens)
        .values({
          userId: ctx.userId,
          token: input.token,
          platform: input.platform,
        })
        .onConflictDoUpdate({
          target: pushTokens.token,
          set: { userId: ctx.userId },
        });
    }),

  unregister: protectedProcedure
    .input(
      z.object({
        token: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(pushTokens)
        .where(
          and(
            eq(pushTokens.userId, ctx.userId),
            eq(pushTokens.token, input.token)
          )
        );
    }),
});
