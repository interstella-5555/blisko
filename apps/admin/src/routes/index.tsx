import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAuthSession } from "~/lib/auth-session";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window !== "undefined") {
      throw redirect({ to: "/login" });
    }
    const { isAuthenticated } = await getAuthSession();
    if (isAuthenticated) {
      throw redirect({ to: "/dashboard" });
    }
    throw redirect({ to: "/login" });
  },
});
