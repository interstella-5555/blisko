FROM oven/bun:1-alpine

WORKDIR /app

COPY bun.lock package.json ./
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/chatbot/package.json ./apps/chatbot/package.json
COPY apps/design/package.json ./apps/design/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY apps/website/package.json ./apps/website/package.json
COPY packages/dev-cli/package.json ./packages/dev-cli/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN bun install --frozen-lockfile

COPY apps/chatbot/ ./apps/chatbot/
COPY apps/api/src/db/ ./apps/api/src/db/
COPY packages/shared/ ./packages/shared/

ENV NODE_ENV=production

CMD ["bun", "run", "chatbot:start"]
