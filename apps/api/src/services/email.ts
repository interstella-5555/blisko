/**
 * Email module — all outbound emails go through this file.
 *
 * Core:
 * - `sendEmail(to, template)` — sends via Resend, falls back to console.log when RESEND_API_KEY is not set.
 * - `layout(content, locale)` — shared HTML wrapper with BLISKO header + localized footer.
 *
 * Reusable blocks:
 * - `otpBlock(otp)` — styled centered OTP code display (large monospace digits).
 * - `button(label, href)` — red CTA button for deep links and download URLs.
 *
 * Templates (all locale-aware — see docs/architecture/i18n.md and auth-sessions.md):
 * - `signInOtp(otp, deepLink, locale?)` — sign-in email with deep link button + OTP fallback.
 *    Sign-in OTP fires BEFORE the profile is created (user row exists, profiles row may not),
 *    so the locale parameter is optional and falls back to `pl` — see auth.ts callsite.
 * - `changeEmailOtp(otp, locale?)` — verification code for email address change.
 * - `dataExportReady(downloadUrl, locale?)` — GDPR data export download link.
 * - `dataExportDelayed(locale?)` — notifies user their export is taking longer than expected.
 *
 * Adding a new template:
 * 1. Add the strings to `TRANSLATIONS` in `services/i18n.ts` (both `pl` and `uk`).
 * 2. Export a function `(args, locale?: LocaleCode) => { subject, html }` returning the rendered HTML.
 * 3. Wrap content with `layout(content, locale)` for consistent branding + footer.
 * 4. Call `sendEmail(to, yourTemplate(args, recipientLocale))` from the sending location.
 */
import type { LocaleCode } from "@repo/shared";
import { Resend } from "resend";
import { t } from "@/services/i18n";

let resendInstance: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendInstance) {
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

const FROM = process.env.EMAIL_FROM || "Blisko <noreply@blisko.app>";

/**
 * Send an email via Resend. Falls back to console.log if RESEND_API_KEY is not set.
 */
export async function sendEmail(to: string, template: { subject: string; html: string }) {
  const resend = getResend();
  if (!resend) {
    console.log(`[email] Resend not configured — would send to ${to}: "${template.subject}"`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to,
    subject: template.subject,
    html: template.html,
  });
}

// ── Layout ──────────────────────────────────────────────

function layout(content: string, locale: LocaleCode | null | undefined) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <p style="font-size: 24px; font-weight: 300; letter-spacing: 4px; margin-bottom: 24px;">BLISKO</p>
      ${content}
      <p style="font-size: 13px; color: #8B8680; margin-top: 32px;">${t("email.layout.footer", locale)}</p>
    </div>
  `;
}

function otpBlock(otp: string) {
  return `
    <div style="background: #f5f5f5; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0;">
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${otp}</span>
    </div>
  `;
}

function button(label: string, href: string) {
  return `
    <p style="margin: 24px 0;">
      <a href="${href}" style="background: #C0392B; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-size: 13px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">${label}</a>
    </p>
  `;
}

// ── Templates ───────────────────────────────────────────

export function signInOtp(otp: string, deepLink: string, locale?: LocaleCode | null) {
  return {
    subject: t("email.signIn.subject", locale, { otp }),
    html: layout(
      `
      <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">${t("email.signIn.intro", locale)}</p>
      ${button(t("email.signIn.button", locale), deepLink)}
      <div style="text-align: center; color: #8B8680; margin: 24px 0;">
        <span style="background: #fff; padding: 0 12px;">${t("email.signIn.orEnterCode", locale)}</span>
      </div>
      ${otpBlock(otp)}
      <p style="font-size: 13px; color: #8B8680; line-height: 1.6;">${t("email.signIn.expiry", locale)}</p>
    `,
      locale,
    ),
  };
}

export function changeEmailOtp(otp: string, locale?: LocaleCode | null) {
  return {
    subject: t("email.changeEmail.subject", locale, { otp }),
    html: layout(
      `
      <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">${t("email.changeEmail.intro", locale)}</p>
      ${otpBlock(otp)}
      <p style="font-size: 13px; color: #8B8680; line-height: 1.6;">${t("email.changeEmail.expiry", locale)}</p>
    `,
      locale,
    ),
  };
}

export function dataExportDelayed(locale?: LocaleCode | null) {
  return {
    subject: t("email.dataExportDelayed.subject", locale),
    html: layout(
      `
      <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">${t("email.greeting", locale)}</p>
      <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">${t("email.dataExportDelayed.body", locale)}</p>
      <p style="font-size: 13px; color: #8B8680; line-height: 1.6;">${t("email.dataExportDelayed.noAction", locale)}</p>
    `,
      locale,
    ),
  };
}

export function dataExportReady(downloadUrl: string, locale?: LocaleCode | null) {
  return {
    subject: t("email.dataExportReady.subject", locale),
    html: layout(
      `
      <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">${t("email.greeting", locale)}</p>
      <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">${t("email.dataExportReady.body", locale)}</p>
      ${button(t("email.dataExportReady.button", locale), downloadUrl)}
      <p style="font-size: 13px; color: #8B8680; line-height: 1.6;">${t("email.dataExportReady.linkExpiry", locale)}</p>
      <p style="font-size: 13px; color: #8B8680; line-height: 1.6;">${t("email.dataExportReady.ignore", locale)}</p>
    `,
      locale,
    ),
  };
}
