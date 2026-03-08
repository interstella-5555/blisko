# Email Templates Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract 3 inline email templates into a dedicated module with shared layout, consistent branding, and a single Resend client.

**Architecture:** Create `apps/api/src/services/email.ts` with a shared Resend singleton, a layout wrapper for consistent header/footer, and individual template functions. Then replace inline HTML in `auth.ts` and `data-export.ts` with calls to the new module.

**Tech Stack:** Resend SDK, TypeScript template literals

---

### Task 1: Create the email templates module

**Files:**
- Create: `apps/api/src/services/email.ts`

**Step 1: Create the email module**

Create `apps/api/src/services/email.ts` with the full content below. The module has:
- A lazy Resend singleton (only created when first needed, reused after)
- A `sendEmail` helper that handles the console fallback when `RESEND_API_KEY` is not set
- A `layout()` function that wraps content in consistent branding (header + footer)
- Three template functions that return `{ subject, html }`

```ts
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
```

**Step 2: Verify typecheck**

Run: `pnpm --filter @repo/api typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/api/src/services/email.ts
git commit -m "Add email templates module with shared layout and Resend client (BLI-77)"
```

---

### Task 2: Replace inline templates with email module

**Files:**
- Modify: `apps/api/src/auth.ts:6-9,110-181`
- Modify: `apps/api/src/services/data-export.ts:306-327`

**Step 1: Replace auth.ts email sending**

In `apps/api/src/auth.ts`:

1. Remove the Resend import and instance (lines 6 and 9):
   ```ts
   // DELETE: import { Resend } from "resend";
   // DELETE: const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
   ```

2. Add import for the email module (with the other imports at the top):
   ```ts
   import { changeEmailOtp, sendEmail, signInOtp } from "@/services/email";
   ```

3. Replace the entire `sendVerificationOTP` body (lines 111-181) with:
   ```ts
   async sendVerificationOTP({ email, otp, type }) {
     if (type !== "sign-in" && type !== "change-email") return;

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
   ```

**Step 2: Replace data-export.ts email sending**

In `apps/api/src/services/data-export.ts`:

1. Add import at top of file (with other imports):
   ```ts
   import { dataExportReady, sendEmail } from "@/services/email";
   ```

2. Replace lines 306-327 (the Resend dynamic import + email send) with:
   ```ts
   // Send email notification
   await sendEmail(email, dataExportReady(downloadUrl));
   ```

**Step 3: Verify typecheck**

Run: `pnpm --filter @repo/api typecheck`
Expected: No errors

**Step 4: Verify no remaining inline Resend usage**

Run: `grep -r "resend.emails.send" apps/api/src/`
Expected: No results (all email sending goes through `sendEmail` now)

Run: `grep -r "from.*Resend.*import" apps/api/src/ | grep -v email.ts`
Expected: No results (Resend only imported in the email module)

**Step 5: Commit**

```bash
git add apps/api/src/auth.ts apps/api/src/services/data-export.ts
git commit -m "Replace inline email templates with email module (BLI-77)"
```
