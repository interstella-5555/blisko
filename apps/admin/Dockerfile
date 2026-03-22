# ── Stage 1: Dependencies ────────────────────
FROM oven/bun:1-alpine AS deps

WORKDIR /app

COPY bun.lock package.json ./
COPY apps/admin/package.json apps/admin/package.json

RUN bun install --frozen-lockfile

# ── Stage 2: Build ───────────────────────────
FROM deps AS build

COPY apps/admin/ apps/admin/

RUN bun run --filter '@repo/admin' build

# ── Stage 3: Production ─────────────────────
FROM oven/bun:1-alpine AS runtime

WORKDIR /app

COPY --from=build /app/apps/admin/.output .output

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "--bun", "run", ".output/server/index.mjs"]
