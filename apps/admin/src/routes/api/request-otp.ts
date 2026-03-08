import { createFileRoute } from "@tanstack/react-router";
import { generateOtp, isAllowedEmail } from "~/lib/auth";
import { adminOtp, sendEmail } from "~/lib/email";

export const Route = createFileRoute("/api/request-otp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { email: rawEmail } = (await request.json()) as { email: string };
        const email = rawEmail?.trim().toLowerCase();

        if (!email || !isAllowedEmail(email)) {
          return Response.json({ ok: false, error: "Nieautoryzowany adres email." });
        }

        const otp = generateOtp(email);
        await sendEmail(email, adminOtp(otp));
        return Response.json({ ok: true });
      },
    },
  },
});
