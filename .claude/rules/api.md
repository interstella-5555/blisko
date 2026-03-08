# `api` — API endpoint conventions

- `api/rate-limit-check` — When adding or changing endpoints, check if rate limiting is needed. Needed when: triggers push notifications, enqueues AI jobs, sends emails, writes to S3, or could be abused by bots. If modifying an existing rate-limited endpoint, check if the limit still makes sense. Config: `apps/api/src/config/rateLimits.ts`. Custom sliding window on Redis (Lua scripts), no external rate limiting libraries.

- `api/push-collapse` — Group push notifications use `collapseId` for unread suppression (1 audible push per unread batch, silent updates after). DM push has no suppression.

# `imports` — Import conventions

- `imports/use-aliases` — Prefer tsconfig path aliases over `..` relative imports. Same-directory `./` is fine.

  | App | Alias | Maps to |
  |-----|-------|---------|
  | `apps/api` | `@/*` | `src/*` |
  | `apps/mobile` | `@/*` | `src/*` |
  | `apps/design` | `~/*` | `src/*` |

# `style` — Code quality beyond Biome

- `style/no-biome-ignore` — Don't add `biome-ignore` comments or disable rules in `biome.json` to make errors go away. Fix the actual code. Only acceptable when code is intentionally correct and the rule is a false positive.

- `style/run-check` — Before finishing any task, run `npx @biomejs/biome check .` and verify 0 errors. Auto-formatting hook in `.claude/settings.json` runs `biome format --write` after every Edit/Write.
