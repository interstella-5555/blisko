# `infra` — Infrastructure and tooling conventions

- `infra/bun-redis` — Use Bun's built-in `RedisClient` (`import { RedisClient } from 'bun'`) for all direct Redis ops (pub/sub, get/set). Never add `ioredis` as a dependency — BullMQ uses it internally, our code uses Bun's native client.

- `infra/restart-after-env` — After changing env vars on a Railway service, immediately redeploy that service. Don't ask, just do it.

- `infra/scripts-both-json` — All scripts go in both the package's `package.json` AND root `package.json` with `"<pkg>:<script>": "pnpm --filter @repo/<pkg> <script>"` pattern. Always run from root.

- `infra/email-via-helper` — Never call `resend.emails.send()` directly from route handlers or business logic. Each app has its own `sendEmail()` helper (API: `apps/api/src/services/email.ts`, Admin: `apps/admin/src/lib/email.ts`). New templates: export function returning `{ subject, html }`, wrap content with `layout()`.

- `infra/waves-irreversible` — Waves have no cancel/undo. By design — prevents wave/unwave notification spam.
