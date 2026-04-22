# Authentication & Sessions

> v1 — AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-22 — BLI-156 adds pre-auth suspension/deletion gates (`emailOTP.sendVerificationOTP` early-return + `databaseHooks.session.create.before` catch-all) and extends `isAuthed` to throw `ACCOUNT_SUSPENDED`. See `moderation-suspension.md`.

Better Auth `^1.5.4` (self-hosted). Source: `apps/api/src/auth.ts`. Session middleware: `apps/api/src/trpc/trpc.ts`. Context: `apps/api/src/trpc/context.ts`. Validators: `packages/shared/src/validators.ts`.

## Terminology & Product Alignment

| PRODUCT.md | Code | UI (Polish) |
|------------|------|-------------|
| Ping | `wave` / `sendWave` | "Ping" |
| Onboarding (AI-driven) | `profilingSessions` + `profilingQA` tables, profiling tRPC procedures | "Kim jestes" flow |
| Visibility: Ninja / Semi-Open / Full Nomad | `visibilityMode`: `ninja` / `semi_open` / `full_nomad` | "Tryb widocznosci" |
| Verified badge | Not yet implemented | -- |
| Account deletion (two-phase) | `deletedAt` + `anonymizedAt` on `user`, `hard-delete-user` queue job | "Usun konto" |
| Deep link auto-login | `blisko://auth/verify?otp=...&email=...` | email button |

## Better Auth Configuration

Defined in `apps/api/src/auth.ts`. Every option documented below.

### Core Settings

| Option | Value | Why |
|--------|-------|-----|
| `database` | `drizzleAdapter(db, { provider: "pg" })` | Reuses the existing Drizzle instance, no separate connection pool |
| `secret` | `process.env.BETTER_AUTH_SECRET` | Session signing key. Rotated manually. |
| `baseURL` | `process.env.BETTER_AUTH_URL \|\| "http://localhost:3000"` | Used for OAuth callback URL generation |
| `trustedOrigins` | `["blisko://", "exp://", "http://localhost:8081", "http://localhost:19000", "http://localhost:19006"]` | Custom scheme for deep links, Expo dev URLs |

### Account Linking

```
accountLinking.enabled: true
accountLinking.trustedProviders: ["apple", "google", "facebook", "linkedin"]
accountLinking.allowDifferentEmails: true
accountLinking.updateUserInfoOnLink: true
```

**What:** Users can sign in with multiple OAuth providers. If a user signs in with Apple (email A), then later with Google (email B), the accounts are linked to the same user.

**Why `allowDifferentEmails: true`:** Apple Sign In generates a relay email (`xxx@privaterelay.appleid.com`). Without this, a user who signs in with Apple first can never link their real Google email.

**Why `updateUserInfoOnLink: true`:** When linking a new provider, the user's name/image from that provider updates the `user` record. Useful when Apple doesn't provide a name but Google does.

### CSRF and Cookie Configuration

| Option | Value | Why |
|--------|-------|-----|
| `advanced.disableCSRFCheck` | `true` | React Native doesn't send `Origin` headers. Better Auth's CSRF check rejects requests without Origin. Since the API uses Bearer tokens (not cookies) for mobile auth, CSRF protection is unnecessary -- Bearer tokens are not automatically attached by browsers. |
| `advanced.crossSubDomainCookies.enabled` | `false` | Single domain, no cross-subdomain needs |
| `advanced.cookies.state.sameSite` | `"none"` | Apple OAuth uses `response_mode=form_post`, which is a cross-site POST. `SameSite=Lax` (the default) strips cookies from cross-site POSTs, causing OAuth state mismatch. `"none"` allows the state cookie to survive the cross-site POST. |
| `advanced.cookies.state.secure` | `true` | Required when `SameSite=none`. Forces HTTPS for the state cookie. |

### Plugins

**`expo()`** -- `@better-auth/expo` plugin. Enables Expo-compatible auth flows (deep linking callbacks, secure storage token management on the client).

**`emailOTP()`** -- Magic link / OTP authentication. Configuration:

| Option | Value | Purpose |
|--------|-------|---------|
| `otpLength` | `6` | 6-digit numeric code |
| `expiresIn` | `300` (seconds) | 5-minute expiry |
| `changeEmail.enabled` | `true` | Users can change their email with OTP verification |

