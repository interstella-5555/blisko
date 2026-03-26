import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getAuthSession } from "~/lib/auth-session";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async () => {
    const { email, isAuthenticated } = await getAuthSession();
    if (!isAuthenticated) {
      throw redirect({ to: "/login" });
    }
    return { email: email! };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return <Outlet />;
}
