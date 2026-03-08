import { createFileRoute, redirect } from "@tanstack/react-router";
import { getRequestHeader } from "@tanstack/react-start/server";
import { getSession } from "~/lib/auth";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => {
    const cookie = getRequestHeader("cookie") || "";
    const match = cookie.match(/admin-session=([^;]+)/);
    const token = match ? match[1] : null;
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

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-wide">BLISKO ADMIN</h1>
        <p className="mt-2 text-gray-500">Zalogowano jako {email}</p>
        <p className="mt-8 text-gray-400">Panel w budowie.</p>
      </div>
    </div>
  );
}
