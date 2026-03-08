# Blisko — Project Notes

Social proximity app — connects nearby people in Warsaw based on location, interests, and AI-generated compatibility analysis. Monorepo: API (Bun/Hono/tRPC), Mobile (Expo/React Native), Design Book (TanStack Start), Chatbot (seed user AI responder).

---

## Rules

Rules are categorized like ESLint. Each rule has a name and description. Code examples are included where the rule isn't obvious from the name alone.

### `drizzle` — Drizzle ORM query patterns and conventions

- `drizzle/no-star-select` — Never fetch `SELECT *`. Always specify `columns` (relational API) or explicit fields (query builder / `.returning()`). Fetching unused columns wastes bandwidth, memory, and can leak sensitive data.

  ```ts
  // ✅
  db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
    columns: { displayName: true, avatarUrl: true },
  });
  // ✅
  db.insert(schema.waves).values({ ... })
    .returning({ id: schema.waves.id, status: schema.waves.status });
  ```

- `drizzle/use-find-first` — Single-row fetch → `findFirst()`, not destructured array from `db.select()`. Adds `LIMIT 1` automatically, returns object directly.

- `drizzle/schema-namespace` — Import `{ db, schema }` from `@/db`, access tables as `schema.profiles`, `schema.user`. **Never** import individual tables from `db/schema.ts`. Exception: `apps/api/src/db/index.ts` itself.

- `drizzle/tx-not-db` — Inside `db.transaction(async (tx) => { ... })`, ALL queries go through `tx`. Using `db` inside a transaction runs the query outside it — won't roll back on failure.

- `drizzle/use-returning` — Use `.returning()` after insert/update when you need the row. One round-trip, not two.

- `drizzle/use-on-conflict` — Upsert with `.onConflictDoUpdate()`, not select → if → update. Atomic, no race conditions.

- `drizzle/no-raw-execute` — Raw `sql` only inside query builder calls when there's no Drizzle equivalent (Haversine, `CASE WHEN`, `NULLS LAST`, column arithmetic). **Never** standalone `db.execute(sql`...`)`. If unavoidable, create a Linear ticket (label: Improvement) explaining why.

- `drizzle/use-filters` — Use Drizzle filter functions (`eq()`, `inArray()`, `between()`, `gt()`, `lt()`, `isNull()`, `and()`, `or()`, etc. from `drizzle-orm`) over raw `sql` for conditions.

- `drizzle/stable-api-only` — v1 relational queries only (`relations()` from `drizzle-orm`). Do NOT use beta v2 API (`defineRelations`, `r.one.*`/`r.many.*`).

- `drizzle/prepared-hot-paths` — Use `.prepare("name")` with `placeholder()` for queries executed on every request (auth, session lookup).

  ```ts
  const getSession = db.query.session.findFirst({
    where: eq(schema.session.token, placeholder("token")),
    with: { user: true },
  }).prepare("session_by_token");
  const session = await getSession.execute({ token: bearerToken });
  ```

- `drizzle/prefer-relational` — Default to `findMany`/`findFirst`. Switch to query builder (`db.select().from().leftJoin()`) when relational query grows past ~15 lines, over-fetches, or needs complex joins/aggregation. Think about what SQL Drizzle will generate — `findMany` with `with` runs separate queries or lateral joins per relation, query builder produces a single explicit JOIN. Pick whichever is significantly better.

### `migrations` — Database migration workflow

Schema: `apps/api/src/db/schema.ts`. Migrations: `apps/api/drizzle/`. Config: `apps/api/drizzle.config.ts`.

- `migrations/no-db-push` — All changes through migrations, never `db:push`.

- `migrations/use-pnpm-scripts` — Always `pnpm --filter @repo/api db:generate -- --name=my_change` and `pnpm --filter @repo/api db:migrate`. Never bare `npx drizzle-kit`.

