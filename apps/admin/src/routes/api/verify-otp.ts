import { createFileRoute } from "@tanstack/react-router";
import { createSession, verifyOtp } from "~/lib/auth";

export const Route = createFileRoute("/api/verify-otp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { email: rawEmail, otp: rawOtp } = (await request.json()) as {
          email: string;
          otp: string;
        };
        const email = rawEmail?.trim().toLowerCase();
        const otp = rawOtp?.trim();

        if (!email || !otp) {
          return Response.json({ ok: false, error: "Brak wymaganych danych." });
        }

        const valid = verifyOtp(email, otp);
        if (!valid) {
          return Response.json({ ok: false, error: "Nieprawidłowy lub wygasły kod." });
        }

        const token = createSession(email);
        const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

        return Response.json(
          { ok: true },
          {
            headers: {
              "Set-Cookie": `admin-session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secure}`,
            },
          },
        );
      },
    },
  },
});
