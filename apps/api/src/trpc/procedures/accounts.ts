import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import { account, profiles } from '../../db/schema';

export const accountsRouter = router({
  listConnected: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await db
      .select({
        providerId: account.providerId,
      })
      .from(account)
      .where(eq(account.userId, ctx.userId));

    const oauthAccounts = accounts.filter(
      (a) => a.providerId === 'instagram' || a.providerId === 'linkedin'
    );

    const [profile] = await db
      .select({ socialLinks: profiles.socialLinks })
      .from(profiles)
      .where(eq(profiles.userId, ctx.userId));

    const socialLinks = (profile?.socialLinks ?? {}) as Record<string, string>;

    return oauthAccounts.map((a) => ({
      providerId: a.providerId,
      username: socialLinks[a.providerId] ?? null,
    }));
  }),

  disconnect: protectedProcedure
    .input(
      z.object({
        providerId: z.enum(['instagram', 'linkedin']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(account)
        .where(
          and(
            eq(account.userId, ctx.userId),
            eq(account.providerId, input.providerId)
          )
        );

      const [profile] = await db
        .select({ socialLinks: profiles.socialLinks })
        .from(profiles)
        .where(eq(profiles.userId, ctx.userId));

      if (profile?.socialLinks) {
        const links = { ...profile.socialLinks } as Record<
          string,
          string | undefined
        >;
        delete links[input.providerId];
        const hasAny = Object.values(links).some(Boolean);
        await db
          .update(profiles)
          .set({
            socialLinks: hasAny ? links : null,
            updatedAt: new Date(),
          })
          .where(eq(profiles.userId, ctx.userId));
      }

      return { ok: true };
    }),
});