- `migrations/never-migrate-manually` — `apps/api/.env` points at the **production** database. Running `drizzle-kit migrate` locally hits prod. Migrations run automatically via Railway post-deploy hook. Only generate locally.

- `migrations/underscore-names` — Use underscores: `--name=add_metrics_schema` (not dashes).

- `migrations/one-concern` — Don't mix unrelated schema changes. Don't mix DDL (CREATE/ALTER) with DML (UPDATE/INSERT) in same migration.

- `migrations/no-interactive` — `drizzle-kit generate` blocks on rename ambiguity (interactive prompt). Split renames into two migrations: (1) add new column + copy data via `--custom`, (2) drop old column after deploying step 1. Additive changes (new tables, columns, indexes) are non-interactive — safe to run from Claude Code.

- `migrations/custom-type-changes` — Drizzle can't auto-generate type casts. Use `--custom` and write SQL manually with `USING` clause.

- `migrations/custom-for-pg-internals` — PostgreSQL extensions, custom functions, triggers → always use `--custom`. Drizzle can't generate these.

- `migrations/review-sql` — Always read generated `.sql` before committing. Drizzle-kit can produce unexpected DDL for complex changes.

- `migrations/commit-together` — Schema change + migration + application code = one commit/branch. Migration files and `drizzle/meta/` snapshots are committed to git.

- `migrations/custom-comments` — Custom migrations (`--custom`) must have SQL comments explaining WHY the custom approach is needed.

- `migrations/check-data-export` — After any schema change, check if `apps/api/src/services/data-export.ts` needs updating (GDPR/RODO data export).

### `mobile` — React Native / Expo conventions

- `mobile/no-native-headers` — **NEVER** use React Navigation's native header (`headerLeft`, `headerRight`, `headerStyle`, etc.). iOS wraps them in `UIBarButtonItem` with an ugly capsule background we can't remove. Always use `header: () => (...)` in `screenOptions` for fully custom headers.

  Standard pattern — SafeAreaView + centered title + back chevron:
  ```tsx
  header: ({ options }) => (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.bg }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.section, height: 58,
      }}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ width: 24 }}>
          <IconChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ fontFamily: fonts.serif, fontSize: 18, color: colors.ink }}>
          {options.title}
        </Text>
        <View style={{ width: 24 }} />
      </View>
    </SafeAreaView>
  ),
  contentStyle: { backgroundColor: colors.bg },
  ```

- `mobile/back-button` — Always `IconChevronLeft` from `@/components/ui/icons`, size 24, color `colors.ink`, `hitSlop={8}`. No text next to chevron (no "Wróć"/"Back"). Consistent across all headers.

- `mobile/align-with-first-line` — When placing a Switch/toggle next to label + description, put only the label and the control in a flex row with `alignItems: 'center'`. Render description as a separate element below. Otherwise the control centers against the whole block (label + description), not just the label.

- `mobile/no-expo-go` — Never use `npx expo start` / Expo Go. Native modules (expo-notifications etc.) require a dev client build.

- `mobile/no-eas` — Don't suggest EAS Build or EAS Submit. We use local Xcode builds + manual upload via Xcode Organizer. When using EAS CLI (e.g. for credentials), always `npx -y eas-cli@latest <command>`.

### `security` — GDPR, data safety

- `security/filter-soft-deleted` — The `user` table has `deletedAt`. Soft-deleted users (`deletedAt IS NOT NULL`) must be **invisible everywhere**: nearby queries, waves, conversations, group members, status matching, discoverable groups. Standard filter: `notInArray(schema.profiles.userId, db.select({ id: schema.user.id }).from(schema.user).where(isNotNull(schema.user.deletedAt)))`. The `isAuthed` tRPC middleware already blocks soft-deleted users from making API calls.

- `security/new-tables-check` — When adding new tables or queries that reference users, always check if soft-deleted users should be filtered.

### `infra` — Infrastructure and tooling conventions

