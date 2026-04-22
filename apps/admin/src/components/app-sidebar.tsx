"use client";

import { SiAppstore, SiGithub, SiGoogleplay, SiRailway } from "@icons-pack/react-simple-icons";
import {
  BellIcon,
  BrainCircuitIcon,
  BugIcon,
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
  SidebarGroup,
  SidebarGroupLabel,
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
    url: "/dashboard/matching",
    icon: <BrainCircuitIcon />,
    items: [
      { title: "Analizy", url: "/dashboard/matching" },
      { title: "Koszty AI", url: "/dashboard/ai-costs" },
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
    url: "/dashboard/moderation",
    icon: <ShieldIcon />,
    items: [{ title: "Kolejka", url: "/dashboard/moderation" }],
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

const navExternal = [
  { title: "Bugsink", url: "https://bugsink.up.railway.app", icon: <BugIcon /> },
  {
    title: "Railway",
    url: "https://railway.app/project/62599e90-30e8-47dd-af34-4e3f73c2261a",
    icon: <SiRailway />,
  },
  { title: "GitHub", url: "https://github.com/interstella-5555/blisko", icon: <SiGithub /> },
  {
    title: "Play Console",
    url: "https://play.google.com/console/u/0/developers/8613065202592056840/app/4972916663653790192/app-dashboard",
    icon: <SiGoogleplay />,
  },
  {
    title: "App Store Connect",
    url: "https://appstoreconnect.apple.com/apps/6759989892/distribution/ios/version/inflight",
    icon: <SiAppstore />,
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
        <SidebarGroup>
          <SidebarGroupLabel>External</SidebarGroupLabel>
          <SidebarMenu>
            {navExternal.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  render={<a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={item.title} />}
                >
                  {item.icon}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
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
