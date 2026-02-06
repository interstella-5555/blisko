/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import { IconDefs } from '~/components/Icons'
import appCss from '~/styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Meet — Design System' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

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
        <Outlet />
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      activeProps={{ className: 'nav-link nav-link-active' }}
      inactiveProps={{ className: 'nav-link' }}
    >
      {children}
    </Link>
  )
}
