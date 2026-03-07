import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { enqueueHardDeleteUser } from "@/services/queue";
import { protectedProcedure, router } from "@/trpc/trpc";

export const accountsRouter = router({
  listConnected: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await db
      .select({
        providerId: schema.account.providerId,
      })
      .from(schema.account)
      .where(eq(schema.account.userId, ctx.userId));

    const oauthAccounts = accounts.filter(
      (a) =>
        a.providerId === "facebook" ||
        a.providerId === "linkedin" ||
        a.providerId === "google" ||
        a.providerId === "apple",
    );

    const [profile] = await db
      .select({ socialLinks: schema.profiles.socialLinks })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, ctx.userId));

    const socialLinks = (profile?.socialLinks ?? {}) as Record<string, string>;

    return oauthAccounts.map((a) => ({
      providerId: a.providerId,
      username: socialLinks[a.providerId] ?? null,
    }));
  }),

  disconnect: protectedProcedure
    .input(
      z.object({
        providerId: z.enum(["facebook", "linkedin", "google", "apple"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(schema.account)
        .where(and(eq(schema.account.userId, ctx.userId), eq(schema.account.providerId, input.providerId)));

      const [profile] = await db
        .select({ socialLinks: schema.profiles.socialLinks })
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, ctx.userId));

      if (profile?.socialLinks) {
        const links = { ...profile.socialLinks } as Record<string, string | undefined>;
        delete links[input.providerId];
        const hasAny = Object.values(links).some(Boolean);
        await db
          .update(schema.profiles)
          .set({
            socialLinks: hasAny ? links : null,
            updatedAt: new Date(),
          })
          .where(eq(schema.profiles.userId, ctx.userId));
      }

      return { ok: true };
    }),

  requestDeletion: protectedProcedure
    .input(z.object({ otp: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      // 1. Get user email for OTP verification
      const [userData] = await db
        .select({ email: schema.user.email })
        .from(schema.user)
        .where(eq(schema.user.id, ctx.userId));

      if (!userData) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // 2. Verify OTP
      const verified = await auth.api.verifyEmailOTP({
        body: { email: userData.email, otp: input.otp },
      });

      if (!verified) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid OTP" });
      }

      // 3. Soft delete — set deletedAt
      await db.update(schema.user).set({ deletedAt: new Date() }).where(eq(schema.user.id, ctx.userId));

      // 4. Delete all sessions (logs out everywhere)
      await db.delete(schema.session).where(eq(schema.session.userId, ctx.userId));

      // 5. Remove push tokens (stop notifications)
      await db.delete(schema.pushTokens).where(eq(schema.pushTokens.userId, ctx.userId));

      // 6. Schedule hard delete in 14 days
      await enqueueHardDeleteUser(ctx.userId);

      return { ok: true };
    }),
});
