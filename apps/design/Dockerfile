# ── Stage 1: Dependencies ────────────────────
FROM oven/bun:1-alpine AS deps

WORKDIR /app

COPY bun.lock package.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/chatbot/package.json apps/chatbot/package.json
COPY apps/design/package.json apps/design/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/website/package.json apps/website/package.json
COPY packages/dev-cli/package.json packages/dev-cli/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN bun install --frozen-lockfile

# ── Stage 2: Build ───────────────────────────
FROM oven/bun:1-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/design/node_modules ./apps/design/node_modules
COPY bun.lock package.json ./
COPY apps/design/ apps/design/

RUN bun run --filter '@repo/design' build

# ── Stage 3: Production ─────────────────────
FROM oven/bun:1-alpine AS runtime

WORKDIR /app

COPY --from=build /app/apps/design/.output .output

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "--bun", "run", ".output/server/index.mjs"]
