import { betterAuth } from 'better-auth';
import { emailOTP, genericOAuth } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { eq } from 'drizzle-orm';
import { Resend } from 'resend';
import { db } from './db';
import { profiles } from './db/schema';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  trustedOrigins: [
    'blisko://',
    'exp://',
    'http://localhost:8081',
    'http://localhost:19000',
    'http://localhost:19006',
  ],
  databaseHooks: {
    account: {
      create: {
        after: async (account) => {
          const { providerId, accessToken, userId } = account;
          if (!accessToken || (providerId !== 'instagram' && providerId !== 'linkedin')) return;

          let username: string | null = null;

          try {
            if (providerId === 'instagram') {
              const res = await fetch(
                `https://graph.instagram.com/me?fields=username&access_token=${accessToken}`
              );
              if (res.ok) {
                const data = await res.json();
                username = data.username ?? null;
              }
            } else if (providerId === 'linkedin') {
              const res = await fetch('https://api.linkedin.com/v2/userinfo', {
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
            const [profile] = await db
              .select({ socialLinks: profiles.socialLinks })
              .from(profiles)
              .where(eq(profiles.userId, userId));
            if (profile) {
              const links = { ...(profile.socialLinks ?? {}), [providerId]: username };
              await db
                .update(profiles)
                .set({ socialLinks: links, updatedAt: new Date() })
                .where(eq(profiles.userId, userId));
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
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: false,
    },
    // Allow requests without Origin header (React Native doesn't send Origin)
    disableCSRFCheck: true,
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        // Only handle sign-in OTPs
        if (type !== 'sign-in') return;

        // Build deep link with OTP and email
        const deepLink = `blisko://auth/verify?otp=${otp}&email=${encodeURIComponent(email)}`;

        console.log(`OTP for ${email}: ${otp}`);
        console.log(`Deep link: ${deepLink}`);

        if (resend) {
          try {
            const result = await resend.emails.send({
              from: process.env.EMAIL_FROM || 'Blisko <noreply@blisko.app>',
              to: email,
              subject: `${otp} - Twój kod do Blisko`,
              html: `
                <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
                  <h1 style="text-align: center; color: #007AFF;">Blisko</h1>

                  <p style="text-align: center; margin-bottom: 8px;">Kliknij żeby się zalogować:</p>
                  <a href="${deepLink}" style="display: block; background: #007AFF; color: white; padding: 14px 24px; text-align: center; text-decoration: none; border-radius: 12px; margin: 0 auto 24px; font-weight: 600;">
                    Zaloguj się do Blisko
                  </a>

                  <div style="text-align: center; color: #999; margin: 24px 0;">
                    <span style="background: #fff; padding: 0 12px;">lub wpisz kod</span>
                  </div>

                  <div style="background: #f5f5f5; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${otp}</span>
                  </div>

                  <p style="text-align: center; color: #999; font-size: 12px;">Link i kod wygasną za 5 minut.</p>
                </div>
              `,
            });
            console.log('Email sent:', result);
          } catch (err) {
            console.error('Failed to send email:', err);
          }
        } else {
          console.log('Resend not configured - email not sent');
        }
      },
      otpLength: 6,
      expiresIn: 300, // 5 minutes
    }),
    genericOAuth({
      config: [
        {
          providerId: 'instagram',
          clientId: process.env.INSTAGRAM_CLIENT_ID as string,
          clientSecret: process.env.INSTAGRAM_CLIENT_SECRET as string,
          authorizationUrl: 'https://api.instagram.com/oauth/authorize',
          tokenUrl: 'https://api.instagram.com/oauth/access_token',
          scopes: ['user_profile'],
        },
      ],
    }),
  ],
  user: {
    additionalFields: {
      displayName: {
        type: 'string',
        required: false,
      },
    },
  },
});

export type Auth = typeof auth;
