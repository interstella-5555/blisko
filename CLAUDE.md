# Blisko — Project Notes

Social proximity app — connects nearby people in Warsaw based on location, interests, and AI-generated compatibility analysis. Monorepo: API (Bun/Hono/tRPC), Mobile (Expo/React Native), Design Book (TanStack Start), Chatbot (seed user AI responder).

Rules are in `.claude/rules/` — one file per category: `drizzle.md`, `migrations.md`, `mobile.md`, `security.md`, `infra.md`, `api.md` (also imports + style), `linear.md`. All loaded automatically by Claude Code. When adding a new rule, put it in the matching category file. If no category fits, propose a new one (new `.md` file in `.claude/rules/`).

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