The `sendVerificationOTP` callback handles two OTP types:

- **`sign-in`**: Sends an email with a deep link button (`blisko://auth/verify?otp=...&email=...`) and an OTP code fallback. The deep link auto-fills and submits the OTP in the app. Template: `signInOtp()` in `apps/api/src/services/email.ts`.
- **`change-email`**: Sends just the OTP code (no deep link). Template: `changeEmailOtp()`.

Both types are also logged to console for local development.

### User Additional Fields

`displayName` is declared as an additional field on the Better Auth user model (`type: "string", required: false`). This lets Better Auth's client-side SDK type it correctly.

## OAuth Providers

All four providers use `*_CLIENT_ID` + `*_CLIENT_SECRET` env vars.

| Provider | Env Vars | Post-Link Behavior |
|----------|----------|-------------------|
| Apple | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET` | No additional data fetched. Uses `response_mode=form_post` (requires `SameSite=none` cookie). |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | No additional data fetched. Name comes from ID token. |
| Facebook | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` | After account creation, fetches real name via `https://graph.facebook.com/me?fields=name&access_token=...`. Stores as `socialLinks.facebook` on profile. |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | After account creation, fetches real name via `https://api.linkedin.com/v2/userinfo`. Stores as `socialLinks.linkedin` on profile. |

The Facebook and LinkedIn name-fetching happens in `databaseHooks.account.create.after`. It only runs when `accessToken` is available and the provider is `facebook` or `linkedin`. Failures are logged but don't block account creation.

## Session Management

### Session Creation

Sessions are created by Better Auth when:
1. OAuth callback succeeds
2. Email OTP is verified
3. Dev auto-login endpoint is used (`POST /dev/auto-login`)

Session fields: `id` (text), `token` (unique text, used as Bearer token), `expiresAt`, `userId`, `ipAddress`, `userAgent`.

Dev auto-login sessions expire after **30 days** (`Date.now() + 30 * 24 * 60 * 60 * 1000`).

### Session Resolution (tRPC Context)

`apps/api/src/trpc/context.ts` -- `createContext()` runs on every tRPC request.

**Two-phase resolution:**

1. **Better Auth session** (cookie-based): Calls `auth.api.getSession({ headers })`. Used by web clients and the Better Auth Expo plugin. Errors are silently caught -- falls through to step 2.

2. **Bearer token fallback**: If no cookie session, checks `Authorization: Bearer <token>` header. Looks up token in `session` table via prepared statement `session_by_token`. Validates `expiresAt > now`. Used by mobile app and dev-cli.

The prepared statement (`sessionByToken`) is compiled once at module load and reused on every request. It selects all columns from `session` where `token` matches and `expiresAt > now`, with `LIMIT 1`.

After resolving `userId`, the context enriches the metrics `requestMeta` WeakMap with the user ID for per-user telemetry.

### `isAuthed` Middleware

`apps/api/src/trpc/trpc.ts` -- applied to all `protectedProcedure` calls.

**Steps:**
1. Check `ctx.userId` exists, throw `UNAUTHORIZED` if not
2. Execute prepared statement `user_deletion_state` to load both `deletedAt` and `suspendedAt`
3. If `deletedAt` is set, throw `FORBIDDEN` with message `"ACCOUNT_DELETED"` (mobile app dispatches on this string)
4. Else if `suspendedAt` is set, throw `FORBIDDEN` with message `"ACCOUNT_SUSPENDED"` (BLI-156) — same shape, distinct copy. See `moderation-suspension.md`.

**Why a separate DB query for moderation state:** The session resolution in `createContext` only verifies the session token exists and hasn't expired. It doesn't check user state. The `isAuthed` middleware adds the business logic layer — even if a session is technically valid, a soft-deleted or suspended user must be blocked. Both columns live on the already-hot `user` row, so the prepared statement keeps overhead minimal.

### Pre-Auth Suspension/Deletion Gates

Two hooks in `apps/api/src/auth.ts` close the "suspended user still burns Resend quota / completes OAuth" gap that `isAuthed` alone doesn't cover (BLI-156).

