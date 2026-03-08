import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    if (typeof window !== "undefined") return;
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const { getSession, parseSessionToken } = await import("~/lib/auth");
    const cookie = getRequestHeader("cookie") || "";
    const token = parseSessionToken(cookie);
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
      const res = await fetch("/api/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await res.json();
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
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const result = await res.json();
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
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1 className="login-logo">BLISKO</h1>
          <p className="login-subtitle">Panel administracyjny</p>
        </div>

        {step === "email" ? (
          <form onSubmit={handleEmailSubmit}>
            <div className="form-group">
              <label htmlFor="email">Adres email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@blisko.app"
              />
            </div>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn" disabled={loading}>
              {loading ? "Wysyłanie..." : "Wyślij kod"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit}>
            <p className="otp-info">
              Kod wysłany na <strong>{email}</strong>
            </p>
            <div className="form-group">
              <label htmlFor="otp">Kod weryfikacyjny</label>
              <input
                id="otp"
                type="text"
                required
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="000000"
                className="otp-input"
              />
            </div>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn" disabled={loading}>
              {loading ? "Weryfikacja..." : "Zaloguj się"}
            </button>
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setStep("email");
                setOtp("");
                setError("");
              }}
            >
              Zmień adres email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
