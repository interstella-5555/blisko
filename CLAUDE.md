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

Seed users are scattered across 5 central districts (Ochota, Włochy, Wola, Śródmieście, Mokotów):
- **Bounds:** lat `52.17–52.27`, lng `20.92–21.06`
- **Constants:** `WARSAW_CENTER = {lat: 52.22, lng: 20.99}`, `SPREAD_LAT = 0.05`, `SPREAD_LNG = 0.07`

To re-scatter existing users without re-seeding (goes through the API so side-effects fire):
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

## After restarting the app / seeding

After any restart that involves re-seeding the database, display a random test user email for quick login. Seeded users have emails `user0@example.com` through `user249@example.com`.