- `infra/bun-redis` — Use Bun's built-in `RedisClient` (`import { RedisClient } from 'bun'`) for all direct Redis ops (pub/sub, get/set). Never add `ioredis` as a dependency — BullMQ uses it internally, our code uses Bun's native client.

- `infra/restart-after-env` — After changing env vars on a Railway service, immediately redeploy that service. Don't ask, just do it.

- `infra/scripts-both-json` — All scripts go in both the package's `package.json` AND root `package.json` with `"<pkg>:<script>": "pnpm --filter @repo/<pkg> <script>"` pattern. Always run from root.

- `infra/email-via-helper` — Never send emails via `resend.emails.send()` directly. Use `sendEmail()` from `apps/api/src/services/email.ts`. New templates: export function returning `{ subject, html }`, wrap content with `layout()`.

- `infra/waves-irreversible` — Waves have no cancel/undo. By design — prevents wave/unwave notification spam.

### `imports` — Import conventions

- `imports/use-aliases` — Prefer tsconfig path aliases over `..` relative imports. Same-directory `./` is fine.

  | App | Alias | Maps to |
  |-----|-------|---------|
  | `apps/api` | `@/*` | `src/*` |
  | `apps/mobile` | `@/*` | `src/*` |
  | `apps/design` | `~/*` | `src/*` |

### `style` — Code quality beyond Biome

- `style/no-biome-ignore` — Don't add `biome-ignore` comments or disable rules in `biome.json` to make errors go away. Fix the actual code. Only acceptable when code is intentionally correct and the rule is a false positive.

- `style/run-check` — Before finishing any task, run `npx @biomejs/biome check .` and verify 0 errors. Auto-formatting hook in `.claude/settings.json` runs `biome format --write` after every Edit/Write.

### `api` — API endpoint conventions

- `api/rate-limit-check` — When adding or changing endpoints, check if rate limiting is needed. Needed when: triggers push notifications, enqueues AI jobs, sends emails, writes to S3, or could be abused by bots. If modifying an existing rate-limited endpoint, check if the limit still makes sense. Config: `apps/api/src/config/rateLimits.ts`. Custom sliding window on Redis (Lua scripts), no external rate limiting libraries.

- `api/push-collapse` — Group push notifications use `collapseId` for unread suppression (1 audible push per unread batch, silent updates after). DM push has no suppression.

### `linear` — Linear integration conventions

Team: **Blisko**, key: **BLI**

- `linear/raw-markdown` — Pass raw markdown with real newlines to `save_issue` description. NOT escaped strings with `\\n`.

- `linear/no-blockquote-numbers` — Don't start lines with `>` followed by text (e.g. `>5 członków`). Linear treats it as blockquote. Use words: "Więcej niż 5".

- `linear/checkbox-syntax` — Checkboxes: `- [ ]` not `\[ \]`.

- `linear/verify-render` — Always check response from `save_issue` to verify markdown rendered correctly.

- `linear/no-attachment-upload` — Don't attach images via `create_attachment` (unreliable). Reference HTML mockup file paths in ticket descriptions.

- `linear/self-contained-subtasks` — Every sub-issue must be **fully self-contained**: own acceptance criteria, all implementation info (code snippets, file paths, props, styles) in the description. Never reference parent's criteria or external files from ticket descriptions. Each sub-ticket stands alone — someone reading only it should have everything needed to implement.

---

## Quick Reference

Brief pointers — details are in the code. Look there first.

**Railway:** Project ID `62599e90-30e8-47dd-af34-4e3f73c2261a`. Services: api, chatbot, design, metro (mobile), website, database (Postgres), queue (Redis). Use `mcp__railway__*` tools.

**Running locally:** `pnpm api:dev`, `pnpm design:dev`, `pnpm chatbot:dev`, `pnpm website:dev`. Mobile: `cd apps/mobile && npx expo run:ios` (simulator) or `--device` (physical). Simulator location: `xcrun simctl location booted set 52.2010865,20.9618980` (ul. Altowa, Warszawa).

