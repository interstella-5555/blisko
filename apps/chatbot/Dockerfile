FROM oven/bun:1-alpine

RUN bun install -g pnpm@9

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/chatbot/package.json ./apps/chatbot/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN pnpm install --frozen-lockfile --prefer-offline

COPY apps/chatbot/ ./apps/chatbot/
COPY apps/api/src/db/ ./apps/api/src/db/

ENV NODE_ENV=production

CMD ["pnpm", "chatbot:start"]
