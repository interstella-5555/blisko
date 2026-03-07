import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import { account, profiles, user, session, pushTokens } from '../../db/schema';
import { auth } from '../../auth';
import { enqueueHardDeleteUser } from '../../services/queue';

export const accountsRouter = router({
  listConnected: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await db
      .select({
        providerId: account.providerId,
      })
      .from(account)
      .where(eq(account.userId, ctx.userId));

    const oauthAccounts = accounts.filter(
      (a) =>
        a.providerId === 'facebook' ||
        a.providerId === 'linkedin' ||
        a.providerId === 'google' ||
        a.providerId === 'apple'
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
        providerId: z.enum(['facebook', 'linkedin', 'google', 'apple']),
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

  requestDeletion: protectedProcedure
    .input(z.object({ otp: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      // 1. Get user email for OTP verification
      const [userData] = await db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, ctx.userId));

      if (!userData) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      // 2. Verify OTP
      const verified = await auth.api.verifyEmailOTP({
        body: { email: userData.email, otp: input.otp },
      });

      if (!verified) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid OTP' });
      }

      // 3. Soft delete — set deletedAt
      await db
        .update(user)
        .set({ deletedAt: new Date() })
        .where(eq(user.id, ctx.userId));

      // 4. Delete all sessions (logs out everywhere)
      await db.delete(session).where(eq(session.userId, ctx.userId));

      // 5. Remove push tokens (stop notifications)
      await db.delete(pushTokens).where(eq(pushTokens.userId, ctx.userId));

      // 6. Schedule hard delete in 14 days
      await enqueueHardDeleteUser(ctx.userId);

      return { ok: true };
    }),
});
