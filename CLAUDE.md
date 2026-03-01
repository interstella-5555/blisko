# Blisko — Project Notes

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

# Mobile (Expo)
cd apps/mobile && npx expo start
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

## EAS policy

Do NOT suggest using EAS Build or EAS Submit. We use local Xcode builds + manual upload via Xcode Organizer. If EAS is ever needed, the user will say so explicitly.

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

## Linear integration

Team: **Blisko**, key: **BLI**

### Capturing ideas

When user shares an idea, feedback, or feature concept:

- **Vague idea** (no clear scope) → issue with label **Idea**, status **Backlog**. Short title, raw description. Don't force structure.
- **Refined idea** (clear what to build) → use the appropriate label:
  - **Feature** = new capability
  - **Improvement** = enhancing existing thing
  - **Bug** = broken thing
  - **Idea** = vague, needs refinement
- **Priority**: set when user expresses urgency, otherwise leave unset (None).
- **Sub-issues**: when a feature has distinct parts, create sub-issues with `parentId`. Discover naturally — don't force upfront decomposition.
- **Specs & plans**: use **Linear Documents** attached to the parent ticket (`create_document` with `issue` param) for implementation plans, PRDs, and technical specs. **Never save plans as local files** — `docs/plans/` is legacy. When using `writing-plans` skill, save output as Linear Document instead of local file. Each sub-ticket must be **self-contained** — all info needed to implement it should be in its description (code snippets, file paths, props, styles). Never reference external files from ticket descriptions.
- **Mid-conversation**: if something worth tracking comes up, create the issue immediately.
- **External feedback**: when user relays feedback from others (e.g. Jarek), capture each distinct point as a separate Idea issue. Tag description with who gave the feedback ("Feedback od Jarka:").

### Development workflow — Superpowers skills

Superpowers skills are **mandatory** at each stage, not optional. Use `brainstorming` skill before any creative/design work. Use `writing-plans` skill for implementation plans (output → Linear Document). Use `verification-before-completion` skill before claiming anything is done.

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
4. **Brainstorm if needed** — for non-trivial work, use `brainstorming` skill first. Then `writing-plans` skill → save as Linear Document attached to the ticket.
5. **Implement** — use `test-driven-development` skill. If bugs arise, use `systematic-debugging` skill.
6. **Commit** — issue ID at end of message: `Fix map default state (BLI-6)`. Keep existing style (imperative, verb-first).
7. **Verify** — use `verification-before-completion` skill before claiming done.
8. **Finish** — merge branch to main, set status → **Done**. No PR needed (solo dev). If CI is added later, create PR and use **In Review** status before merge.
9. **Sub-tasks** — work through sub-issues in order. Each sub-issue uses its **own branch** (`gitBranchName` from the sub-issue) and gets merged to main independently. Parent → Done when all children done.

Technical notes: add as comments on the Linear issue when making non-obvious decisions.

### Ralph protocol

Autonomous worker protocol — Ralph works through queued tickets.
State is tracked in Linear (primary source of truth) and `scripts/ralph-progress.txt` (agent memory between sessions).
Runner script: `scripts/ralph.sh` (`pnpm ralph` / `pnpm ralph:dry`).

#### Key principle: one task per iteration

Each iteration is a fresh Claude session that does ONE thing:
- One sub-issue of a larger ticket, OR
- One small standalone ticket

Linear decides what to work on. The memory file (`scripts/ralph-progress.txt`) carries technical context between sessions (branch state, decisions, known issues) but does NOT determine the task queue.

#### Ticket selection (Linear-first)

Every iteration queries Linear. The memory file is never authoritative for "what to do next".

