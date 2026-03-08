import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    if (typeof window !== "undefined") return { email: "" };
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const { getSession, parseSessionToken } = await import("~/lib/auth");
    const cookie = getRequestHeader("cookie") || "";
    const token = parseSessionToken(cookie);
    const session = token ? getSession(token) : null;
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { email: session.email };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { email } = Route.useRouteContext();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-wide">BLISKO ADMIN</h1>
        <p className="mt-2 text-gray-500">Zalogowano jako {email}</p>
        <p className="mt-8 text-gray-400">Panel w budowie.</p>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-6 text-sm text-gray-400 underline hover:text-gray-600"
        >
          Wyloguj się
        </button>
      </div>
    </div>
  );
}
