# Admin Panel — Design (BLI-63)

## Goal

Simple admin panel with secure login. Empty interior (hello world) for now. Foundation for future admin features (feature gates, user management, stats, AI pipeline).

## Decisions

### Framework: TanStack Start

Same stack as design book — Vite, Tailwind CSS v4, Nitro, React 19. Consistent tooling, known Dockerfile pattern, Railway deploy.

### Auth: Email + OTP

1. User enters email → server function checks hardcoded allowlist (`ADMIN_EMAILS` env var, comma-separated)
2. If allowed → generate 6-digit OTP, store in-memory (Map, 5 min TTL), send via Resend
3. User enters OTP → server function verifies → sets HTTP-only session cookie
4. Protected routes check cookie via server middleware

### Sessions: In-memory Map

- Token: `crypto.randomUUID()`
- Cookie: `admin-session`, httpOnly, secure, sameSite strict, 24h TTL
- Sufficient for solo admin — no DB/Redis needed

### Email: Self-contained

Admin app has its own Resend client (shared `RESEND_API_KEY`). No dependency on API service. Simple `adminOtp(otp)` template following existing pattern (layout wrapper, `otpBlock`).

### Deploy: Railway

New service `admin`. Dockerfile based on design book pattern (multi-stage: deps → build → runtime). Env vars: `RESEND_API_KEY`, `ADMIN_EMAILS`, `SESSION_SECRET`.

## File Structure

```
apps/admin/
├── Dockerfile
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── router.tsx
│   ├── styles/app.css
│   ├── lib/
│   │   ├── auth.ts          # OTP gen/verify, session management
│   │   └── email.ts         # Resend client, adminOtp template
│   └── routes/
│       ├── __root.tsx
│       ├── index.tsx         # redirect based on session
│       ├── login.tsx         # email input → OTP input
│       └── dashboard.tsx     # hello world (protected)
```

## Routing

| Path | Behavior |
|------|----------|
| `/` | Redirect to `/login` (no session) or `/dashboard` (session) |
| `/login` | Two-step form: email → OTP |
| `/dashboard` | Protected. "Hello world" placeholder |

## Out of Scope (future)

- Feature gates CRUD
- User management / moderation
- Group management
- Statistics dashboard
- AI pipeline viewer
- RBAC (only allowlist for now)
