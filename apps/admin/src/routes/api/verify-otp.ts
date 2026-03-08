import { createFileRoute } from "@tanstack/react-router";
import { createSession, verifyOtp } from "~/lib/auth";
import { checkRateLimit } from "~/lib/rate-limit";

export const Route = createFileRoute("/api/verify-otp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = request.headers.get("x-forwarded-for") || "unknown";
        const rl = checkRateLimit(`admin:otp-verify:ip:${ip}`, 10, 900);
        if (rl.limited) {
          return Response.json(
            {
              ok: false,
              error: "Zbyt wiele prób. Spróbuj ponownie później.",
            },
            { status: 429 },
          );
        }

        const { email: rawEmail, otp: rawOtp } = (await request.json()) as {
          email: string;
          otp: string;
        };
        const email = rawEmail?.trim().toLowerCase();
        const otp = rawOtp?.trim();

        if (!email || !otp) {
          return Response.json({
            ok: false,
            error: "Brak wymaganych danych.",
          });
        }

        const valid = verifyOtp(email, otp);
        if (!valid) {
          return Response.json({
            ok: false,
            error: "Nieprawidłowy lub wygasły kod.",
          });
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
