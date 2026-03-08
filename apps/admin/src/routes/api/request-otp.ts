import { createFileRoute } from "@tanstack/react-router";
import { generateOtp, isAllowedEmail } from "~/lib/auth";
import { adminOtp, sendEmail } from "~/lib/email";
import { checkRateLimit } from "~/lib/rate-limit";

export const Route = createFileRoute("/api/request-otp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { email: rawEmail } = (await request.json()) as {
          email: string;
        };
        const email = rawEmail?.trim().toLowerCase();

        if (!email || !isAllowedEmail(email)) {
          return Response.json({
            ok: false,
            error: "Nieautoryzowany adres email.",
          });
        }

        const ip = request.headers.get("x-forwarded-for") || "unknown";

        // 5 requests per hour per IP
        const ipRL = checkRateLimit(`admin:otp-request:ip:${ip}`, 5, 3600);
        if (ipRL.limited) {
          return Response.json(
            {
              ok: false,
              error: "Zbyt wiele prób. Spróbuj ponownie później.",
            },
            { status: 429 },
          );
        }

        // 1 request per 60s per email (cooldown)
        const cooldownRL = checkRateLimit(`admin:otp-cooldown:email:${email}`, 1, 60);
        if (cooldownRL.limited) {
          return Response.json(
            {
              ok: false,
              error: "Kod już wysłany. Odczekaj minutę.",
            },
            { status: 429 },
          );
        }

        // 5 requests per hour per email
        const emailRL = checkRateLimit(`admin:otp-request:email:${email}`, 5, 3600);
        if (emailRL.limited) {
          return Response.json(
            {
              ok: false,
              error: "Zbyt wiele prób. Spróbuj ponownie później.",
            },
            { status: 429 },
          );
        }

        try {
          const otp = generateOtp(email);
          await sendEmail(email, adminOtp(otp));
          return Response.json({ ok: true });
        } catch (err) {
          console.error("[request-otp] email send error:", err);
          return Response.json({
            ok: false,
            error: "Błąd wysyłania emaila.",
          });
        }
      },
    },
  },
});
