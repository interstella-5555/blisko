import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppSidebar } from "~/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import { getAuthSession } from "~/lib/auth-session";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    if (typeof window !== "undefined") return { email: "" };
    const { email, isAuthenticated } = await getAuthSession();
    if (!isAuthenticated) {
      throw redirect({ to: "/login" });
    }
    return { email: email! };
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  const { email } = Route.useRouteContext();
  return (
    <SidebarProvider>
      <AppSidebar email={email} />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
