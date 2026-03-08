import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { useState } from "react";
import { createSession, generateOtp, getSession, isAllowedEmail, verifyOtp } from "~/lib/auth";
import { adminOtp, sendEmail } from "~/lib/email";

const requestOtp = createServerFn({ method: "POST" })
  .validator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    if (!isAllowedEmail(email)) {
      return { ok: false as const, error: "Nieautoryzowany adres email." };
    }
    const otp = generateOtp(email);
    await sendEmail(email, adminOtp(otp));
    return { ok: true as const };
  });

const verifyOtpFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; otp: string }) => data)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const valid = verifyOtp(email, data.otp.trim());
    if (!valid) {
      return { ok: false as const, error: "Nieprawidłowy lub wygasły kod." };
    }
    const token = createSession(email);
    setResponseHeader(
      "Set-Cookie",
      `admin-session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    return { ok: true as const };
  });

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    const cookie = getRequestHeader("cookie") || "";
    const match = cookie.match(/admin-session=([^;]+)/);
    const token = match ? match[1] : null;
    if (token && getSession(token)) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await requestOtp({ data: { email } });
      if (result.ok) {
        setStep("otp");
      } else {
        setError(result.error);
      }
    } catch {
      setError("Wystąpił błąd. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await verifyOtpFn({ data: { email, otp } });
      if (result.ok) {
        router.navigate({ to: "/dashboard" });
      } else {
        setError(result.error);
      }
    } catch {
      setError("Wystąpił błąd. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-xl font-semibold tracking-wide">BLISKO ADMIN</h1>

        {step === "email" ? (
          <form onSubmit={handleEmailSubmit}>
            <label className="mb-1 block text-sm text-gray-600">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              placeholder="admin@example.com"
            />
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Wysyłanie..." : "Wyślij kod"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit}>
            <p className="mb-4 text-sm text-gray-600">
              Kod wysłany na <strong>{email}</strong>
            </p>
            <label className="mb-1 block text-sm text-gray-600">Kod OTP</label>
            <input
              type="text"
              required
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-center text-lg tracking-widest focus:border-gray-500 focus:outline-none"
              placeholder="000000"
            />
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Weryfikacja..." : "Zaloguj się"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setOtp("");
                setError("");
              }}
              className="mt-2 w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Zmień email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
