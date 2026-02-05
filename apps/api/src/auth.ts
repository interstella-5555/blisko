import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { Resend } from 'resend';
import { db } from './db';

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
    'meet://',
    'exp://',
    'http://localhost:8081',
    'http://localhost:19000',
    'http://localhost:19006',
  ],
  advanced: {
    crossSubDomainCookies: {
      enabled: false,
    },
    // Allow requests without Origin header (React Native doesn't send Origin)
    disableCSRFCheck: true,
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        console.log(`Magic link for ${email}: ${url}`);

        if (resend) {
          await resend.emails.send({
            from: process.env.EMAIL_FROM || 'Meet <noreply@meet.app>',
            to: email,
            subject: 'Zaloguj się do Meet',
            html: `
              <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
                <h1 style="text-align: center; color: #007AFF;">Meet</h1>
                <p>Kliknij poniższy link, żeby się zalogować:</p>
                <a href="${url}" style="display: block; background: #007AFF; color: white; padding: 12px 24px; text-align: center; text-decoration: none; border-radius: 8px; margin: 20px 0;">
                  Zaloguj się
                </a>
                <p style="color: #666; font-size: 12px;">Link wygaśnie za 5 minut.</p>
              </div>
            `,
          });
        }
      },
      expiresIn: 300, // 5 minutes
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
