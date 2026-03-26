# Technology Stack

**Analysis Date:** 2026-03-26

## Languages

**Primary:**
- TypeScript 6.0.2 - All source code (API, mobile, design, chatbot)
- JavaScript - Frontend/build configurations (Vite, Tailwind CLI)

**Secondary:**
- SQL - Database migrations and raw queries (PostgreSQL dialect)
- HTML/CSS - Email templates and styling

## Runtime

**Environment:**
- Bun 1.3.11 - Primary runtime for API, chatbot, and tooling
- Node.js 24.13.0 - Dev tools and fallback runtime

**Package Manager:**
- Bun - Lock file: `bun.lock`
- Workspace management via Yarn workspaces syntax in `package.json`

## Frameworks

**Core:**
- Hono 4.5.0 - HTTP framework for API server (`apps/api`)
- Expo 54.0.32 - Mobile app framework (React Native)
- TanStack Start 1.166.17 - SSR/SSG for design book and website (`apps/design`, `apps/website`)
- React 19.1.0 - UI library across all web/mobile apps
- React Native 0.81.5 - Mobile component library

**Backend/API:**
- tRPC 11.0.0-rc.0 - Type-safe API procedures (`apps/api/src/trpc`)
- Better Auth 1.5.4 - Authentication framework with email OTP + OAuth support
- @better-auth/expo 1.5.4 - Expo SDK for Better Auth

**Testing:**
- Vitest 3.0.5 - Unit test runner (`bun run api:test`, `bun run --filter @repo/shared test`)
- Maestro - E2E testing for mobile (`bun run --filter @repo/mobile test:e2e`)

**Build/Dev:**
- Vite 7.3.1 - Dev server and build tool for web apps
- TanStack Router 1.167.5 - File-based routing
- Biome 2.4.6 - Linter and formatter (replaces ESLint + Prettier)
- Tailwind CSS 4.2.2 - Utility CSS framework
- Nitro 3.0.0 - Full-stack framework for SSR apps

## Key Dependencies

**Critical:**

- `drizzle-orm` 0.45.1 - ORM for PostgreSQL queries
- `drizzle-kit` 0.31.9 - Schema migration generator
- `postgres` 3.4.0 - PostgreSQL client for `drizzle-orm`
- `pg` 8.17.2 - Alternative PostgreSQL client (used in some contexts)
- `bullmq` 5.69.2 - Job queue for async AI processing, email, and push notifications
- `zod` 4.3.5 - TypeScript-first schema validation
- `ai` 6.0.86 - Vercel AI SDK for LLM integration
- `@ai-sdk/openai` 3.0.29 - OpenAI provider for embeddings and text generation
- `prom-client` 15.1.3 - Prometheus metrics collection
- `resend` 6.8.0 - Email sending service
- `expo-server-sdk` 6.0.0 - Server-side push notifications for Expo

**Infrastructure:**

- `react-native-maps` 1.27.1 - Maps component for mobile
- `expo-router` 6.0.22 - Navigation routing for Expo
- `expo-notifications` 0.32.16 - In-app push notification UI
- `expo-location` 19.0.8 - Geolocation API
- `expo-image-picker` 17.0.10 - Image upload from device
- `expo-secure-store` 15.0.8 - Secure credential storage on mobile
- `zustand` 5.0.0 - State management for mobile
- `@tanstack/react-query` 5.50.0 - Server state management
- `ms` 2.1.3 - Time utility (for rate limiting windows)
- `lucide-react` 0.561.0 - Icon library
- `class-variance-authority` 0.7.1 - Component variant styling
- `marked` 15.0.8 - Markdown parsing

## Configuration Files

**TypeScript:**
- `tsconfig.json` (root) - Base compiler options
- Project-specific `tsconfig.json` files in each app (extends root)

**Build & Dev:**
- `vite.config.ts` - Vite configuration (apps/design, apps/website, apps/admin, apps/mobile)
- `biome.json` (root) - Formatter, linter, and import organizer rules
- `.prettierrc` - Not used; Biome handles formatting

**Database:**
- `apps/api/drizzle.config.ts` - Drizzle ORM configuration with PostgreSQL dialect
- Schema: `apps/api/src/db/schema.ts` (source of truth)
- Migrations: `apps/api/drizzle/` (16 migrations as of 2026-03-26)

**Testing:**
- `vitest.config.ts` - Vitest configuration (apps/api, apps/mobile, apps/design)
- No `jest.config.js` - Uses Vitest exclusively

**Linting & Formatting:**
- `.husky/pre-commit` - Runs `lint-staged` on commit
- `lint-staged` config in root `package.json` - Type-checks and formats staged files
- Biome auto-fixes on `bun run check:fix`

## Environment Variables

**Required for local development:**

- `DATABASE_URL` - PostgreSQL connection string (e.g., `postgresql://postgres:postgres@localhost:5432/blisko`)
- `REDIS_URL` - Redis connection for job queue and pub/sub (e.g., `redis://localhost:6379`)
- `BETTER_AUTH_SECRET` - Session encryption key
- `BETTER_AUTH_URL` - Base URL for auth callbacks (localhost or production)

**OAuth Providers (optional, fallback to console logs if missing):**

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google Sign-In
- `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET` - Apple Sign-In
- `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` - Facebook login
- `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` - LinkedIn login
- `INSTAGRAM_CLIENT_ID` / `INSTAGRAM_CLIENT_SECRET` - Instagram login (configured, not actively used)

**External Services:**

- `RESEND_API_KEY` - Email delivery via Resend (fallback: console.log)
- `OPENAI_API_KEY` - OpenAI API for embeddings (model: `text-embedding-3-small`) and text generation (model: `gpt-4o-mini`)

**Development Flags:**

- `NODE_ENV` - `development` or `production`
- `ENABLE_DEV_LOGIN` - Allow `@example.com` auto-login endpoint (useful for staging)
- `PORT` - API server port (default: 3000)

See `apps/api/.env.example` for complete template.

## Platform Requirements

**Development:**

- Node.js >= 20
- Bun runtime
- PostgreSQL 12+ (local or Railway)
- Redis (local or Railway)
- macOS with Xcode for iOS development
- iOS Simulator or physical iPhone for mobile testing

**Production:**

- Deployment: Railway (configured in `.claude/CLAUDE.md`)
- Services: API, Chatbot, Design Book, Website, Mobile (via TestFlight), Admin, Database (PostgreSQL), Queue (Redis)
- Post-deploy hooks run migrations automatically

## Monorepo Structure

**Root configuration:**
- `package.json` - Workspaces and root-level scripts
- `biome.json` - Shared linting rules
- `tsconfig.json` - Base TypeScript config

**Apps:**
- `apps/api/` - tRPC + Hono API server
- `apps/mobile/` - Expo/React Native mobile app
- `apps/design/` - Design book gallery (TanStack Start + Vite)
- `apps/website/` - Marketing website (TanStack Start + Vite)
- `apps/chatbot/` - Bot service for seed user responses
- `apps/admin/` - Admin panel (TanStack Start + Vite)

**Packages:**
- `packages/shared/` - Shared types, Zod schemas, utilities (haversine distance)
- `packages/dev-cli/` - CLI tools for development (user creation, testing)

---

*Stack analysis: 2026-03-26*
