# Admin Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create an admin panel app (`apps/admin`) with email+OTP auth, deployed to Railway.

**Architecture:** TanStack Start app (same stack as design book) with self-contained OTP auth. In-memory session store. Resend for OTP emails. Protected dashboard route with hello world placeholder.

**Tech Stack:** TanStack Start, React 19, Vite, Tailwind CSS v4, Nitro, Resend

---

### Task 1: Scaffold the app package

**Files:**
- Create: `apps/admin/package.json`
- Create: `apps/admin/tsconfig.json`
- Create: `apps/admin/vite.config.ts`
- Create: `apps/admin/src/styles/app.css`
- Create: `apps/admin/src/router.tsx`
- Modify: `package.json` (root — add admin scripts)

**Step 1: Create `apps/admin/package.json`**

```json
{
  "name": "@repo/admin",
  "description": "Blisko admin panel",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev --port 3001",
    "build": "vite build",
    "start": "node .output/server/index.mjs",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.0.6",
    "@tanstack/react-router": "^1.132.0",
    "@tanstack/react-start": "^1.132.0",
    "@tanstack/router-plugin": "^1.132.0",
    "nitro": "npm:nitro-nightly@latest",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "resend": "^6.8.0",
    "tailwindcss": "^4.0.6",
    "vite-tsconfig-paths": "^6.0.2"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^5.0.4",
    "typescript": "^5.7.2",
    "vite": "^7.1.7"
  }
}
```

**Step 2: Create `apps/admin/tsconfig.json`**

```json
{
  "include": ["**/*.ts", "**/*.tsx"],
  "compilerOptions": {
    "target": "ES2022",
    "jsx": "react-jsx",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": false,
    "noEmit": true,
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "baseUrl": ".",
    "paths": {
      "~/*": ["./src/*"]
    }
  }
}
```

**Step 3: Create `apps/admin/vite.config.ts`**

```ts
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

const config = defineConfig({
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    nitro(),
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});

export default config;
```

**Step 4: Create `apps/admin/src/styles/app.css`**

```css
@import "tailwindcss";

*,
*::before,
*::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: #fafafa;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #1a1a1a;
  min-height: 100vh;
}
```

**Step 5: Create `apps/admin/src/router.tsx`**

```tsx
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
```

**Step 6: Add scripts to root `package.json`**

Add to `scripts`:
```json
"admin:dev": "pnpm --filter @repo/admin dev",
"admin:build": "pnpm --filter @repo/admin build",
"admin:start": "pnpm --filter @repo/admin start"
```

**Step 7: Install dependencies**

Run: `pnpm install`

**Step 8: Commit**

```
Scaffold admin panel app (BLI-63)
```

---

### Task 2: Auth library — OTP and session management

**Files:**
- Create: `apps/admin/src/lib/auth.ts`

**Step 1: Create `apps/admin/src/lib/auth.ts`**

```ts
const OTP_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const otpStore = new Map<string, { otp: string; expiresAt: number }>();
const sessionStore = new Map<string, { email: string; expiresAt: number }>();

function getAllowedEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string): boolean {
  return getAllowedEmails().includes(email.toLowerCase().trim());
}

export function generateOtp(email: string): string {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(email.toLowerCase(), {
    otp,
    expiresAt: Date.now() + OTP_TTL_MS,
  });
  return otp;
}

export function verifyOtp(email: string, otp: string): boolean {
  const key = email.toLowerCase();
  const entry = otpStore.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return false;
  }
  if (entry.otp !== otp) return false;
  otpStore.delete(key);
  return true;
}

export function createSession(email: string): string {
  const token = crypto.randomUUID();
  sessionStore.set(token, {
    email: email.toLowerCase(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

export function getSession(token: string): { email: string } | null {
  const entry = sessionStore.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sessionStore.delete(token);
    return null;
  }
  return { email: entry.email };
}

export function deleteSession(token: string): void {
  sessionStore.delete(token);
}
```

**Step 2: Commit**

```
Add auth library with OTP and session management (BLI-63)
```

---

### Task 3: Email helper — OTP template

**Files:**
- Create: `apps/admin/src/lib/email.ts`

**Step 1: Create `apps/admin/src/lib/email.ts`**

Follow the same pattern as `apps/api/src/services/email.ts` — lazy Resend singleton, layout wrapper, otpBlock helper.

```ts
import { Resend } from "resend";

let resendInstance: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendInstance) {
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

const FROM = "Blisko <noreply@blisko.app>";

export async function sendEmail(to: string, template: { subject: string; html: string }) {
  const resend = getResend();
  if (!resend) {
    console.log(`[admin-email] Resend not configured — would send to ${to}: "${template.subject}"`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to,
    subject: template.subject,
    html: template.html,
  });
}

function layout(content: string) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <p style="font-size: 24px; font-weight: 300; letter-spacing: 4px; margin-bottom: 24px;">BLISKO</p>
      ${content}
      <p style="font-size: 13px; color: #8B8680; margin-top: 32px;">Pozdrawiamy,<br>Zespół Blisko</p>
    </div>
  `;
}

