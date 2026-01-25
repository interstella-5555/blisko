FROM oven/bun:1.3.6-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
RUN bun install --frozen-lockfile

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY package.json bun.lock ./

WORKDIR /app/apps/api
RUN bun run build

# Production
FROM oven/bun:1.3.6-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./

EXPOSE 3000

CMD ["bun", "run", "dist/index.js"]
