---
name: experiment
description: Use when handing the Blisko repo to someone (often a non-developer) so they can freely try out live mobile/API changes in the iOS simulator without help — triggers include "/experiment", "set up an experiment", "I want to play with changes in the simulator", "give me a sandbox to tweak the app". Blisko-only; needs a Mac with a booted Xcode iOS simulator, the railway-blisko MCP, and Railway PR previews enabled on the project.
---

# Experiment — hands-off mobile/API sandbox

## Overview

Spins up an isolated playground so someone can change the app and watch it live, with **no developer help**. The wiring:

```
iOS simulator (local Metro, live reload of mobile changes)
  └─ EXPO_PUBLIC_API_URL = http://localhost:3000
        └─ local API (bun --watch, live reload of API changes)
              └─ DATABASE_URL  = PR-preview Postgres (public URL)
              └─ REDIS_URL      = PR-preview Redis (public URL)
              └─ BUCKET_*       = PR-preview object-storage bucket
```

Each experiment gets its own throwaway git branch + PR. Opening the PR makes Railway build a **PR-preview environment** (its own API, Postgres, Redis, and object-storage bucket — all isolated from production). We point a **locally-run API** at that PR env's Postgres + Redis + bucket, and point the **simulator** at the local API. Both the colleague's mobile and API edits hot-reload locally; the PR exists so a remote stack exists and so the work is pushed somewhere reviewable.

This skill is the **whole session**, not a one-shot. After the initial setup you keep helping the colleague make changes — and you keep the standing rule below for the rest of the session.

## Prerequisites (set up before handing the repo over)

- Mac with Xcode and a **booted** iOS simulator, `bun`, `gh` authenticated, and **git commit signing configured** (commits are GPG-signed; never bypass with `--no-gpg-sign`).
- The `railway-blisko` MCP is connected in the session (used to read PR-env status + the DB URL). The plain `railway` CLI / generic `railway` MCP may be logged into the wrong account — **prefer the `railway-blisko` MCP**.
- Railway **PR-preview environments are enabled** on the `blisko` project (project id `62599e90-30e8-47dd-af34-4e3f73c2261a`).
- `apps/api/.env` exists (provides Redis/S3/OpenAI/auth creds for the local API). Note: its `DATABASE_URL` points at **production** — Step 4 overrides it, so the local API never touches prod data.

## ⛳ Standing rule for the whole session — push after every change

After **every** change you make (the scaffold, and every later edit the colleague asks for):

1. Verify you are **not on `main`** (`git branch --show-current`). If somehow on `main`, stop and fix the branch first.
2. `git add -A`
3. Commit (signed, conventional prefix).
4. `git push`

Do this **automatically, without asking** — the colleague wants everything pushed continuously. These are **throwaway experiment branches**: do **NOT** run the normal pre-PR pipeline (`/simplify`, `/architecture-update`, `/code-review`, `/architecture-review`) and do **NOT** require a Linear ticket. Just commit and push.

---

## Step 0 — Ask exactly two questions

Ask the colleague, then wait for answers:

1. **What do you want to change / try out?** (free text — this seeds the experiment doc and branch name)
2. **Launch the iOS simulator now?** (default **yes** — they should almost always say yes)

Derive a short kebab-case `<slug>` from answer 1 (e.g. "make the wave button bigger" → `bigger-wave-button`).

## Step 1 — Branch + scaffold doc + PR (this is the first "change", so push it)

```bash
cd /path/to/repo        # the worktree/repo root
git branch --show-current   # confirm we are NOT on main before doing anything
```

Create the branch (the `enforce-branch-from-default` hook fetches and branches from `origin/main` automatically):

```bash
git checkout -b experiment/<slug>
```

Write `docs/experiments/<slug>.md` (this dir is committed — not gitignored). Seed it from answer 1:

```markdown
# Experiment: <one-line title>

**Started:** <YYYY-MM-DD>
**Branch:** experiment/<slug>

## Goal
<the colleague's answer to "what do you want to change", verbatim + lightly cleaned up>

## Notes
- (running log — update as the experiment evolves)
```

Commit, push, open the PR (no Linear ticket — experiment exemption):