function otpBlock(otp: string) {
  return `
    <div style="background: #f5f5f5; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0;">
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${otp}</span>
    </div>
  `;
}

export function adminOtp(otp: string) {
  return {
    subject: `${otp} - Kod do panelu administracyjnego Blisko`,
    html: layout(`
      <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">Kod do logowania w panelu administracyjnym:</p>
      ${otpBlock(otp)}
      <p style="font-size: 13px; color: #8B8680; line-height: 1.6;">Kod wygaśnie za 5 minut.</p>
    `),
  };
}
```

**Step 2: Commit**

```
Add admin email helper with OTP template (BLI-63)
```

---

### Task 4: Routes — root layout + index redirect

**Files:**
- Create: `apps/admin/src/routes/__root.tsx`
- Create: `apps/admin/src/routes/index.tsx`

**Step 1: Create `apps/admin/src/routes/__root.tsx`**

```tsx
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "~/styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Blisko Admin" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  component: () => <Outlet />,
});

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
```

**Step 2: Create `apps/admin/src/routes/index.tsx`**

Redirects to `/login` or `/dashboard` based on session cookie. Uses a server function to check the cookie.

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { getRequestHeader } from "@tanstack/react-start/server";
import { getSession } from "~/lib/auth";

function getSessionToken(): string | null {
  const cookie = getRequestHeader("cookie") || "";
  const match = cookie.match(/admin-session=([^;]+)/);
  return match ? match[1] : null;
}

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const token = getSessionToken();
    const session = token ? getSession(token) : null;
    if (session) {
      throw redirect({ to: "/dashboard" });
    }
    throw redirect({ to: "/login" });
  },
});
```

**Step 3: Commit**

```
Add root layout and index redirect route (BLI-63)
```

---

### Task 5: Login route — email + OTP two-step form

**Files:**
- Create: `apps/admin/src/routes/login.tsx`

**Step 1: Create `apps/admin/src/routes/login.tsx`**

Two-step form: email input → OTP input. Server functions handle validation, OTP sending, and verification. On success, sets session cookie and redirects to `/dashboard`.

