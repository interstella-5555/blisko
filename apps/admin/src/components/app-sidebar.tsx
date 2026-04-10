"use client";

import {
  BellIcon,
  BrainCircuitIcon,
  LayersIcon,
  LayoutDashboardIcon,
  MessageCircleIcon,
  Settings2Icon,
  ShieldIcon,
  UsersIcon,
  WavesIcon,
} from "lucide-react";
import type * as React from "react";
import { NavMain } from "~/components/nav-main";
import { NavUser } from "~/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "~/components/ui/sidebar";

const navMain = [
  {
    title: "Użytkownicy",
    url: "/dashboard/users",
    icon: <UsersIcon />,
    items: [{ title: "Lista", url: "/dashboard/users" }],
  },
  {
    title: "Wiadomości",
    url: "#",
    icon: <MessageCircleIcon />,
    items: [
      { title: "Konwersacje", url: "/dashboard/conversations" },
      { title: "Grupy", url: "/dashboard/groups" },
    ],
  },
  {
    title: "Waves",
    url: "/dashboard/waves",
    icon: <WavesIcon />,
    items: [{ title: "Lista", url: "/dashboard/waves" }],
  },
  {
    title: "AI Matching",
    url: "#",
    icon: <BrainCircuitIcon />,
    items: [
      { title: "Analizy", url: "/dashboard/matching" },
      { title: "Prompty", url: "#" },
    ],
  },
  {
    title: "Kolejki",
    url: "/dashboard/queue",
    icon: <LayersIcon />,
    items: [{ title: "Live feed", url: "/dashboard/queue" }],
  },
  {
    title: "Moderacja",
    url: "#",
    icon: <ShieldIcon />,
    items: [
      { title: "Zgłoszenia", url: "#" },
      { title: "Blokady", url: "#" },
    ],
  },
  {
    title: "Powiadomienia",
    url: "#",
    icon: <BellIcon />,
    items: [
      { title: "Push log", url: "/dashboard/push-log" },
      { title: "Ogłoszenia", url: "#" },
    ],
  },
  {
    title: "Ustawienia",
    url: "#",
    icon: <Settings2Icon />,
    items: [
      { title: "Ogólne", url: "#" },
      { title: "GDPR", url: "#" },
      { title: "Admini", url: "#" },
    ],
  },
];

export function AppSidebar({ email, ...props }: React.ComponentProps<typeof Sidebar> & { email?: string }) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<a href="/dashboard" aria-label="Dashboard" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <LayoutDashboardIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Blisko</span>
                <span className="truncate text-xs">Admin Panel</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{
            name: email?.split("@")[0] || "Admin",
            email: email ?? "admin@blisko.app",
            avatar: "",
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