**Physical iPhone:** UDID `00008130-00065CE826A0001C` (iPhone 15). API URL via `EXPO_PUBLIC_API_URL` in `apps/mobile/.env.local`:
```bash
# Production (Railway API)
echo 'EXPO_PUBLIC_API_URL=https://api.blisko.app' > apps/mobile/.env.local

# Local dev
echo -e '# API (local dev server)\nEXPO_PUBLIC_API_URL=http://192.168.50.120:3000' > apps/mobile/.env.local
```

**Env vars:** Two env files in `apps/api/`: `.env` (local dev, loaded by Bun automatically), `.env.production` (Railway credentials, never loaded automatically — use `bun --env-file=apps/api/.env.production run <script>` for scripts needing prod access or simulator/device testing). OAuth providers: `*_CLIENT_ID` + `*_CLIENT_SECRET` for Apple, Facebook, Google, LinkedIn.

**Dev CLI:** `pnpm dev-cli -- <command>`. See `packages/dev-cli/`.

**Monitors:** `pnpm dev-cli:queue-monitor` (BullMQ jobs), `pnpm dev-cli:chatbot-monitor` (bot activity).

**Seed users:** Emails `user0@example.com` through `user249@example.com`, scattered across 7 Warsaw districts (Ochota, Włochy, Wola, Śródmieście, Mokotów, Ursynów, Bemowo) using polygons from `apps/api/scripts/warszawa-dzielnice.geojson`.
- `pnpm api:scatter` — re-scatter existing users (direct DB, no side-effects)
- `cd apps/api && bun run scripts/scatter-locations.ts` — re-scatter via API (fires AI re-analysis + WS broadcasts)
- Fresh seed: delete `apps/api/scripts/.seed-cache.json` first, then `bun run apps/api/scripts/seed-users.ts`
- After re-seeding, display a random test user email (e.g. `user42@example.com`) for quick login

**Chatbot:** `apps/chatbot/`, run with `pnpm chatbot:dev`. Seed users auto-respond to waves and messages. Wave acceptance is match-based: AI match score >=75% always accepts, scales linearly down to 10% at score 0. If you log in as a seed user, the bot pauses responding as that user for 5 minutes (activity-based detection).

**After changing AI prompts:** `pnpm dev-cli -- reanalyze user42@example.com --clear-all`.

**TestFlight:** `pnpm mobile:testflight` → builds archive → opens Xcode Organizer → Distribute App manually. Set `.env.local` to production API first. Script: `apps/mobile/scripts/testflight.sh`.

**README screenshot:**
```bash
# 1. Dev server running at localhost:3000
# 2. Capture screenshot (uses ?screenshot mode on /design-book)
npx capture-website-cli "http://localhost:3000/design-book?screenshot" \
  --width 1400 --scale-factor 2 --delay 3 --full-page \
  --disable-animations --remove-elements ".nav" \
  --output docs/screens-new.png
# 3. MD5-rename for cache busting
HASH=$(md5 -q docs/screens-new.png | tail -c 7)
mv docs/screens-new.png docs/screens-$HASH.png
# 4. Update README.md with new filename, delete old file
```
Key files: `design-book.tsx` (`?screenshot` detection + early return), `Screens.tsx` (`onlyFirstRow` prop).

**Design Book:** `apps/design/`, `localhost:3000/design-book`. CSS modules (mangled class names). PhoneFrame: max 402px, aspect 402:874. Variants in `apps/design/src/variants/v2-*/`.

**Shared package:** `@repo/shared` — types, Zod validators, enums, haversine. Used by API and Mobile. Typecheck: `pnpm --filter @repo/shared typecheck`.

**Testing:** Vitest on Bun. `pnpm api:test`, `pnpm --filter @repo/shared test`. Mobile E2E: Maestro (`pnpm --filter @repo/mobile test:e2e`). Tests: `apps/api/__tests__/**/*.test.ts`. Test pattern for Hono endpoints (no server needed):
```ts
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("endpoint", () => {
  it("works", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });
});
```

