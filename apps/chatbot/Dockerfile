FROM oven/bun:1-alpine

WORKDIR /app

COPY bun.lock package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/chatbot/package.json ./apps/chatbot/package.json
COPY apps/design/package.json ./apps/design/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY apps/website/package.json ./apps/website/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/dev-cli/package.json ./packages/dev-cli/package.json
COPY patches/ ./patches/

RUN bun install --frozen-lockfile

COPY apps/chatbot/ ./apps/chatbot/
COPY apps/api/src/db/ ./apps/api/src/db/
COPY packages/shared/ ./packages/shared/
COPY packages/db/ ./packages/db/

ENV NODE_ENV=production

CMD ["bun", "run", "chatbot:start"]
