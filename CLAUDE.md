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
| `send-wave <from> <to> [msg]` | Send a wave |
| `waves <name>` | Show received & sent waves |
| `respond-wave <name> <waveId> accept\|decline` | Accept or decline a wave |
| `chats <name>` | List conversations |
| `messages <name> <convId>` | Show messages |
| `send-message <name> <convId> <text>` | Send a message |

Users are referenced by name (e.g. "ania"). The CLI resolves names to userId/token from an in-memory map. Set `API_URL` env var to override the default `http://localhost:3000`.
