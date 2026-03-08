import { createFileRoute } from "@tanstack/react-router";
import { generateOtp, isAllowedEmail } from "~/lib/auth";
import { adminOtp, sendEmail } from "~/lib/email";

export const Route = createFileRoute("/api/request-otp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        console.log("[request-otp] POST received");
        const { email: rawEmail } = (await request.json()) as { email: string };
        const email = rawEmail?.trim().toLowerCase();
        console.log("[request-otp] email:", email);

        if (!email || !isAllowedEmail(email)) {
          console.log("[request-otp] rejected: not allowed");
          return Response.json({ ok: false, error: "Nieautoryzowany adres email." });
        }

        try {
          const otp = generateOtp(email);
          console.log("[request-otp] OTP generated");
          await sendEmail(email, adminOtp(otp));
          console.log("[request-otp] email sent");
          return Response.json({ ok: true });
        } catch (err) {
          console.error("[request-otp] error:", err);
          return Response.json({ ok: false, error: "Błąd wysyłania emaila." });
        }
      },
    },
  },
});
