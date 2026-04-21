# ── Stage 1: Dependencies ────────────────────
FROM oven/bun:1-alpine AS deps

WORKDIR /app

COPY bun.lock package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/chatbot/package.json apps/chatbot/package.json
COPY apps/design/package.json apps/design/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/website/package.json apps/website/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/dev-cli/package.json packages/dev-cli/package.json
COPY patches/ patches/

RUN bun install --frozen-lockfile

# ── Stage 2: Build ───────────────────────────
FROM deps AS build

COPY apps/admin/ apps/admin/
COPY packages/db/ packages/db/
COPY packages/shared/ packages/shared/

RUN bun run --filter '@repo/admin' build

# ── Stage 3: Production ─────────────────────
FROM oven/bun:1-alpine AS runtime

WORKDIR /app

COPY --from=build /app/apps/admin/.output .output

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "--bun", "run", ".output/server/index.mjs"]
