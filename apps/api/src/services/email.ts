/**
 * Email module — all outbound emails go through this file.
 *
 * Core:
 * - `sendEmail(to, template)` — sends via Resend, falls back to console.log when RESEND_API_KEY is not set.
 * - `layout(content)` — shared HTML wrapper with BLISKO header + "Pozdrawiamy, Zespół Blisko" footer.
 *
 * Reusable blocks:
 * - `otpBlock(otp)` — styled centered OTP code display (large monospace digits).
 * - `button(label, href)` — red CTA button for deep links and download URLs.
 *
 * Templates:
 * - `signInOtp(otp, deepLink)` — sign-in email with deep link button + OTP fallback.
 * - `changeEmailOtp(otp)` — verification code for email address change.
 * - `dataExportReady(downloadUrl)` — GDPR data export download link.
 * - `dataExportDelayed()` — notifies user their export is taking longer than expected.
 * - `dataExportFailedAdmin(userEmail, jobId, errorMessage)` — admin alert when export permanently fails.
 *
 * Adding a new template:
 * 1. Export a function returning `{ subject: string; html: string }`.
 * 2. Wrap content with `layout()` for consistent branding.
 * 3. Call `sendEmail(to, yourTemplate(...))` from the sending location.
 */
import { Resend } from "resend";

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

function layout(content: string) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <p style="font-size: 24px; font-weight: 300; letter-spacing: 4px; margin-bottom: 24px;">BLISKO</p>
      ${content}
      <p style="font-size: 13px; color: #8B8680; margin-top: 32px;">Pozdrawiamy,<br>Zespół Blisko</p>
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

export function signInOtp(otp: string, deepLink: string) {
  return {
    subject: `${otp} - Twój kod do Blisko`,
    html: layout(`
      <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">Kliknij żeby się zalogować:</p>
      ${button("Zaloguj się do Blisko", deepLink)}
      <div style="text-align: center; color: #8B8680; margin: 24px 0;">
        <span style="background: #fff; padding: 0 12px;">lub wpisz kod</span>
      </div>
      ${otpBlock(otp)}
      <p style="font-size: 13px; color: #8B8680; line-height: 1.6;">Link i kod wygasną za 5 minut.</p>
    `),
  };
}

export function changeEmailOtp(otp: string) {
  return {
    subject: `${otp} - Zmiana adresu email w Blisko`,
    html: layout(`
      <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">Kod weryfikacyjny do zmiany adresu email:</p>
      ${otpBlock(otp)}
      <p style="font-size: 13px; color: #8B8680; line-height: 1.6;">Kod wygaśnie za 5 minut.</p>
    `),
  };
}

export function dataExportDelayed() {
  return {
    subject: "Eksport danych z Blisko — opóźnienie",
    html: layout(`
      <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">Cześć!</p>
      <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">Eksport Twoich danych trwa dłużej niż zwykle. Nasz zespół został powiadomiony i dane zostaną wysłane jak najszybciej.</p>
      <p style="font-size: 13px; color: #8B8680; line-height: 1.6;">Nie musisz nic robić — skontaktujemy się gdy eksport będzie gotowy.</p>
    `),
  };
}

export function dataExportFailedAdmin(userEmail: string, jobId: string, errorMessage: string) {
  return {
    subject: `[ALERT] Eksport danych nieudany — ${userEmail}`,
    html: layout(`
      <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">Eksport danych dla <strong>${userEmail}</strong> nie powiódł się po wyczerpaniu wszystkich prób.</p>
      <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">Job ID: <code>${jobId}</code></p>
      <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">Ostatni błąd: <code>${errorMessage}</code></p>
      <p style="font-size: 15px; color: #C0392B; line-height: 1.6;">Wymagana interwencja — GDPR wymaga dostarczenia danych.</p>
    `),
  };
}

export function dataExportReady(downloadUrl: string) {
  return {
    subject: "Twoje dane z Blisko są gotowe do pobrania",
    html: layout(`
      <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">Cześć!</p>
      <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">Twoje dane są gotowe. Kliknij poniższy link, aby pobrać plik JSON z eksportem wszystkich Twoich danych z aplikacji Blisko.</p>
      ${button("Pobierz dane", downloadUrl)}
      <p style="font-size: 13px; color: #8B8680; line-height: 1.6;">Link jest ważny przez 7 dni. Po tym czasie możesz złożyć nowe żądanie w ustawieniach aplikacji.</p>
      <p style="font-size: 13px; color: #8B8680; line-height: 1.6;">Jeśli nie prosiłeś/aś o eksport danych, zignoruj tę wiadomość.</p>
    `),
  };
}