#### `emailOTP.sendVerificationOTP` early-return

On the `sign-in` path (not `change-email` — that requires a vetted session), look up the target user by email before sending. If `deletedAt` or `suspendedAt` is set, throw `APIError("FORBIDDEN", { message: "ACCOUNT_DELETED" | "ACCOUNT_SUSPENDED" })`. No email is sent, no Resend quota is burned, sign-in screen renders the same Polish alert as the post-login handler.

#### `databaseHooks.session.create.before` catch-all

Runs for every session-creation path — OAuth callbacks (Apple, Google, Facebook, LinkedIn), email-OTP verify, dev auto-login. Loads the target user; throws `ACCOUNT_DELETED` or `ACCOUNT_SUSPENDED` if the corresponding column is set. No session row is created.

**Account linking note:** `accountLinking.enabled: true` + `allowDifferentEmails: true` means a suspended user who signs in with a previously-unlinked OAuth provider will have the new `account` row linked to their existing `user`. The `session.create.before` hook still fires — no session is issued. The stranded `account` is harmless and becomes usable the moment admin unsuspends.

**Not covered (out of scope for v1):** a suspended user who signs up wholly fresh (new email, unlinked OAuth provider) gets a new `user` row with a new `id` that is not subject to the existing suspension. Mitigation (phone verification, device fingerprint, reCAPTCHA on signup) is a separate ticket.

### Global Rate Limit

Applied after `isAuthed` via `protectedProcedure = t.procedure.use(isAuthed).use(globalRateLimit)`.

| Config | Value |
|--------|-------|
| Key | `global:{userId}` |
| Limit | 200 requests |
| Window | 60 seconds |
| Failure response | `TOO_MANY_REQUESTS` with JSON body containing `retryAfter` |

This is a safety net -- individual endpoints have their own tighter limits. See `apps/api/src/config/rateLimits.ts`.

## Pre-Auth Rate Limits

Applied as Hono middleware (by IP, before Better Auth handler):

| Endpoint | Limit | Window | Why |
|----------|-------|--------|-----|
| `POST /api/auth/sign-in/email-otp` | 5 | 15 min | Protects Resend costs (free tier: 3000/month) |
| `POST /api/auth/email-otp/verify-email` | 8 | 5 min | Prevents brute-force on 6-digit code (1M combinations) |

## Dev Login

Available when `NODE_ENV !== "production"` OR `ENABLE_DEV_LOGIN=true`.

**`POST /dev/auto-login`** -- accepts `{ email }`. Only `@example.com` emails allowed.

Flow:
1. Find existing user by email, or create one (`emailVerified: true`, name from email prefix)
2. Create a new session with 30-day expiry
3. Return `{ user, session, token }`

Used by seed users (user0@example.com through user249@example.com), dev-cli, and chatbot.

**`GET /dev/verifications`** -- returns last 5 verification records. Used to manually grab OTP codes during development without checking email.

## Account Lifecycle

### 1. Registration

User signs in for the first time via OAuth or email OTP. Better Auth creates `user` and `session` rows. If OAuth, also creates `account` row.

No `profiles` row yet -- the user exists in the auth system but has no app identity.

### 2. Profile Creation (Onboarding)

After first login, the mobile app detects no profile and starts onboarding. The AI profiling session (`profilingSessions` + `profilingQA`) generates `bio`, `lookingFor`, and `portrait`. User confirms, and a `profiles` row is created with `isComplete: false`.

Profile AI generation (embedding, interests, portrait) runs asynchronously via BullMQ queue job `generate-profile-ai`. When complete, `isComplete` is set to `true` and a `profileReady` WebSocket event is emitted.

### 3. Display Name Lock

After the profile is created, the user has a **5-minute grace period** to change their `displayName`. After that, `displayName` is locked -- the update procedure checks `profiles.createdAt` and rejects changes if more than 5 minutes have passed. This prevents impersonation and name-cycling abuse.

### 4. Active Usage

User can:
- Update profile fields (bio, lookingFor, socialLinks, visibilityMode, etc.)
- Set/clear status
- Send/receive waves
- Chat in DMs and groups
- Change email (via OTP verification on new email)

### 5. Soft-Delete (Grace Period)

