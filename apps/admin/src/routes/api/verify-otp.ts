import { createFileRoute } from "@tanstack/react-router";
import { createSession, verifyOtp } from "~/lib/auth";

export const Route = createFileRoute("/api/verify-otp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        console.log("[verify-otp] POST received");
        const { email: rawEmail, otp: rawOtp } = (await request.json()) as {
          email: string;
          otp: string;
        };
        const email = rawEmail?.trim().toLowerCase();
        const otp = rawOtp?.trim();
        console.log("[verify-otp] email:", email, "otp:", otp);

        if (!email || !otp) {
          console.log("[verify-otp] rejected: missing data");
          return Response.json({ ok: false, error: "Brak wymaganych danych." });
        }

        const valid = verifyOtp(email, otp);
        console.log("[verify-otp] valid:", valid);
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
