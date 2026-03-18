# Website: Bun.serve → TanStack Start — Design

**Linear:** BLI-120
**Date:** 2026-03-18
**Status:** Approved

## Context

`apps/website/` is a pure `Bun.serve()` with inline HTML strings (~16KB `index.ts`). Works but hard to extend — every new page means more string concatenation. Migrating to TanStack Start gives us file-based routing, SSR, React components, and Tailwind CSS.

## Approach

Fresh TanStack Start scaffold (not copied from `apps/design`). Reference `apps/design` only for Dockerfile pattern and Railway compatibility.

**Key dependencies** (match `apps/design` versions):
- `@tanstack/react-start`: ^1.132.0
- `@tanstack/react-router`: ^1.132.0
- `@tanstack/router-plugin`: ^1.132.0
- `vite`: ^7.1.7
- `nitro`: npm:nitro-nightly@latest
- `tailwindcss`: ^4.0.6
- `@tailwindcss/vite`: ^4.0.6
- `react`: ^19.2.4

No unnecessary deps from design (no `@tanstack/ai-*`, `@radix-ui/*`, `marked`, `streamdown`, etc.).

## Architecture

- **Stack:** TanStack Start (Vite + Nitro + React), Tailwind CSS v4
- **Package:** `@repo/website`, path alias `@/*` → `src/*`
- **Dockerfile:** Multi-stage (deps → build → runtime with `.output/`), follow `apps/design/Dockerfile` pattern with adjusted COPY paths for workspace resolution
- **Routing:** File-based in `src/routes/`
- **Port:** 3000 (Nitro default, set via `ENV PORT=3000` in Dockerfile, Railway overrides)

## Migration Sequence

1. `mv apps/website apps/website-old`
2. Scaffold new `apps/website` with TanStack Start
3. Implement all routes, verify locally
4. Update Dockerfile, root `package.json` scripts
5. Delete `apps/website-old`

## Route Map

| URL | Type | File | Description |
|-----|------|------|-------------|
| `/` | React route | `src/routes/index.tsx` | Home page (logo, minimal) |
| `/privacy` | React route | `src/routes/privacy.tsx` | Privacy policy (Polish, full page) |
| `/terms` | React route | `src/routes/terms.tsx` | Terms of service (Polish, full page) |
| `/join/$code` | React route | `src/routes/join.$code.tsx` | Deep link handler with OG meta + redirect to app scheme |
| `/pitch` | React route | `src/routes/pitch.tsx` | Pitch deck (React component with navigation, animations) |
| `/.well-known/*` | Nitro server routes | `server/routes/.well-known/` | See below |

### Well-Known Files — Nitro Server Routes

TanStack Start's file-based routing uses dots for special syntax (escaping). Instead of fighting it, use **Nitro's `server/routes/` convention** which handles raw HTTP endpoints natively:

- `server/routes/.well-known/apple-app-site-association.get.ts` → `GET /.well-known/apple-app-site-association`
- `server/routes/.well-known/assetlinks.json.get.ts` → `GET /.well-known/assetlinks.json`

Both return `Response` with `Content-Type: application/json`. No React involved — pure Nitro event handlers.

### 404 Handling

TanStack Start shows a default "Not Found" page for unmatched routes. The current site returns home for everything. New behavior: show a proper 404 page (better UX than silently showing home for typos).

## Root Layout (`__root.tsx`)

- `<html lang="pl">`, charset, viewport
- Fonts: DM Sans (body), Instrument Serif (headlines) — Google Fonts
- Favicon
- Light theme by default (beige `#FAF7F2` background)
- `<HeadContent />` + `<Scripts />` for SSR hydration

## Pitch Deck — React Conversion

Current: 11 slides in raw HTML with keyboard/touch/mouse navigation, CSS animations, URL sync.

### Theme Scoping

Pitch deck uses a **dark theme** (`#0e0d0b` bg, `#faf7f2` text) — opposite of the rest of the site (light beige). Solution: the pitch route applies a `dark` class on `<html>` or wraps content in a dark-themed container with scoped CSS variables. The root layout's light theme does NOT leak into the pitch deck.

### Conversion Plan

- `src/routes/pitch.tsx` — main component, `currentSlide` state, navigation
- `src/components/pitch/` — `Slide.tsx` (wrapper), individual slide components (`SlideTitle.tsx`, `SlideProblem.tsx`, ..., `SlideClosing.tsx`)
- `usePitchNavigation(totalSlides)` — custom hook for keyboard, touch, dot navigation
- CSS animations (`drift`, `fadeUp`, `pulseRing`, `pulseOuter`) — `@keyframes` in `src/styles/pitch.css`
- `?slide=N` — TanStack Router search params (type-safe)
- Fonts shared with rest of site (DM Sans, Instrument Serif from `__root.tsx`)
- `/pitch.css` route eliminated — Tailwind handles all styling via Vite build

## Privacy & Terms

- Content transferred 1:1 from current `index.ts` (Polish)
- JSX instead of template strings
- Tailwind typography styling, warm beige background (`#FAF7F2`)
- Per-page `head()` with title (`Polityka prywatności — Blisko`, `Regulamin — Blisko`)

## Join Deep Link (`/join/$code`)

- **Validation:** `beforeLoad` validates `code` matches `[A-Za-z0-9]+`, throws 404 otherwise
- SSR with `head()` — OG meta tags:
  - `og:title`: "Zaproszenie do grupy w Blisko"
  - `og:description`: "Kliknij, żeby dołączyć do grupy w aplikacji Blisko."
  - `<title>`: "Dołącz do grupy — Blisko"
- Client: `useEffect` → `window.location.href = 'blisko:///group/join/${code}'`
- Fallback: App Store / Google Play buttons
- Constants (`APP_SCHEME`, `IOS_BUNDLE_ID`, etc.) in `src/config.ts`

## Home Page

- Minimal: "BLISKO" logo centered, warm beige background
- Easy to extend later (it's a React route)

## Verification

After migration, all these must work identically:
- `curl -s localhost:3000/.well-known/apple-app-site-association | jq .` → valid JSON
- `curl -s localhost:3000/.well-known/assetlinks.json | jq .` → valid JSON
- `curl -s localhost:3000/join/abc123` → HTML with deep link + OG tags
- `localhost:3000/privacy` → privacy policy
- `localhost:3000/terms` → terms of service
- `localhost:3000/pitch` → pitch deck with slide navigation
- `localhost:3000/` → home page
- `localhost:3000/nonexistent` → 404 page

## Post-Migration

- Delete `apps/website-old`
- Update CLAUDE.md if dev workflow changed
- Update root `package.json` scripts (`website:dev`, `website:build`, `website:start`)