```bash
git add -A
git commit -m "chore: scaffold experiment — <title>"
git push -u origin experiment/<slug>
gh pr create --assignee @me --title "chore: experiment — <title>" --body "🧪 Throwaway experiment branch — **not for merge**. Opened to spin up a Railway PR-preview env. See docs/experiments/<slug>.md."
```

Capture the **PR number** from the `gh pr create` output — you need it to find the PR environment.

## Step 2 — Wait for the Railway PR-preview environment

Opening the PR makes Railway create a `pr-<number>` environment. Poll with the MCP (build takes a few minutes):

1. `mcp__railway-blisko__list-services` with `projectId=62599e90-30e8-47dd-af34-4e3f73c2261a` → look in `environments[]` for the new env (name like `pr-<number>` / referencing the branch). Repeat every ~20–30s until it appears.
2. `mcp__railway-blisko__get-status` with that `environmentId` → wait until both the **`api`** and **`database`** services are deployed/SUCCESS. The `api` deploy runs the DB migrations, so when it's up the PR Postgres schema is ready.

If the env never appears after ~10 min, stop and tell the colleague PR previews may be misconfigured (and to ping Karol) — don't silently fall back to production.

## Step 3 — Pull the PR env's isolated connection strings

The PR env gives **its own** Postgres, Redis, and object-storage bucket (Railway provisions an isolated bucket instance per environment). The local API points at all three. The `railway-blisko` MCP has no list-variables tool, so use `mcp__railway-blisko__railway-agent` (requires `projectId`, `environmentId`, `message` — use the `pr-<number>` environment id from Step 2):

> "In this environment, return these values: `DATABASE_PUBLIC_URL` from the `database` service; `REDIS_PUBLIC_URL` from the `queue` service; and `BUCKET_ENDPOINT`, `BUCKET_NAME`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY` from the `api` service."

