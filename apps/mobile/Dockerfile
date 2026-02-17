FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy monorepo root files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy all workspace package.json files for pnpm resolution
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/chatbot/package.json ./apps/chatbot/package.json
COPY apps/design/package.json ./apps/design/package.json
COPY apps/tasks/package.json ./apps/tasks/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/dev-cli/package.json ./packages/dev-cli/package.json

RUN pnpm install --frozen-lockfile --prefer-offline

# Copy source code needed for Metro bundling
COPY apps/mobile/ ./apps/mobile/
COPY apps/api/ ./apps/api/
COPY packages/shared/ ./packages/shared/

ENV EXPO_NO_TELEMETRY=1

WORKDIR /app/apps/mobile

CMD npx expo start --port ${PORT:-8081} --host lan --non-interactive
