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

**Run:**
```bash
cd packages/dev-cli && bun run src/cli.ts
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
cd packages/dev-cli && bun run src/cli.ts reanalyze user42@example.com --clear-all
```

This truncates all `connection_analyses` and enqueues new pair analyses for the given user's nearby connections. Check results in the DB or mobile app.

## Running on physical iPhone

The API URL is controlled by `EXPO_PUBLIC_API_URL` in `apps/mobile/.env.local`.

**For physical device (Railway API):**
```bash
# Set .env.local to Railway
echo 'EXPO_PUBLIC_API_URL=https://api.meetapp.work' > apps/mobile/.env.local

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

## After restarting the app / seeding

After any restart that involves re-seeding the database, display a random test user email for quick login. Seeded users have emails `user0@example.com` through `user249@example.com`.