User requests account deletion. `user.deletedAt` is set to `now()`. A delayed BullMQ job `hard-delete-user` is scheduled with **14-day delay** (1,209,600,000 ms).

Effects of soft-delete:
- `isAuthed` middleware blocks all API calls with `FORBIDDEN` / `ACCOUNT_DELETED`
- A `forceDisconnect` WebSocket event closes all active connections
- User is invisible in discovery (nearby queries filter `isNull(user.deletedAt)`)
- Waves, messages, conversations remain intact

If the user logs in during the grace period, the `hard-delete-user` job is cancelled and `deletedAt` is cleared.

### 6. Anonymization (After 14 Days)

The `hard-delete-user` queue job runs. In a transaction:

**User table:**
- `name` -> `"Usunięty użytkownik"`
- `email` -> `{uuid}@deleted.localhost`
- `emailVerified` -> `false`
- `image` -> `null`
- `anonymizedAt` -> `now()`

**Profiles table:** All fields overwritten -- `displayName` -> `"Usunięty użytkownik"`, all text/array/jsonb fields -> `null` or empty, `visibilityMode` -> `ninja`, `isComplete` -> `false`.

**Profiling sessions:** `generatedBio`, `generatedLookingFor`, `generatedPortrait` -> `null`. All `profilingQA.answer` -> `null`.

**S3 files:** Avatar and portrait URLs parsed for S3 keys, files deleted.

**Metrics:** `user_id` and `target_user_id` nullified in `metrics.request_events` (outside transaction, non-critical).

**What is NOT deleted:** Waves, messages, conversation participations, reactions, connection analyses, status matches, blocks. These reference the user via FK -- the user now displays as "Usunięty użytkownik" to other users who had interactions.

## Email Service

`apps/api/src/services/email.ts`. Sends via Resend (`RESEND_API_KEY`). Falls back to `console.log` when the API key is not set (local dev).

**Config:**
- From address: `process.env.EMAIL_FROM || "Blisko <noreply@blisko.app>"`

**Templates:**

| Template | Used For | Subject |
|----------|----------|---------|
| `signInOtp(otp, deepLink)` | Sign-in email | `"{otp} - Twoj kod do Blisko"` |
| `changeEmailOtp(otp)` | Email change verification | `"{otp} - Zmiana adresu email w Blisko"` |
| `dataExportReady(downloadUrl)` | GDPR data export | `"Twoje dane z Blisko sa gotowe do pobrania"` |

All templates use `layout()` wrapper with `BLISKO` header and `"Pozdrawiamy, Zespol Blisko"` footer. The sign-in email includes a deep link button (`blisko://auth/verify?otp=...&email=...`) and an OTP code block as fallback.

## CORS Configuration

Hono CORS middleware in `apps/api/src/index.ts`:

| Setting | Value |
|---------|-------|
| `origin` | `["http://localhost:8081", "exp://localhost:8081", "blisko://"]` |
| `credentials` | `true` |

The `blisko://` custom scheme is included for deep link callbacks. Expo dev URLs cover the metro bundler.

## Better Auth HTTP Routes

Better Auth handles `POST` and `GET` on `/api/auth/*`. This includes:
- `/api/auth/sign-in/email-otp` -- initiate email OTP
- `/api/auth/email-otp/verify-email` -- verify OTP code
- `/api/auth/callback/{provider}` -- OAuth callbacks
- `/api/auth/get-session` -- session check
- `/api/auth/sign-out` -- session destruction

## Impact Map

If you change this system, also check:
- `database.md` -- `user`, `session`, `account`, `verification` tables
- `infrastructure.md` -- env vars (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, OAuth client IDs/secrets, `RESEND_API_KEY`, `ENABLE_DEV_LOGIN`)
- `account-deletion.md` -- soft-delete and anonymization flow
- `gdpr-compliance.md` -- data export, anonymization, email templates
- `mobile-architecture.md` -- auth client uses `@better-auth/expo`, stores tokens in SecureStore
- `rate-limiting.md` -- pre-auth and global rate limits
- `demo-chatbot.md` -- chatbot uses dev auto-login endpoint
- `onboarding-flow.md` -- profiling sessions linked to auth lifecycle
