# ── Stage 1: Dependencies ────────────────────
FROM oven/bun:1-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/admin/package.json apps/admin/package.json

RUN pnpm install --frozen-lockfile --prefer-offline

# ── Stage 2: Build ───────────────────────────
FROM oven/bun:1-alpine AS build

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/admin/ apps/admin/

RUN pnpm --filter @repo/admin build

# ── Stage 3: Production ─────────────────────
FROM oven/bun:1-alpine AS runtime

WORKDIR /app

COPY --from=build /app/apps/admin/.output .output

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "--bun", "run", ".output/server/index.mjs"]