1. **Check In Progress first** — query team=Blisko, status="In Progress". If there's a parent ticket In Progress with sub-issues, find the next Todo sub-issue (lowest identifier) and continue.
2. **Todo queue** — query team=Blisko, status=Todo, label=Ralph.
3. **Ordering** — pick ticket based on: small before large (fewer acceptance criteria / fewer files to touch) > priority > identifier.
4. **Check blockers** — fetch the selected ticket with `includeRelations: true`. If it has `blockedBy` relations that aren't Done, skip it and pick the next one.
5. **If selected ticket has a parentId** — it's a sub-issue. Before starting:
   a. Fetch all siblings (sub-issues of the same parent).
   b. Check if any earlier sibling (lower identifier number) is still not Done — if so, work on that one first instead.
   c. Use the **sub-issue's own `gitBranchName`** for the branch (each sub-issue = own branch, merged to main independently).
   d. After the last sibling is done, verify the parent's acceptance criteria. If all pass → parent → Done. If something is missing → create a new sub-issue.

#### Per-task workflow

1. **QUERY LINEAR** — find the next task (see ticket selection above).

2. **CHECK COMMENTS** — read recent comments on the ticket (and parent if sub-issue). Look for feedback, scope changes, blocker resolutions from Karol. This is 1 MCP call — skip only for brand-new tickets.

3. **READ MEMORY** — check the memory file for technical context: branch name, decisions, known issues. If it's stale (refers to a different ticket), ignore it.

4. **SETUP**
   - `git checkout main && git pull origin main`
   - Create or checkout branch (`gitBranchName` from Linear; each sub-issue uses its own branch)
   - Set status → In Progress in Linear (only if not already)

5. **PRE-FLIGHT CHECK**
   - Scan the ticket description for file paths and function/component names it references.
   - Verify they exist in the codebase (Glob/Grep). If a ticket says "modify `GroupMarker.tsx`" but the file doesn't exist and this ticket doesn't create it → it depends on another ticket. Skip, treat as blocked.
   - This is a quick check (few Glob calls), not a deep analysis.

6. **IMPLEMENT**
   - One task, one commit. Format: `Verb description (BLI-X)` (GPG signed).
   - **Stuck detection:** if you hit the same error 3 times or spend more than ~15 turns without progress, stop and treat as blocked. Don't burn iterations on a dead end.

7. **VERIFY**
   - `pnpm --filter @repo/api typecheck`
   - `pnpm --filter @repo/shared typecheck`
   - `pnpm --filter @repo/mobile typecheck`
   - `pnpm --filter @repo/api test` (if tests exist)
   - If tests fail: 2 attempts to fix, then treat as blocked.

8. **UPDATE MEMORY FILE** — always, before finishing. Write technical context for the next session (branch, decisions, known issues). Do NOT track task queue here — that's Linear's job.

9. **FINISH**
   - **Standalone ticket done** → merge to main, delete branch, Linear status → Done, remove Ralph label, output `RALPH_MERGED`
   - **Sub-task done** → merge sub-task branch to main, delete branch, sub-task → Done. If last sub-task: verify parent acceptance criteria, parent → Done, remove Ralph label. Output `RALPH_MERGED`
   - **Blocked** → push branch, comment blocker on Linear ticket, output `RALPH_BLOCKED`

#### Linear usage

Linear is queried every iteration (2-3 calls: list issues + get issue + optional list comments). This is the cost of having a single source of truth.

**Per iteration:**
- **Ticket selection** — list issues (In Progress, then Todo+Ralph)
- **Ticket details** — get issue with relations
- **Comments check** — list comments (for feedback/context)
- **Status changes** — Todo → In Progress, → Done
- **Completion/blocker comments** — short summary when finishing or blocked

**Avoid:** mid-task status updates, redundant queries for tickets you already fetched this session.

#### Memory file format

The memory file (`scripts/ralph-progress.txt`) stores technical context, not task state:

```
# Ralph Memory

## Last session
Ticket: BLI-X — Title
Branch: kwypchlo/bli-x-slug
Commit: abc1234

## Technical notes
- Implementation details the next session needs
- Known issues not related to our work

## Decisions
- Why approach X was chosen over Y
```

#### Tickets with sub-issues

When picking a ticket that has sub-issues, **always work through sub-issues** — never the parent directly.

