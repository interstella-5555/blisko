FROM oven/bun:1-alpine

RUN bun install -g pnpm@9

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN pnpm install --frozen-lockfile --prefer-offline

COPY apps/api/ ./apps/api/
COPY packages/shared/ ./packages/shared/

ENV NODE_ENV=production

EXPOSE 3000

CMD ["pnpm", "api:start"]
