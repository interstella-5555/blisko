import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window !== "undefined") {
      throw redirect({ to: "/login" });
    }
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const { getSession } = await import("~/lib/auth");
    const cookie = getRequestHeader("cookie") || "";
    const match = cookie.match(/admin-session=([^;]+)/);
    const token = match ? match[1] : null;
    const session = token ? getSession(token) : null;
    if (session) {
      throw redirect({ to: "/dashboard" });
    }
    throw redirect({ to: "/login" });
  },
});
