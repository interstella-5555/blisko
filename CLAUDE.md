# Blisko — Project Notes

## Railway

Project **blisko** on Railway (ID: `62599e90-30e8-47dd-af34-4e3f73c2261a`). Use the `mcp__railway__*` tools for managing deployments, logs, variables, etc. Workspace path: `/Users/karol/code/blisko`.

**Services → local paths:**
- api → `apps/api`
- chatbot → `apps/chatbot`
- design → `apps/design`
- metro → `apps/mobile`
- website → `apps/website`
- database → managed Postgres
- queue → managed Redis (BullMQ)

**Environment:** production

**Env vars:** After changing env vars on a service, immediately restart that service (redeploy) — don't ask, just do it.

## Regenerating README screenshot

The README includes a screenshot of 4 design book screens (Login, OTP, Profile, Waves).
The screenshot mode is built into the codebase — no temporary changes needed.

**How it works:**
- `?screenshot` query param on `/design-book` renders only `<Screens onlyFirstRow />` on a white background, hiding the sidebar and all other sections.
- `onlyFirstRow` prop on `Screens` component renders Login, OTP, Profile, and Waves Received in a single row.

**To regenerate:**

1. Make sure the dev server is running (`localhost:3000`)
2. Capture the screenshot:
   ```bash
   npx capture-website-cli "http://localhost:3000/design-book?screenshot" \
     --width 1400 --scale-factor 2 --delay 3 --full-page \
     --disable-animations --remove-elements ".nav" \
     --output docs/screens-new.png
   ```
3. Rename with last 6 chars of MD5 for cache busting:
   ```bash
   HASH=$(md5 -q docs/screens-new.png | tail -c 7)
   mv docs/screens-new.png docs/screens-$HASH.png
   ```
4. Update `README.md` to point to the new filename
5. Delete the old screenshot file and commit

**Key files:**
- `apps/design/src/routes/design-book.tsx` — `?screenshot` detection and early return
- `apps/design/src/components/design-book/Screens.tsx` — `onlyFirstRow` prop

## Running locally

```bash
# API (with auto-restart on file changes)
cd apps/api && pnpm dev

# Mobile — simulator (dev client, NOT Expo Go)
cd apps/mobile && npx expo run:ios

# Mobile — physical device
cd apps/mobile && npx expo run:ios --device
```

**Important:** Never use `npx expo start` / Expo Go — native modules (expo-notifications etc.) require a dev client build.

**Simulator location:** After launching the simulator, always set its location to ul. Altowa, Warszawa:
```bash
xcrun simctl location booted set 52.2010865,20.9618980
```

## Dev CLI

Interactive CLI for testing waves, chats, and messages without the mobile app. Calls the API via HTTP so WebSocket events fire properly.

**Location:** `packages/dev-cli/`

**Run from root:**
```bash
pnpm dev-cli -- <command> [args]
```

**Commands:**
| Command | Description |
|---------|-------------|
| `create-user <name>` | Create user + profile + location (auto-login) |
| `users` | List users created this session |
| `send-wave --from <email> --to <email>` | Send a wave |
| `waves <name>` | Show received & sent waves |
| `respond-wave <name> <waveId> accept\|decline` | Accept or decline a wave |
| `chats <name>` | List conversations |
| `messages <name> <convId>` | Show messages |
| `send-message <name> <convId> <text>` | Send a message |
| `reanalyze <email> [--clear-all]` | Clear analyses + re-trigger AI for user |

Users are referenced by name (e.g. "ania"). The CLI resolves names to userId/token from an in-memory map. Set `API_URL` env var to override the default `http://localhost:3000`.

## After changing AI prompts

After modifying AI prompts in `apps/api/src/services/ai.ts`, clear stale analyses and re-trigger for a test user:

```bash
pnpm dev-cli -- reanalyze user42@example.com --clear-all
```

This truncates all `connection_analyses` and enqueues new pair analyses for the given user's nearby connections. Check results in the DB or mobile app.

## Running on physical iPhone

The API URL is controlled by `EXPO_PUBLIC_API_URL` in `apps/mobile/.env.local`.

