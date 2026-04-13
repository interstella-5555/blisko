# `api` — API endpoint conventions

- `api/rate-limit-check` — When adding or changing endpoints, check if rate limiting is needed. Needed when: triggers push notifications, enqueues AI jobs, sends emails, writes to S3, or could be abused by bots. If modifying an existing rate-limited endpoint, check if the limit still makes sense. Config: `apps/api/src/config/rateLimits.ts`. Custom sliding window on Redis (Lua scripts), no external rate limiting libraries.

- `api/push-collapse` — Group push notifications use `collapseId` for unread suppression (1 audible push per unread batch, silent updates after). DM push has no suppression.

# `config` — Configuration constants

- `config/shared-cross-app` — Constants used by more than one app (API, mobile, admin, chatbot) live in `packages/shared/src/config/<domain>.ts`, grouped by domain (e.g. `nearby.ts`, `waves.ts`, `auth.ts`). Re-exported via `packages/shared/src/config/index.ts`. Import from `@repo/shared`. When adding a new constant, ask: "does another app need this?" — if yes, it goes in shared config.

- `config/app-specific` — Constants used only within a single app stay in that app's config directory (e.g. `apps/api/src/config/`). Rate limit middleware config, metrics buffer sizes, admin sidebar — these are app internals.

- `config/local-only` — A constant used in exactly one file with no meaning outside that context stays in the file. Don't extract `const MAX_RETRIES = 3` from a single retry loop.

# `imports` — Import conventions

- `imports/use-aliases` — Prefer tsconfig path aliases over `..` relative imports. Same-directory `./` is fine.

  | App | Alias | Maps to |
  |-----|-------|---------|
  | `apps/api` | `@/*` | `src/*` |
  | `apps/mobile` | `@/*` | `src/*` |
  | `apps/design` | `~/*` | `src/*` |

