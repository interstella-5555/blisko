import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppSidebar } from "~/components/app-sidebar";
import { SidebarProvider } from "~/components/ui/sidebar";
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
  const { email } = Route.useRouteContext();
  return (
    <SidebarProvider>
      <AppSidebar email={email} />
      <main className="min-h-screen flex-1 bg-[#f5f4f1]">
        <Outlet />
      </main>
    </SidebarProvider>
  );
}
