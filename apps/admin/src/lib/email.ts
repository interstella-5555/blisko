import { Resend } from "resend";

let resendInstance: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendInstance) {
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

const FROM = "Blisko <noreply@blisko.app>";

export async function sendEmail(to: string, template: { subject: string; html: string }) {
  const resend = getResend();
  if (!resend) {
    console.log(`[admin-email] Resend not configured — would send to ${to}: "${template.subject}"`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to,
    subject: template.subject,
    html: template.html,
  });
}

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

export function adminOtp(otp: string) {
  return {
    subject: "Kod do logowania — Blisko Admin",
    html: layout(`
      <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">Kod do logowania w panelu administracyjnym:</p>
      ${otpBlock(otp)}
      <p style="font-size: 13px; color: #8B8680; line-height: 1.6;">Kod wygaśnie za 5 minut.</p>
    `),
  };
}
