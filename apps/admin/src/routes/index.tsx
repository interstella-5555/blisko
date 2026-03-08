import { createFileRoute, redirect } from "@tanstack/react-router";
import { getRequestHeader } from "@tanstack/react-start/server";
import { getSession } from "~/lib/auth";

function getSessionToken(): string | null {
  const cookie = getRequestHeader("cookie") || "";
  const match = cookie.match(/admin-session=([^;]+)/);
  return match ? match[1] : null;
}

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const token = getSessionToken();
    const session = token ? getSession(token) : null;
    if (session) {
      throw redirect({ to: "/dashboard" });
    }
    throw redirect({ to: "/login" });
  },
});
