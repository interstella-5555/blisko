import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
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
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        // Only handle sign-in OTPs
        if (type !== 'sign-in') return;

        // Build deep link with OTP and email
        const deepLink = `meet://auth/verify?otp=${otp}&email=${encodeURIComponent(email)}`;

        console.log(`OTP for ${email}: ${otp}`);
        console.log(`Deep link: ${deepLink}`);

        if (resend) {
          await resend.emails.send({
            from: process.env.EMAIL_FROM || 'Meet <noreply@meet.app>',
            to: email,
            subject: `${otp} - Twój kod do Meet`,
            html: `
              <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
                <h1 style="text-align: center; color: #007AFF;">Meet</h1>

                <p style="text-align: center; margin-bottom: 8px;">Kliknij żeby się zalogować:</p>
                <a href="${deepLink}" style="display: block; background: #007AFF; color: white; padding: 14px 24px; text-align: center; text-decoration: none; border-radius: 12px; margin: 0 auto 24px; font-weight: 600;">
                  Zaloguj się do Meet
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
        }
      },
      otpLength: 6,
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
