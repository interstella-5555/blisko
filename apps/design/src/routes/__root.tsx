/// <reference types="vite/client" />

import { createRootRoute, HeadContent, Link, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { IconDefs } from "~/components/Icons";
import appCss from "~/styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Blisko — Design System" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pl">
      <head>
        <HeadContent />
      </head>
      <body>
        <IconDefs />
        <nav className="nav">
          <NavLink to="/design-book">Design Book</NavLink>
          <NavLink to="/proposals">Proposals</NavLink>
        </nav>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} activeProps={{ className: "nav-link nav-link-active" }} inactiveProps={{ className: "nav-link" }}>
      {children}
    </Link>
  );
}
