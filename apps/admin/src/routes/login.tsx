import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { authClient } from "~/lib/auth-client";
import { getAuthSession } from "~/lib/auth-session";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    if (typeof window !== "undefined") return;
    const { isAuthenticated } = await getAuthSession();
    if (isAuthenticated) {
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
      const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      });
      if (sendError) {
        setError("Wystapil blad. Sprobuj ponownie.");
      } else {
        setStep("otp");
      }
    } catch {
      setError("Wystapil blad. Sprobuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error: signInError } = await authClient.signIn.emailOtp({
        email,
        otp,
      });
      if (signInError) {
        setError("Nieprawidlowy kod. Sprobuj ponownie.");
      } else {
        router.navigate({ to: "/dashboard" });
      }
    } catch {
      setError("Wystapil blad. Sprobuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f4f1] p-5">
      <div className="w-full max-w-[380px] rounded-xl border border-[#e5e2dc] bg-white p-8 pt-10 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-[22px] font-semibold tracking-[6px] text-[#1a1a1a]">BLISKO</h1>
          <p className="mt-1.5 text-[13px] tracking-wide text-[#8b8680]">Panel administracyjny</p>
        </div>

        {step === "email" ? (
          <form onSubmit={handleEmailSubmit}>
            <div className="mb-4">
              <Label htmlFor="email" className="mb-1.5 text-[13px] font-medium text-[#555]">
                Adres email
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@blisko.app"
                className="rounded-lg border-[#d9d5cf] bg-[#fafaf8] text-sm focus:border-[#999] focus:bg-white"
              />
            </div>
            {error && <p className="mb-3 text-[13px] text-[#c0392b]">{error}</p>}
            <Button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#1a1a1a] text-sm font-medium hover:bg-[#333]"
            >
              {loading ? "Wysylanie..." : "Wyslij kod"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit}>
            <p className="mb-4 text-[13px] leading-relaxed text-[#666]">
              Kod wyslany na <strong className="text-[#1a1a1a]">{email}</strong>
            </p>
            <div className="mb-4">
              <Label htmlFor="otp" className="mb-1.5 text-[13px] font-medium text-[#555]">
                Kod weryfikacyjny
              </Label>
              <Input
                id="otp"
                type="text"
                required
                maxLength={6}
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="000000"
                className="rounded-lg border-[#d9d5cf] bg-[#fafaf8] text-center text-xl tracking-[8px] tabular-nums focus:border-[#999] focus:bg-white"
              />
            </div>
            {error && <p className="mb-3 text-[13px] text-[#c0392b]">{error}</p>}
            <Button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#1a1a1a] text-sm font-medium hover:bg-[#333]"
            >
              {loading ? "Weryfikacja..." : "Zaloguj sie"}
            </Button>
            <button
              type="button"
              className="mt-3 block w-full cursor-pointer border-none bg-transparent p-2 text-[13px] text-[#888] transition-colors hover:text-[#555]"
              onClick={() => {
                setStep("email");
                setOtp("");
                setError("");
              }}
            >
              Zmien adres email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