**Biome:** `pnpm check` (format + lint + imports). Config: `biome.json`. TanStack Query ESLint rules not applicable (tRPC manages queryKeys, Biome covers hook deps).

**Rate limiting:** Design doc at `docs/architecture/rate-limiting.md`. Engine: `apps/api/src/services/rate-limiter.ts`. Middleware: `apps/api/src/middleware/rateLimit.ts` (pre-auth, IP key), `apps/api/src/trpc/middleware/rateLimit.ts` (post-auth, userId key).

**Schema inspection:** `npx drizzle-kit export --sql` — see what SQL the full schema would produce from scratch.

---

## Linear Workflow

### Capturing ideas

- **Vague idea** (no clear scope) → label **Idea**, status **Backlog**. Short title, raw description.
- **Refined idea** (clear what to build) → label **Feature** / **Improvement** / **Bug** as appropriate.
- **Priority**: set when user expresses urgency, otherwise leave unset.
- **Sub-issues**: create with `parentId` when distinct parts emerge naturally. Don't force upfront decomposition.
- **Specs**: `docs/plans/` (gitignored, temporary plans) or `docs/architecture/` (tracked, permanent design docs with rationale). Linear Document for plans saved for later via `create_document` with `issue` param.
- **External feedback**: separate Idea issue per point, tagged with who gave it ("Feedback od Jarka:").
- **Mid-conversation**: if something worth tracking comes up, create the issue immediately.

### Working on a ticket

1. **Fetch & understand** — get issue description + comments + sub-issues
2. **Status → In Progress** — immediately, don't ask
3. **Create branch** — use Linear's `gitBranchName` (format: `kwypchlo/bli-X-slug`)
4. **Brainstorm if needed** — `brainstorming` skill for non-trivial work, then `writing-plans`
5. **Implement** — `test-driven-development` skill. Bugs → `systematic-debugging` skill
6. **Commit** — `Fix map default state (BLI-6)` — imperative, verb-first, issue ID at end
7. **Verify** — `verification-before-completion` skill before claiming done
8. **Finish** — merge to main, status → Done. No PR (solo dev). If CI added later, use In Review + PR
9. **Sub-tasks** — each sub-issue gets own branch (`gitBranchName`), merged to main independently. Parent → Done when all children done

Technical notes: add as comments on the Linear issue.

### Development skills pipeline

Skills are **mandatory** at each stage, not optional:

| Stage | Skill | When |
|-------|-------|------|
| New idea / feature design | `brainstorming` | Before any Backlog→Todo, before non-trivial implementation |
| Implementation plan | `writing-plans` | After brainstorming, for tickets with 3+ acceptance criteria. Ask where to save: `docs/plans/` for immediate work, Linear Document for later |
| Executing plan with sub-tasks | `executing-plans` | Working through sub-issues or multi-step plans |
| Parallel independent tasks | `dispatching-parallel-agents` | 2+ tasks with no shared state |
| Writing code | `test-driven-development` | Any feature or bugfix — test before code |
| Bug / test failure | `systematic-debugging` | Before proposing any fix — diagnose first |
| Before Done / merge | `verification-before-completion` | Always. Run checks, confirm output |
| After implementation | `requesting-code-review` | Before merge, after all tests pass |
| Receiving feedback | `receiving-code-review` | When getting review comments — verify before implementing |
| Branch complete | `finishing-a-development-branch` | Deciding merge/PR/cleanup |

**Architecture docs checkpoint:** After `writing-plans` — extract design decisions to `docs/architecture/<topic>.md`. After `finishing-a-development-branch` — update existing docs if approach changed during implementation.

**Ralph Protocol:** Moved to `.claude/skills/ralph-protocol.md` — auto-invoked when running Ralph, preparing tickets, or generating reports.
