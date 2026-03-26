import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "./db";
import { adminOtp, sendEmail } from "./email";

const ALLOWED_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAllowedEmail(email: string): boolean {
  return ALLOWED_EMAILS.includes(email.toLowerCase().trim());
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3001",
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in") return;
        // Defense in depth: don't send OTP to non-admin emails
        if (!ALLOWED_EMAILS.includes(email.toLowerCase())) {
          console.log(`[admin] OTP blocked for non-admin email: ${email}`);
          return;
        }
        console.log(`[admin] OTP for ${email}: ${otp}`);
        await sendEmail(email, adminOtp(otp));
      },
      otpLength: 6,
      expiresIn: 300,
    }),
    tanstackStartCookies(), // MUST be last plugin (Pitfall 8)
  ],
});
