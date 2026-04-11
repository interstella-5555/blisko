import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { enqueueDataExport } from "@/services/queue-ops";
import { softDeleteUser } from "@/services/user-actions";
import { rateLimit } from "@/trpc/middleware/rateLimit";
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

    const profile = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, ctx.userId),
      columns: { socialLinks: true },
    });

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

      const profile = await db.query.profiles.findFirst({
        where: eq(schema.profiles.userId, ctx.userId),
        columns: { socialLinks: true },
      });

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
      const userData = await db.query.user.findFirst({
        where: eq(schema.user.id, ctx.userId),
        columns: { email: true },
      });

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

      // 3. Soft delete + cleanup + schedule hard delete
      await softDeleteUser(ctx.userId);

      return { ok: true };
    }),

  requestDataExport: protectedProcedure.use(rateLimit("dataExport")).mutation(async ({ ctx }) => {
    const userData = await db.query.user.findFirst({
      where: eq(schema.user.id, ctx.userId),
      columns: { email: true },
    });

    if (!userData) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    await enqueueDataExport(ctx.userId, userData.email);
    return { status: "queued" as const };
  }),
});