1. Query sub-issues of the parent ticket. Work through them in order (by identifier).
2. Each sub-issue uses **its own branch** (`gitBranchName` from the sub-issue). Merged to main independently after completion.
3. Each sub-issue = one iteration. One at a time. Start from fresh main (`git checkout main && git pull`).
4. After the last sub-issue is done, **verify the parent ticket**: check all acceptance criteria from the parent description. If something is missing or broken, create a new sub-issue and continue. If everything passes → parent → Done, remove Ralph label.

#### Splitting large tickets

A ticket is "too large" when it has 4+ acceptance criteria or touches 3+ areas.

1. Create sub-issues in Linear as children of the parent ticket.
2. Follow the "Tickets with sub-issues" flow above.

#### Error handling

| Situation | Action |
|-----------|--------|
| Blocked (missing info/API key) | Update memory file, comment on Linear, output `RALPH_BLOCKED` |
| Tests fail after 2 attempts | Push branch, update memory file with details, output `RALPH_BLOCKED` |
| Git merge conflict | Attempt to resolve; if complex → push branch, output `RALPH_BLOCKED` |
| Session ends (max turns) | Commit+push current work, update memory file |
| DB migration needed | Generate migration file, but NEVER run `drizzle-kit migrate` on production |

#### Review (for Karol)

1. Check Linear for current state — Done = complete, In Progress + "BLOCKED" comment = needs help
2. `git log --oneline -20` — see what was merged
3. `scripts/ralph-progress.txt` — technical context from last session (secondary)
4. Blocked tickets: fix the issue, put back to Todo + Ralph
5. `pnpm ralph --reset` to clear memory file for a fresh start

### Ralph prep

Batch preparation of Backlog tickets for Ralph. Triggered by "przygotuj tickety na noc" or similar.

#### Workflow

1. Query: team=Blisko, status=Backlog, label=Idea
2. For each ticket:
   a. Read description + comments
   b. Explore relevant codebase areas (schema, API routes, mobile screens, shared types)
   c. Write structured description using the Backlog→Todo template:
      - Problem / Kontekst
      - Rozwiązanie
      - Plan implementacji (specific files, components, approach)
      - Kryteria akceptacji (testable checkboxes)
   d. Update ticket description in Linear (structured content above original)
   e. Move status to Todo
   f. Add label Ralph, keep label Idea
   g. Comment: "Prepared for Ralph. Implementation plan: ..."
3. After all tickets: report summary to user — what was prepared, any tickets skipped (too vague, needs user input)

#### Skip conditions
- Ticket too vague to plan (no clear outcome) → comment asking for clarification, leave in Backlog
- Ticket requires external info (API keys, design decisions) → comment "Needs: ...", leave in Backlog
- Ticket already has structured description → skip, just add Ralph label

#### User review
After prep, Karol reviews in Linear:
- Remove Ralph label from tickets not ready
- Adjust priorities if needed
- Add missing context to skipped tickets

### Ralph report

Generates a summary of Ralph's work. Triggered by "ralph report", "morning report", or "co się stało w nocy".

#### What to check

1. **Linear tickets** — query team=Blisko, updatedAt last 12h. Group by status:
   - **Done** — list with summary of changes from merge comment
   - **In Progress + has "BLOCKED" comment** — list with block reason
   - **In Progress (no block)** — still being worked on or session ended mid-work

2. **Git log** — `git log --oneline --since="12 hours ago"` on main branch. Count commits, summarize changes.

3. **CI status** — check if latest GitHub Actions runs passed (if CI workflow exists)

#### Output format

```
## Ralph report — [date]

### Done (merged to main)
- BLI-X: [title] — [1-line summary of changes]
- BLI-Y: [title] — [1-line summary of changes]

### Blocked (needs attention)
- BLI-Z: [title] — BLOCKED: [reason]. Branch: `branch-name`
  → Recommended: [action to unblock]

### Git activity
[N] commits, [+added/-removed] lines
Key changes: [summary]

### CI status
[pass/fail] — [link if failed]

### Recommended actions
1. [action for blocked ticket]
2. [action for next steps]
```