```tsx
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  getRequestHeader,
  setResponseHeader,
} from "@tanstack/react-start/server";
import { useState } from "react";
import { generateOtp, verifyOtp, isAllowedEmail, createSession, getSession } from "~/lib/auth";
import { sendEmail, adminOtp } from "~/lib/email";

const requestOtp = createServerFn({ method: "POST" })
  .validator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    if (!isAllowedEmail(email)) {
      return { ok: false as const, error: "Nieautoryzowany adres email." };
    }
    const otp = generateOtp(email);
    await sendEmail(email, adminOtp(otp));
    return { ok: true as const };
  });

const verifyOtpFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; otp: string }) => data)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const valid = verifyOtp(email, data.otp.trim());
    if (!valid) {
      return { ok: false as const, error: "Nieprawidłowy lub wygasły kod." };
    }
    const token = createSession(email);
    setResponseHeader(
      "Set-Cookie",
      `admin-session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    return { ok: true as const };
  });

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    const cookie = getRequestHeader("cookie") || "";
    const match = cookie.match(/admin-session=([^;]+)/);
    const token = match ? match[1] : null;
    if (token && getSession(token)) {
      throw import("@tanstack/react-router").then((m) => {
        throw m.redirect({ to: "/dashboard" });
      });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await requestOtp({ data: { email } });
      if (result.ok) {
        setStep("otp");
      } else {
        setError(result.error);
      }
    } catch {
      setError("Wystąpił błąd. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await verifyOtpFn({ data: { email, otp } });
      if (result.ok) {
        router.navigate({ to: "/dashboard" });
      } else {
        setError(result.error);
      }
    } catch {
      setError("Wystąpił błąd. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-xl font-semibold tracking-wide">
          BLISKO ADMIN
        </h1>

        {step === "email" ? (
          <form onSubmit={handleEmailSubmit}>
            <label className="mb-1 block text-sm text-gray-600">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              placeholder="admin@example.com"
              autoFocus
            />
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Wysyłanie..." : "Wyślij kod"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit}>
            <p className="mb-4 text-sm text-gray-600">
              Kod wysłany na <strong>{email}</strong>
            </p>
            <label className="mb-1 block text-sm text-gray-600">Kod OTP</label>
            <input
              type="text"
              required
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-center text-lg tracking-widest focus:border-gray-500 focus:outline-none"
              placeholder="000000"
              autoFocus
            />
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Weryfikacja..." : "Zaloguj się"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setOtp("");
                setError("");
              }}
              className="mt-2 w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Zmień email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Run dev server to verify login page renders**

Run: `pnpm admin:dev`

Open `http://localhost:3001/login` — should see email form.

**Step 3: Commit**

```
Add login route with email + OTP flow (BLI-63)
```

---

### Task 6: Dashboard route — protected hello world

**Files:**
- Create: `apps/admin/src/routes/dashboard.tsx`

**Step 1: Create `apps/admin/src/routes/dashboard.tsx`**

Protected route — checks session cookie server-side, redirects to `/login` if no valid session.

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { getRequestHeader } from "@tanstack/react-start/server";
import { getSession } from "~/lib/auth";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => {
    const cookie = getRequestHeader("cookie") || "";
    const match = cookie.match(/admin-session=([^;]+)/);
    const token = match ? match[1] : null;
    const session = token ? getSession(token) : null;
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { email: session.email };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { email } = Route.useRouteContext();

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-wide">BLISKO ADMIN</h1>
        <p className="mt-2 text-gray-500">Zalogowano jako {email}</p>
        <p className="mt-8 text-gray-400">Panel w budowie.</p>
      </div>
    </div>
  );
}
```

**Step 2: Test full flow**

Run: `pnpm admin:dev`

1. Go to `http://localhost:3001` → should redirect to `/login`
2. Enter email not on allowlist → error "Nieautoryzowany adres email."
3. Enter allowed email → should see OTP form (check console for code if Resend not configured)
4. Enter OTP → should redirect to `/dashboard`
5. Visit `/` again → should redirect to `/dashboard` (has session)

**Step 3: Commit**

```
Add protected dashboard route (BLI-63)
```

---

### Task 7: Dockerfile + Railway config

**Files:**
- Create: `apps/admin/Dockerfile`

**Step 1: Create `apps/admin/Dockerfile`**

Based on design book Dockerfile, adjusted for admin app.

```dockerfile
# ── Stage 1: Dependencies ────────────────────
FROM node:24-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/admin/package.json apps/admin/package.json

RUN pnpm install --frozen-lockfile --prefer-offline

# ── Stage 2: Build ───────────────────────────
FROM node:24-alpine AS build

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/admin/ apps/admin/

RUN pnpm --filter @repo/admin build

# ── Stage 3: Production ─────────────────────
FROM node:24-alpine AS runtime

WORKDIR /app

COPY --from=build /app/apps/admin/.output .output

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
```

**Step 2: Create Railway service and set env vars**

Using Railway MCP tools:
1. Create service `admin` in project `62599e90-30e8-47dd-af34-4e3f73c2261a`
2. Set env vars: `RESEND_API_KEY`, `ADMIN_EMAILS`, `NODE_ENV=production`
3. Generate domain (e.g. `admin-blisko.up.railway.app` or custom)

**Step 3: Commit**

```
Add Dockerfile for admin panel (BLI-63)
```

---

### Task 8: Monorepo integration + lint check

**Step 1: Add lint-staged entry to root `package.json`**

Add to `lint-staged`:
```json
"apps/admin/**/*.{ts,tsx}": "bash -c 'pnpm --filter @repo/admin typecheck'"
```

**Step 2: Run biome check**

Run: `npx @biomejs/biome check apps/admin/`

Fix any errors.

**Step 3: Run typecheck**

Run: `pnpm --filter @repo/admin typecheck`

Fix any errors.

**Step 4: Commit everything together**

```
Integrate admin panel into monorepo lint + typecheck (BLI-63)
```

---

### Task 9: Verify full flow end-to-end

**Step 1: Start dev server**

Run: `pnpm admin:dev`

**Step 2: Test the following (manual)**

1. `http://localhost:3001` → redirects to `/login`
2. Enter non-allowed email → "Nieautoryzowany adres email."
3. Enter allowed email (set `ADMIN_EMAILS` in env) → OTP sent (check console or email)
4. Enter correct OTP → redirects to `/dashboard`, shows "Zalogowano jako ..."
5. Refresh `/dashboard` → still logged in (cookie persists)
6. Visit `/` → redirects to `/dashboard`
7. Open `/dashboard` in incognito → redirects to `/login`

**Step 3: Run typecheck + biome**

Run: `pnpm --filter @repo/admin typecheck && npx @biomejs/biome check apps/admin/`

**Step 4: Final commit if any fixes needed**

---

### Summary

| Task | Description |
|------|-------------|
| 1 | Scaffold app: package.json, tsconfig, vite config, CSS, router |
| 2 | Auth library: OTP generation/verification, sessions |
| 3 | Email helper: Resend client, admin OTP template |
| 4 | Root layout + index redirect route |
| 5 | Login route: two-step email + OTP form |
| 6 | Dashboard route: protected hello world |
| 7 | Dockerfile + Railway service setup |
| 8 | Monorepo integration: lint-staged, biome, typecheck |
| 9 | End-to-end verification |
