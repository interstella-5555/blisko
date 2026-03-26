import { useRouter } from "@tanstack/react-router";
import { Activity, BarChart3, LogOut, Terminal, Users } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import { authClient } from "~/lib/auth-client";

const navItems = [
  { label: "Matches", icon: Activity, href: "/dashboard", active: true },
  { label: "Ops", icon: BarChart3, href: null, active: false },
  { label: "Uzytkownicy", icon: Users, href: null, active: false },
  { label: "API", icon: Terminal, href: null, active: false },
];

interface AppSidebarProps {
  email: string;
}

export function AppSidebar({ email }: AppSidebarProps) {
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.navigate({ to: "/login" });
  }

  return (
    <Sidebar className="border-r-0 bg-slate-900">
      <SidebarHeader className="p-6">
        <span className="text-lg font-semibold tracking-[6px] text-slate-50">BLISKO</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    isActive={item.active}
                    disabled={!item.active}
                    className={
                      item.active
                        ? "text-slate-50 bg-white/10 border-l-2 border-white"
                        : "text-slate-600 cursor-not-allowed"
                    }
                    tooltip={!item.active ? "Dostepne wkrotce" : undefined}
                    onClick={() => {
                      if (item.href) router.navigate({ to: item.href });
                    }}
                  >
                    <item.icon className="size-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="mb-2 truncate text-sm text-slate-400">{email}</div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
        >
          <LogOut className="size-4" />
          Wyloguj sie
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
