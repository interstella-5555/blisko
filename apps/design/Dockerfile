# ── Stage 1: Dependencies ────────────────────
FROM oven/bun:1-alpine AS deps

RUN bun install -g pnpm@10

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/design/package.json apps/design/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile --prefer-offline

# ── Stage 2: Build ───────────────────────────
FROM oven/bun:1-alpine AS build

RUN bun install -g pnpm@10

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/design/node_modules ./apps/design/node_modules
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/design/ apps/design/

RUN pnpm --filter @repo/design build

# ── Stage 3: Production ─────────────────────
FROM oven/bun:1-alpine AS runtime

WORKDIR /app

COPY --from=build /app/apps/design/.output .output

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "--bun", "run", ".output/server/index.mjs"]
