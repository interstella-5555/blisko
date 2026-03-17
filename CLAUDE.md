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

**Dev CLI:** `pnpm dev-cli -- <command>` (calls API via HTTP so WebSocket events fire). `API_URL` env var overrides default `http://localhost:3000`. Users referenced by email, resolved to userId/token from in-memory cache.

| Command | Example |
|---------|---------|
| `create-user <name>` | Create user + profile + location (auto-login) |
| `send-wave --from <email> --to <email>` | Send a wave between users |
| `respond-wave <name> <waveId> accept\|decline` | Accept or decline a wave |
| `waves <name>` | Show received & sent waves |
| `chats <name>` | List conversations |
| `messages <name> <convId>` | Show messages in a conversation |
| `send-message <name> <convId> <text>` | Send a message |
| `reanalyze <email> [--clear-all]` | Clear analyses + re-trigger AI |

**Monitors:** `pnpm dev-cli:queue-monitor` (BullMQ jobs), `pnpm dev-cli:chatbot-monitor` (bot activity).

**Seed users:** Emails `user0@example.com` – `user249@example.com`, scattered across 7 Warsaw districts. Polygons: `apps/api/scripts/warszawa-dzielnice.geojson`.
- `pnpm api:scatter` — re-scatter ALL users uniformly (direct DB, no side-effects)
- `bun run apps/api/scripts/scatter-locations.ts` — re-scatter via API (fires AI re-analysis + WS broadcasts)
- `bun --env-file=apps/api/.env.production run apps/api/scripts/scatter-targeted.ts <area>:<count>:<startIdx> [...]` — targeted scatter (`--list` for areas, `--dry-run` to preview)
- Fresh seed: delete `apps/api/scripts/.seed-cache.json`, then `bun run apps/api/scripts/seed-users.ts`. Display a random test email after

**Chatbot:** `pnpm chatbot:dev`. Seed users auto-respond to waves/messages. Acceptance: AI match >=75% always accepts, scales linearly to 10% at score 0. Logging in as a seed user pauses bot for 5 min.

**After changing AI prompts:** `pnpm dev-cli -- reanalyze user42@example.com --clear-all`

**TestFlight:** `pnpm mobile:testflight` → Xcode Organizer → Distribute App manually. Set `.env.local` to production API first.

**Design Book:** `apps/design/`, `localhost:3000/design-book`. CSS modules (mangled class names). PhoneFrame: max 402px, aspect 402:874. Variants in `apps/design/src/variants/v2-*/`.

**Shared package:** `@repo/shared` — types, Zod validators, enums, haversine. Typecheck: `pnpm --filter @repo/shared typecheck`.

**Testing:** `pnpm api:test`, `pnpm --filter @repo/shared test`. E2E: Maestro (`pnpm --filter @repo/mobile test:e2e`). Tests in `apps/api/__tests__/**/*.test.ts`. Use `app.request()` directly (no server needed).

**Biome:** `pnpm check` (format + lint + imports). TanStack Query ESLint rules not applicable (tRPC manages queryKeys, Biome covers hook deps).

**Monitoring:** `GET /api/metrics/summary?window=24` (JSON overview), `GET /metrics` (Prometheus). SLO: p95 < 500ms, error_rate < 5%. Design doc: `docs/architecture/instrumentation.md`.

**Schema inspection:** `npx drizzle-kit export --sql`

---

## Linear Workflow

### Capturing ideas

- **Vague idea** (no clear scope) → label **Idea**, status **Backlog**. Short title, raw description.
- **Refined idea** (clear what to build) → label **Feature** / **Improvement** / **Bug** as appropriate.
- **Priority**: set when user expresses urgency, otherwise leave unset.
- **Sub-issues**: create with `parentId` when distinct parts emerge naturally. Don't force upfront decomposition.
- **Specs**: `docs/plans/` (committed to git, shared across worktrees) or `docs/architecture/` (permanent design docs with rationale). Linear Document for plans saved for later via `create_document` with `issue` param.
- **External feedback**: separate Idea issue per point, tagged with who gave it ("Feedback od Jarka:").
- **Mid-conversation**: if something worth tracking comes up, create the issue immediately.

### Working on a ticket

1. **Fetch & understand** — get issue description + comments + sub-issues
2. **Status → In Progress** — immediately, don't ask
3. **Create branch** — use Linear's `gitBranchName` (format: `kwypchlo/bli-X-slug`)
4. **Brainstorm if needed** — `brainstorming` skill for non-trivial work, then `writing-plans`
5. **Commit plan** — commit `docs/plans/` file immediately so other worktrees can see it: `Add implementation plan (BLI-X)`
6. **Implement** — `test-driven-development` skill. Bugs → `systematic-debugging` skill
7. **Commit** — `Fix map default state (BLI-6)` — imperative, verb-first, issue ID at end
8. **Verify** — `verification-before-completion` skill before claiming done
9. **Finish** — merge to main, status → Done. No PR (solo dev). If CI added later, use In Review + PR
10. **Sub-tasks** — each sub-issue gets own branch (`gitBranchName`), merged to main independently. Parent → Done when all children done

Technical notes: add as comments on the Linear issue.

### Development skills pipeline

Skills are **mandatory** at each stage, not optional:

| Stage | Skill |
|-------|-------|
| New idea / feature design | `brainstorming` → `writing-plans` |
| Executing plan with sub-tasks | `executing-plans` |
| Parallel independent tasks | `dispatching-parallel-agents` |
| Writing code | `test-driven-development` |
| Bug / test failure | `systematic-debugging` |
| Before Done / merge | `verification-before-completion` |
| After implementation | `requesting-code-review` |
| Receiving feedback | `receiving-code-review` |
| Branch complete | `finishing-a-development-branch` |

**Plans (`docs/plans/`) — overrides for `writing-plans` skill:**

| Skill default | Our override | Why |
|---------------|-------------|-----|
| Filename: `YYYY-MM-DD-<feature>.md` | `YYYY-MM-DD-HHmm-<feature>.md` | Multiple plans per day are common |
| Plans are gitignored, local-only | Plans are **committed to git** | Must be visible across worktrees/sessions |
| Saved at end with implementation | Committed **immediately after writing** (step 5), before implementation | Other worktrees need the plan before code starts |

**Using old plans:** Old plans are **implementation history only**. Never treat them as a source of truth for current state. Code and schema are the source of truth — if a plan contradicts the code, the code wins. When searching for context, read the actual code, not old plans.

**Architecture docs checkpoint:** After `writing-plans` — extract design decisions to `docs/architecture/<topic>.md`. After `finishing-a-development-branch` — update existing docs if approach changed during implementation.

**Ralph Protocol:** Moved to `.claude/skills/ralph-protocol.md` — auto-invoked when running Ralph, preparing tickets, or generating reports.