| Local var | ← PR env source | Reachable from Mac via |
|---|---|---|
| `DATABASE_URL` | `database` → `DATABASE_PUBLIC_URL` | TCP proxy :5432 |
| `REDIS_URL` | `queue` → `REDIS_PUBLIC_URL` | TCP proxy :6379 |
| `BUCKET_ENDPOINT` | `api` → `BUCKET_ENDPOINT` (resolves to this env's bucket) | `storage.railway.app` |
| `BUCKET_NAME` | `api` → `BUCKET_NAME` | — |
| `BUCKET_ACCESS_KEY_ID` | `api` → `BUCKET_ACCESS_KEY_ID` | — |
| `BUCKET_SECRET_ACCESS_KEY` | `api` → `BUCKET_SECRET_ACCESS_KEY` | — |

The bucket vars are Railway reference variables to a per-environment bucket, so the PR env's `api` resolves them to **that PR env's** isolated bucket — uploads never touch production.

**Fallback** (if the MCP can't): the colleague runs, via the `!` prefix: `! railway login` → `! railway link` (pick blisko → `pr-<number>`) → `! railway variables -s database`, `! railway variables -s queue`, `! railway variables -s api` and copy the matching values.

**🛑 Safety checks:**
- Confirm every value belongs to the **`pr-<number>`** environment, not production. The local API is about to read/write whatever these point at. If you can't confirm, STOP.
- **NEVER write these PR credentials into a file inside the repo tree** — the standing rule auto-pushes every change, which would leak the secrets into the PR. Pass them inline on the launch command (below), or write them only to the session scratchpad (outside the repo).

## Step 4 — Wire up and (re)launch the local stack

If a previous API/Metro is already running, kill them first — the DB connection / env changed and Expo inlines `EXPO_PUBLIC_*` at bundle start, so a restart is required:

```bash
lsof -ti :3000 | xargs -I{} kill -9 {} 2>/dev/null   # local API (no-op if nothing running)
lsof -ti :8081 | xargs -I{} kill -9 {} 2>/dev/null   # Metro
```

Point the simulator at the local API (the iOS simulator reaches the host via `localhost`):

```bash
printf 'EXPO_PUBLIC_API_URL=http://localhost:3000\nEXPO_PUBLIC_IMGPROXY_URL=https://img.blisko.app\n' > apps/mobile/.env.local
```

Start the **local API** with the PR env's DB + Redis + bucket — run it as a **background process** (use the harness's background run, NOT `nohup`, so you can monitor it). The shell-set vars override the production values in `apps/api/.env`; everything else (`OPENAI_API_KEY`, auth secrets, OAuth) is inherited from `.env`. Pass secrets **inline** (never write them into the repo — they'd be auto-pushed):

```bash
DATABASE_URL="<pr-db-public-url>" \
REDIS_URL="<pr-redis-public-url>" \
BUCKET_ENDPOINT="<pr-bucket-endpoint>" \
BUCKET_NAME="<pr-bucket-name>" \
BUCKET_ACCESS_KEY_ID="<pr-bucket-key-id>" \
BUCKET_SECRET_ACCESS_KEY="<pr-bucket-secret>" \
bun run api:dev
```

Wait for it (per the wait-on rule — never `sleep`):

```bash
npx -y wait-on tcp:localhost:3000 -t 60s
```

Sanity-check the API logs show it connected to the **PR** DB + Redis hosts (not prod).

### Step 4b — Seed a small Warsaw set

A fresh PR env has an **empty** DB, so the map starts with nobody. Seed a small set (each user enqueues one AI job — keep the count small to save tokens). Seed avatars are external `randomuser.me` URLs, so they render without any imgproxy/bucket setup:

```bash
DATABASE_URL="<pr-db-public-url>" REDIS_URL="<pr-redis-public-url>" \
SEED_USER_COUNT=15 SEED_SKIP_CLEAR=1 API_URL=http://localhost:3000 \
bun run apps/api/scripts/seed-users.ts
```

> 🛑 **`DATABASE_URL` is mandatory here and must be the PR DB.** `seed-users.ts` connects to the database directly for the avatar backfill, and prefers `process.env.DATABASE_URL` over the checked-in `apps/api/.env` (which points at **production**). `SEED_SKIP_CLEAR=1` keeps it from wiping the DB on start (the PR DB is already empty). Running it without the inline `DATABASE_URL` would target production — never do that.

Then concentrate the users near CH Reduta (within the 5 km nearby radius) via a direct-DB scatter (reads `DATABASE_URL` from the env — no API side-effects):

```bash
DATABASE_URL="<pr-db-public-url>" bun run apps/api/scripts/scatter-targeted.ts ochota:8:0 wlochy:7:8
```

### Step 4c — Launch the simulator

Launch as another **background process**:

```bash
cd apps/mobile && npx expo run:ios
```

Once it's installed and Metro is serving, set the simulator location to **CH Reduta, Warszawa**:

```bash
# CH Reduta — Al. Jerozolimskie 148, Warszawa (Ochota/Włochy border)
xcrun simctl location booted set 52.2186,20.9508
```

The map should now show the seeded people around CH Reduta. If it's still empty, check the API logs for seed/scatter errors (most likely the `DATABASE_URL` didn't point at the PR DB).

## Step 5 — Hand off

Tell the colleague, plainly:

> ✅ All set. The simulator is running against a fresh experiment database, located at CH Reduta in Warsaw. Tell me what you want to change and I'll make the change — you'll see it on the simulator. I'll push every change automatically.

Then keep working: for each request, edit the code, let it hot-reload, update `docs/experiments/<slug>.md` notes, and **apply the standing rule** (commit + push, no asking).

## Optional — testing the image-upload flow

You only need this if the colleague tests **uploading** a photo. Seed avatars are external URLs and render without imgproxy; but a user-uploaded avatar is stored in the PR bucket and served through imgproxy, and the PR env's imgproxy (a) has no public domain and (b) is hardcoded to the prod bucket by default. To make PR-bucket uploads render, use `mcp__railway-blisko__railway-agent` (projectId, the `pr-<number>` environmentId) to, in the `pr-<number>` environment:

1. Set environment-scoped overrides on the `imgproxy` service so it reads the PR bucket: `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` = the PR bucket key id/secret (Step 3), `IMGPROXY_S3_ENDPOINT` = the PR `BUCKET_ENDPOINT`.
2. Generate a public domain for the `imgproxy` service, then redeploy it.
3. Point the app at it and restart Metro (Expo inlines `EXPO_PUBLIC_*` at start):
   ```bash
   printf 'EXPO_PUBLIC_API_URL=http://localhost:3000\nEXPO_PUBLIC_IMGPROXY_URL=https://<pr-imgproxy-domain>\n' > apps/mobile/.env.local
   lsof -ti :8081 | xargs -I{} kill -9 {} 2>/dev/null
   cd apps/mobile && npx expo run:ios
   ```

**One-time simplification (recommended, do outside an experiment):** convert the `imgproxy` service's S3 vars to bucket references (`${{<bucket-id>.ACCESS_KEY_ID}}` / `.SECRET_ACCESS_KEY` / `.ENDPOINT`). Then every environment (prod + each PR) auto-reads its own bucket and step 1 above is unnecessary — you only generate a domain.

## API env vars — what the local API needs and where each comes from

The local API loads `apps/api/.env` automatically; Step 4 overrides `DATABASE_URL`, `REDIS_URL`, and the four `BUCKET_*` vars in the shell. Full map:

| Var | Source | Why |
|---|---|---|
| `DATABASE_URL` | **Repoint** → PR `database.DATABASE_PUBLIC_URL` | Isolated experiment DB |
| `REDIS_URL` | **Repoint** → PR `queue.REDIS_PUBLIC_URL` | Isolated BullMQ jobs / pub-sub |
| `BUCKET_ENDPOINT` / `BUCKET_NAME` / `BUCKET_ACCESS_KEY_ID` / `BUCKET_SECRET_ACCESS_KEY` | **Repoint** → PR `api` bucket vars (per-env Railway bucket) | Isolated uploads (see Step 3 + imgproxy note) |
| `OPENAI_API_KEY` | Local `.env` | AI profiling/analysis if the colleague triggers it |
| `BETTER_AUTH_SECRET` | Local `.env` | Session signing |
| `BETTER_AUTH_URL` | Set to `http://localhost:3000` | Auth base URL for local |
| `PORT` | Local `.env` / defaults to 3000 | Local API port |
| `ENABLE_DEV_LOGIN` | Local `.env` — must be `true` | Lets the colleague log in without OAuth |
| `IP_HASH_SALT` | Local `.env` | Required at startup |
| `RESEND_API_KEY` / `EMAIL_FROM` | Local `.env` (optional) | Only if a flow sends email |
| `INTERNAL_AI_LOG_SECRET` | Local `.env` (optional) | AI cost logging |
| `SENTRY_DSN` | Local `.env` (optional) | Can be omitted locally |
| `*_CLIENT_ID` / `*_CLIENT_SECRET` (Apple/Google/Facebook/LinkedIn) | Local `.env` (optional) | Only for real OAuth; dev-login bypasses |

If `apps/api/.env` is missing any **required** var (`BETTER_AUTH_SECRET`, `IP_HASH_SALT`, `BUCKET_*`, `OPENAI_API_KEY`), the API won't start — copy it from the main repo checkout before running.

## Notes & limitations

- **`DATABASE_URL` + `REDIS_URL` + `BUCKET_*` are repointed** to the PR env (fully isolated DB, queue, and object-storage bucket); `OPENAI_API_KEY`, auth secrets and OAuth come from `apps/api/.env`.
- **A fresh PR env starts empty** — empty DB and empty bucket (the bucket is per-environment, so existing prod avatars are not in it). See the data-seeding + imgproxy steps for how the experiment gets populated and how images render.
- **Throwaway branch.** Experiment branches/PRs are not meant to merge — no ticket, no review pipeline.
- **Restart on connection change.** Any time the PR DB/Redis URLs change (new PR env, rebuild), redo Step 4's kill → restart API → restart simulator.
- The local `apps/api/.env` `DATABASE_URL`/`REDIS_URL` are production — the Step 4 shell overrides are the only thing keeping the local API off prod. Always verify the overrides took (check the API startup logs).

## Common mistakes

| Mistake | Fix |
|---|---|
| Simulator still hits old API after rewiring | Expo inlines `EXPO_PUBLIC_*` at start — kill Metro (8081) and relaunch, don't just reload |
| Local API silently using prod DB | The `.env` `DATABASE_URL` is prod; you must set `DATABASE_URL=...` in the shell before `bun run api:dev`, and confirm the connected host in logs |
| Waiting for the API with `sleep`/`curl` loops | Use `npx -y wait-on tcp:localhost:3000` |
| Running `/simplify` + `/code-review` before each push | Experiments skip the pipeline — just commit + push |
| Can't read the DB URL (CLI wrong account) | Use `railway-blisko` MCP `railway-agent`, not the `railway` CLI |
