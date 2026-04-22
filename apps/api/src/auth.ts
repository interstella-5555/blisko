import { expo } from "@better-auth/expo";
import { OTP_LENGTH } from "@repo/shared";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { changeEmailOtp, sendEmail, signInOtp } from "@/services/email";

// Pre-auth gate: block session creation for soft-deleted or suspended users.
// Runs for every path that lands in databaseHooks.session.create.before —
// OAuth callbacks (all four providers), email-OTP verify, and dev auto-login
// (dev auto-login bypasses Better Auth but we keep the check symmetric). The
// emailOTP sendVerificationOTP callback handles the earlier "don't even send
// the code" case; this hook is the catch-all for OAuth where there is no OTP.
function assertUserCanSignIn(user: { deletedAt: Date | null; suspendedAt: Date | null } | undefined) {
  if (user?.deletedAt) throw new APIError("FORBIDDEN", { message: "ACCOUNT_DELETED" });
  if (user?.suspendedAt) throw new APIError("FORBIDDEN", { message: "ACCOUNT_SUSPENDED" });
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["apple", "google", "facebook", "linkedin"],
      allowDifferentEmails: true,
      updateUserInfoOnLink: true,
    },
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  trustedOrigins: ["blisko://", "exp://", "http://localhost:8081", "http://localhost:19000", "http://localhost:19006"],
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await db.query.user.findFirst({
            where: eq(schema.user.id, session.userId),
            columns: { deletedAt: true, suspendedAt: true },
          });
          assertUserCanSignIn(user);
        },
      },
    },
    account: {
      create: {
        after: async (account) => {
          const { providerId, accessToken, userId } = account;
          if (!accessToken || (providerId !== "facebook" && providerId !== "linkedin")) return;

          let username: string | null = null;

          try {
            if (providerId === "facebook") {
              const res = await fetch(`https://graph.facebook.com/me?fields=name&access_token=${accessToken}`);
              if (res.ok) {
                const data = await res.json();
                username = data.name ?? null;
              }
            } else if (providerId === "linkedin") {
              const res = await fetch("https://api.linkedin.com/v2/userinfo", {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              if (res.ok) {
                const data = await res.json();
                username = data.name ?? null;
              }
            }
          } catch (err) {
            console.error(`[auth] Failed to fetch ${providerId} username:`, err);
          }

          if (username) {
            const profile = await db.query.profiles.findFirst({
              where: eq(schema.profiles.userId, userId),
              columns: { socialLinks: true },
            });
            if (profile) {
              const links = { ...(profile.socialLinks ?? {}), [providerId]: username };
              await db
                .update(schema.profiles)
                .set({ socialLinks: links, updatedAt: new Date() })
                .where(eq(schema.profiles.userId, userId));
            }
          }
        },
      },
    },
  },
  socialProviders: {
    linkedin: {
      clientId: process.env.LINKEDIN_CLIENT_ID as string,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET as string,
    },
    facebook: {
      clientId: process.env.FACEBOOK_CLIENT_ID as string,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET as string,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
    apple: {
      clientId: process.env.APPLE_CLIENT_ID as string,
      clientSecret: process.env.APPLE_CLIENT_SECRET as string,
    },
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: false,
    },
    // Allow requests without Origin header (React Native doesn't send Origin)
    disableCSRFCheck: true,
    cookies: {
      // Apple uses response_mode=form_post (cross-site POST).
      // SameSite=Lax (default) strips cookies from cross-site POSTs,
      // causing OAuth state mismatch. Use "none" + secure to fix.
      state: {
        attributes: {
          sameSite: "none" as const,
          secure: true,
        },
      },
    },
  },
  plugins: [
    expo(),
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in" && type !== "change-email") return;

        // Short-circuit for suspended / deleted accounts on the sign-in path.
        // Skipping this for change-email: a change-email OTP means the user
        // already has a valid session, which isAuthed has already vetted.
        if (type === "sign-in") {
          const user = await db.query.user.findFirst({
            where: eq(schema.user.email, email),
            columns: { deletedAt: true, suspendedAt: true },
          });
          assertUserCanSignIn(user);
        }

        console.log(`OTP for ${email}: ${otp}`);

        if (type === "sign-in") {
          const deepLink = `blisko://auth/verify?otp=${otp}&email=${encodeURIComponent(email)}`;
          console.log(`Deep link: ${deepLink}`);
          try {
            await sendEmail(email, signInOtp(otp, deepLink));
          } catch (err) {
            console.error("Failed to send email:", err);
          }
        } else if (type === "change-email") {
          try {
            await sendEmail(email, changeEmailOtp(otp));
          } catch (err) {
            console.error("Failed to send change-email OTP:", err);
          }
        }
      },
      changeEmail: {
        enabled: true,
      },
      otpLength: OTP_LENGTH,
      expiresIn: 300, // 5 minutes
    }),
  ],
  user: {
    additionalFields: {
      displayName: {
        type: "string",
        required: false,
      },
    },
  },
});

export type Auth = typeof auth;