**For physical device (Railway API):**
```bash
# Set .env.local to Railway
echo 'EXPO_PUBLIC_API_URL=https://api.blisko.app' > apps/mobile/.env.local

# Build and install on connected iPhone
cd apps/mobile && npx expo run:ios --device
```

**To switch back to local dev:**
```bash
echo -e '# API (local dev server)\nEXPO_PUBLIC_API_URL=http://192.168.50.120:3000' > apps/mobile/.env.local
```

The iPhone UDID is `00008130-00065CE826A0001C` (Karol iPhone 15). Use `xcrun xctrace list devices` to verify.

## Seed user locations

Seed users are scattered across 7 Warsaw districts using real boundary polygons from `apps/api/scripts/warszawa-dzielnice.geojson` (source: [andilabs/warszawa-dzielnice-geojson](https://github.com/andilabs/warszawa-dzielnice-geojson)).

**Target districts** (configurable in `TARGET_DISTRICTS` array): Ochota, Włochy, Wola, Śródmieście, Mokotów, Ursynów, Bemowo.

To re-scatter existing users (direct DB, no API needed):
```bash
pnpm api:scatter
```

To re-scatter via API (fires side-effects like AI re-analysis and WS broadcasts):
```bash
cd apps/api && bun run scripts/scatter-locations.ts
```

For a fresh seed with new locations, delete the cache first:
```bash
rm apps/api/scripts/.seed-cache.json
cd apps/api && bun run scripts/seed-users.ts
```

## Chatbot (seed user auto-responses)

Separate app that makes seed users respond to waves and messages automatically.

**Run:**
```bash
cd apps/chatbot && bun dev
```

Requires the API to be running. Seed users auto-respond with AI-generated messages
in character. Wave acceptance is match-based: higher AI match score = higher chance
of accepting (>=75% always accepts, scales linearly down to 10% at score 0).

If you log in as a seed user and send messages, the bot stops responding
as that user for 5 minutes (activity-based detection).

**Location:** `apps/chatbot/`

**Env vars** (reads from API's `.env` or own):
- `DATABASE_URL` — same as API
- `API_URL` — defaults to `http://localhost:3000`
- `OPENAI_API_KEY` — same as API
- `BOT_POLL_INTERVAL_MS` — default `3000`

## Queue monitor (BullMQ debugging)

Live dashboard for the `ai-jobs` BullMQ queue. Shows waiting/active/completed jobs, timing breakdowns (queue wait vs AI call vs DB), and per-job pair names.

**Run:** `pnpm dev-cli:queue-monitor`

Reads `REDIS_URL` from env or `apps/api/.env`. Refreshes every 2s.

**What it shows:**
- Queue counts (waiting, active, delayed, failed, completed)
- Recent completed jobs with wait/process/total times
- Averages by job type
- Active + waiting jobs with user pair names and who requested the analysis

**Key file:** `packages/dev-cli/src/queue-monitor.ts`

## Chatbot monitor

Live dashboard showing what the chatbot sees: pending waves, wave decisions, active conversations with last messages.

**Run:** `pnpm dev-cli:chatbot-monitor`

Reads `DATABASE_URL` from env or `apps/api/.env`. Refreshes every 3s. Does NOT require the chatbot to be running — reads DB directly.

**What it shows:**
- Stats (bot vs human messages, accepted/declined waves in last hour)
- Pending waves waiting for seed user response
- Recent wave accept/decline decisions with match scores
- Active conversations with last 3 messages (`🤖` = bot, `[name]` = seed user)

**Key file:** `packages/dev-cli/src/chatbot-monitor.ts`

## Database migrations (Drizzle)

Schema source of truth: `apps/api/src/db/schema.ts`
Migrations folder: `apps/api/drizzle/`

**After changing `schema.ts`:**

```bash
cd apps/api
npx drizzle-kit generate --name=describe-change   # creates SQL migration + snapshot
npx drizzle-kit migrate                            # applies to database
```

- Never use `db:push` in production — always generate migration files.
- `db:push` is OK for local dev if you don't need migration history.
- Review generated SQL before running `migrate` — drizzle-kit can't handle every alteration (e.g. `text → jsonb` needs manual `USING` clause).
- For custom/manual SQL (extensions, data migrations, casts with USING), use `npx drizzle-kit generate --custom --name=describe-change` and write the SQL yourself.
- Migration files are committed to git. The `drizzle/meta/` snapshots are also committed — they're how drizzle-kit diffs against previous state.

## Layout: aligning controls with labels

When placing a Switch/toggle next to a label + description block, don't wrap both texts in one View and use `alignItems: 'center'` — the control will center against the whole block (label + description), not just the label. Instead, put only the label and the control in a flex row with `alignItems: 'center'`, and render the description as a separate element below the row. Same principle applies to any row where a control should align with the first line of text.

## Navigation headers: fully custom, no native chrome

**NEVER** use React Navigation's native header (`headerLeft`, `headerRight`, `headerBackImage`, `headerStyle`, etc.) for stack navigators in this app. The native header on iOS wraps components in `UIBarButtonItem`, which adds an ugly capsule/rounded-rect background that we can't style away.

**Always** use `header: () => (...)` in `screenOptions` (or per-screen `options`) to render a fully custom header. This bypasses the native header entirely and gives us full control.

**Standard header pattern** (used in settings, modals, and similar stack layouts):

```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, fonts } from '@/theme';
import { IconChevronLeft } from '@/components/ui/icons';

// In screenOptions:
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

**Back button rules:**
- Always `IconChevronLeft` (from `@/components/ui/icons`), size 24, color `colors.ink`
- Always `hitSlop={8}` on the Pressable
- No text next to the chevron (no "Wróć", no "Back")
- No native back button elements (`headerBackVisible: false` is irrelevant when using custom `header`)

**Screen-specific headers** (like chat with avatar + name) still use `header: () => (...)` but with a custom layout inside the SafeAreaView. The back chevron Pressable must remain identical (same icon, size, hitSlop).

**Files currently using this pattern:**
- `apps/mobile/app/settings/_layout.tsx` — standard centered title
- `apps/mobile/app/(modals)/_layout.tsx` — standard centered title
- `apps/mobile/app/chat/[id].tsx` — custom with avatar + participant name

## Scripts convention

All runnable tools must have a `scripts` entry in their own `package.json` AND a corresponding entry in the root `package.json` using the `pnpm --filter` pattern. Always run from the root directory using the root script.

**Pattern:** `"<package>:<script>": "pnpm --filter @repo/<package> <script>"`

**Example:**
```json
// root package.json
"dev-cli:queue-monitor": "pnpm --filter @repo/dev-cli monitor"

// packages/dev-cli/package.json
"monitor": "bun run src/queue-monitor.ts"
```

When creating new CLI tools, scripts, or monitors — always add both entries.

## Redis

Use Bun's built-in `RedisClient` (`import { RedisClient } from 'bun'`) for all direct Redis operations (pub/sub, get/set, etc.). Never add `ioredis` as a direct dependency — BullMQ uses it internally and that's fine, but our code should use Bun's native client.

## Drizzle queries

Always prefer Drizzle's built-in filter functions over raw `sql`\`...\``. Use `between()`, `eq()`, `ne()`, `gt()`, `lt()`, `gte()`, `lte()`, `isNull()`, `isNotNull()`, `inArray()`, `notInArray()`, `like()`, `ilike()`, `and()`, `or()`, `not()` — all from `drizzle-orm`.

Raw `sql` is only acceptable when there's no Drizzle equivalent: Haversine/distance formulas, `CASE WHEN`, `NULLS LAST` ordering, `TRUNCATE`, column arithmetic in `.set()`, or computed column aliases in `ORDER BY`.

## Soft-deleted users (GDPR)

The `user` table has a `deletedAt` column. Soft-deleted users (`deletedAt IS NOT NULL`) must be **invisible everywhere**:

- **Any query that returns user/profile data to other users** must filter out soft-deleted users
- Standard pattern: `sql\`\${profiles.userId} NOT IN (SELECT id FROM "user" WHERE deleted_at IS NOT NULL)\`` in the WHERE clause
- This applies to: nearby queries, waves, conversations, group members, status matching, discoverable groups — any place another user's profile is shown
- **When adding new tables or queries that reference users:** always check if soft-deleted users should be filtered
- The tRPC `isAuthed` middleware already blocks soft-deleted users from making API calls (throws `FORBIDDEN` / `ACCOUNT_DELETED`)

## EAS policy

Do NOT suggest using EAS Build or EAS Submit. We use local Xcode builds + manual upload via Xcode Organizer. If EAS is ever needed, the user will say so explicitly.

When using EAS CLI (e.g. for credentials), always use `npx -y eas-cli@latest <command>` — never bare `eas` or `npx eas-cli`.

## Deploying to TestFlight (without EAS)

Local build + upload to TestFlight via Xcode. No EAS subscription needed — uses Xcode's native archive and distribute flow.

**Prerequisites:**
- Active Apple Developer account (Individual / Sole Proprietor)
- App created in [App Store Connect](https://appstoreconnect.apple.com) with bundle ID `com.blisko.app`
- Xcode signed in with Apple ID (Xcode → Settings → Accounts)
- Signing team selected in Xcode project (automatic signing recommended)

**Run from root:**
```bash
pnpm mobile:testflight
```

**What it does:**
1. Installs CocoaPods if needed
2. Builds a Release archive via `xcodebuild`
3. Opens the archive in Xcode Organizer

**After the script finishes (manual step):**
1. Xcode Organizer opens with the archive
2. Click **Distribute App**
3. Select **App Store Connect** → **Upload**
4. Build appears in TestFlight within ~5-15 minutes

**Important:**
- Make sure `apps/mobile/.env.local` points to production API (`https://api.blisko.app`) before building
- First upload requires creating the app in App Store Connect (Apps → + New App → bundle ID `com.blisko.app`)
- TestFlight internal testers get builds instantly; external testers need one Beta App Review first

**Script location:** `apps/mobile/scripts/testflight.sh`

## After restarting the app / seeding

After any restart that involves re-seeding the database, display a random test user email for quick login. Seeded users have emails `user0@example.com` through `user249@example.com`.

## Design Book

Located at `apps/design/`, served at `localhost:3000/design-book`.

- CSS modules used throughout — class names are mangled, can't target them with plain CSS selectors from outside
- Root nav is `<nav className="nav">` in `__root.tsx`
- Screens: `apps/design/src/components/design-book/Screens.tsx` — phone frame mockups
- CSS: `screens.module.css`, `form-elements.module.css`, `components.module.css`
- Variants: `apps/design/src/variants/v2-*/` — each variant has its own tab bar with hardcoded labels
- PhoneFrame: max 402px wide, aspect 402:874, in screenCol constrained to 280px

## Linear integration

Team: **Blisko**, key: **BLI**

### Linear API — markdown formatting

- Pass raw markdown strings to `save_issue` description — NOT escaped strings with `\\n`. Just use normal newlines in the parameter value.
- Avoid starting a line with `>` followed by text (e.g. `>5 członków`) — Linear's markdown parser treats it as a blockquote. Use words instead: "Więcej niż 5" or "ponad 5".
- Checkboxes: use `- [ ]` not `\[ \]`
- Always double-check the response from `save_issue` to verify markdown rendered correctly before moving on.
- NEVER try to attach screenshots/images to Linear tickets via `create_attachment` — the base64 upload workflow doesn't work reliably (size limits, tool output issues). Just reference HTML mockup file paths in ticket descriptions instead.

### Capturing ideas

When user shares an idea, feedback, or feature concept:

- **Vague idea** (no clear scope) → issue with label **Idea**, status **Backlog**. Short title, raw description. Don't force structure.
- **Refined idea** (clear what to build) → use the appropriate label:
  - **Feature** = new capability
  - **Improvement** = enhancing existing thing
  - **Bug** = broken thing
  - **Idea** = vague, needs refinement
- **Priority**: set when user expresses urgency, otherwise leave unset (None).
- **Sub-issues**: when a feature has distinct parts, create sub-issues with `parentId`. Discover naturally — don't force upfront decomposition. Every sub-ticket MUST have its own acceptance criteria — never reference parent's criteria. Each sub-ticket stands alone.
- **Specs & plans**: When using `writing-plans` skill, ask where to save the plan:
  - **`docs/plans/`** (default) — for plans that will be implemented immediately in this session. Save to `docs/plans/YYYY-MM-DD-<topic>.md`.
  - **Linear Document** — for plans saved for later. Use `create_document` with `issue` param to attach to the ticket.
  Each sub-ticket must be **self-contained** — all info needed to implement it should be in its description (code snippets, file paths, props, styles). Never reference external files from ticket descriptions.
- **Mid-conversation**: if something worth tracking comes up, create the issue immediately.
- **External feedback**: when user relays feedback from others (e.g. Jarek), capture each distinct point as a separate Idea issue. Tag description with who gave the feedback ("Feedback od Jarka:").

### Development workflow — Superpowers skills

Superpowers skills are **mandatory** at each stage, not optional. Use `brainstorming` skill before any creative/design work. Use `writing-plans` skill for implementation plans (ask where to save: `docs/plans/` for immediate work, Linear Document for later). Use `verification-before-completion` skill before claiming anything is done.

| Stage | Skill | When |
|-------|-------|------|
| New idea / feature design | `brainstorming` | Before any Backlog→Todo, before non-trivial implementation |
| Implementation plan | `writing-plans` | After brainstorming, for tickets with 3+ acceptance criteria |
| Executing plan with sub-tasks | `executing-plans` | Working through sub-issues or multi-step plans |
| Parallel independent tasks | `dispatching-parallel-agents` | 2+ tasks with no shared state |
| Writing code | `test-driven-development` | Any feature or bugfix — test before code |
| Bug / test failure | `systematic-debugging` | Before proposing any fix — diagnose first |
| Before Done / merge | `verification-before-completion` | Always. Run checks, confirm output |
| After implementation | `requesting-code-review` | Before merge, after all tests pass |
| Receiving feedback | `receiving-code-review` | When getting review comments — verify before implementing |
| Branch complete | `finishing-a-development-branch` | Deciding merge/PR/cleanup |
| Feature isolation | `using-git-worktrees` | When user explicitly requests worktree |

Ralph uses the same pipeline automatically — skills trigger on context.

### Working on a ticket

When user says "work on BLI-X" or similar:

1. **Fetch & understand** — get issue description + comments + sub-issues.
2. **Status → In Progress** — do this immediately, don't ask.
3. **Create branch** — use Linear's `gitBranchName` from the issue (format: `kwypchlo/bli-X-slug`).
4. **Brainstorm if needed** — for non-trivial work, use `brainstorming` skill first. Then `writing-plans` skill (ask where to save plan).
5. **Implement** — use `test-driven-development` skill. If bugs arise, use `systematic-debugging` skill.
6. **Commit** — issue ID at end of message: `Fix map default state (BLI-6)`. Keep existing style (imperative, verb-first).
7. **Verify** — use `verification-before-completion` skill before claiming done.
8. **Finish** — merge branch to main, set status → **Done**. No PR needed (solo dev). If CI is added later, create PR and use **In Review** status before merge.
9. **Sub-tasks** — work through sub-issues in order. Each sub-issue uses its **own branch** (`gitBranchName` from the sub-issue) and gets merged to main independently. Parent → Done when all children done.

Technical notes: add as comments on the Linear issue when making non-obvious decisions.

### Ralph protocol

Autonomous worker — reads task files from `scripts/ralph-queue/`, implements them one by one.

Runner: `pnpm ralph` / `pnpm ralph:dry`

#### How it works

1. Shell picks first `.md` file from `scripts/ralph-queue/` (sorted by 5-digit prefix)
2. Shell determines if first/last sub-task for the ticket (by checking `.done/`)
3. Claude gets: system prompt + task file contents + FIRST_SUBTASK/LAST_SUBTASK flags
4. Claude implements, verifies, commits
5. Shell moves file to `.done/` on success

**Timeout & auto-retry:** Each attempt has a 10m timeout (default). On timeout, the shell assesses git state (new commits, uncommitted changes, nothing) and retries with a `## Continuation context` section describing what was already done. Max 2 retries per task — after that, auto-blocked.

**Rebase:** Only rebases on `origin/main` if the branch is actually behind. Skips if already up to date.

**Zero Linear API calls.** Linear automation detects branch names and sets In Progress / Done automatically.

#### Task file format

```
# BLI-42: Short description

Ticket: BLI-42
Branch: kwypchlo/bli-42-feature-name

## Task
What to implement.

## Files to modify
- exact/paths/here.ts

## Implementation
Detailed instructions, code snippets, approach.

## Acceptance criteria
- [ ] Criteria 1
- [ ] Criteria 2
```

#### Queue structure

```
scripts/ralph-queue/          ← gitignored
├── .done/                    ← completed files
├── 00001-BLI-42-add-schema.md
├── 00002-BLI-42-add-api.md
├── 00003-BLI-42-add-mobile.md
└── 00004-BLI-55-fix-button.md
```

- 5-digit prefix = execution order
- One branch per ticket (all sub-tasks share it)
- First sub-task: checkout from main. Subsequent: continue on branch.
- Last sub-task: merge to main.

#### Scope discipline

Commit must match the task file's acceptance criteria — nothing more, nothing less. If you spot an unrelated issue, note it in the RALPH_BLOCKED output or ignore it.

#### Verify steps

```
pnpm --filter @repo/api typecheck
pnpm --filter @repo/shared typecheck
pnpm --filter @repo/mobile typecheck
pnpm --filter @repo/api test
```

Only fix errors you introduced. Pre-existing failures are not your problem.

#### Signals

- `RALPH_MERGED` — task done, file moved to `.done/`
- `RALPH_BLOCKED` — stuck, file stays in queue (renamed `.blocked`)
- `RALPH_DONE` — queue empty, nothing to do

#### Review (for Karol)

1. `pnpm ralph:dry` — see queue state
2. `git log --oneline -20` — see what was merged
3. Blocked files: `ls scripts/ralph-queue/*.blocked` — check logs for why
4. Unblock: fix the issue, rename `.blocked` back to `.md`

### Ralph prep

Prepares task files for Ralph from Linear tickets. Triggered by "przygotuj tickety na noc" or similar.

#### Workflow

1. Query Linear: team=Blisko, status=Backlog (or tickets user specifies)
2. For each ticket:
   a. Read description + comments
   b. Explore relevant codebase (schema, API, mobile, shared)
   c. Brainstorm approach with user
   d. Split into atomic sub-tasks (1 commit each)
   e. Generate numbered `.md` files in `scripts/ralph-queue/`:
      - 5-digit prefix for ordering (00001, 00002, ...)
      - Ticket ID in filename: `00001-BLI-42-add-schema.md`
      - Self-contained: task, files, implementation, acceptance criteria
      - All sub-tasks for same ticket share the same Branch value
   f. Update Linear ticket description with structured plan
   g. Move ticket status to Todo
3. Report summary — files created, tickets prepared, any skipped

#### File numbering

Continue from the highest existing number in the queue. If queue has `00003-*`, next file is `00004-*`.

#### Skip conditions
- Ticket too vague (no clear outcome) → comment asking for clarification, leave in Backlog
- Ticket requires external info → comment "Needs: ...", leave in Backlog

### Ralph report

Summary of Ralph's work. Triggered by "ralph report" or "co się stało w nocy".

#### What to check

1. **Done files** — `ls scripts/ralph-queue/.done/` — completed tasks with ticket IDs
2. **Blocked files** — `ls scripts/ralph-queue/*.blocked` — check logs for block reason
3. **Remaining** — `ls scripts/ralph-queue/[0-9]*.md` — tasks still in queue
4. **Git log** — `git log --oneline --since="12 hours ago"` — commits on main

#### Output format

```
## Ralph report — [date]

### Done
- 00001-BLI-42-add-schema.md → [commit hash] [commit message]
- 00002-BLI-42-add-api.md → [commit hash] [commit message]

### Blocked
- 00003-BLI-42-add-mobile.md → BLOCKED: [reason from log]

### Remaining in queue
- 00004-BLI-55-fix-button.md

### Git activity
[N] commits, [summary]
```
