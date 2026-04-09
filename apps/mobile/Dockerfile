FROM node:24-slim

RUN apt-get update && apt-get install -y curl unzip && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

WORKDIR /app

# Copy monorepo root files
COPY bun.lock package.json ./

# Copy all workspace package.json files for bun resolution
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/chatbot/package.json ./apps/chatbot/package.json
COPY apps/design/package.json ./apps/design/package.json
COPY apps/website/package.json ./apps/website/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/dev-cli/package.json ./packages/dev-cli/package.json

RUN bun install --frozen-lockfile

# Copy source code needed for Metro bundling
COPY apps/mobile/ ./apps/mobile/
COPY apps/api/ ./apps/api/
COPY packages/shared/ ./packages/shared/

ENV EXPO_NO_TELEMETRY=1
ENV CI=1

WORKDIR /app/apps/mobile

CMD npx expo start --port ${PORT:-8081}
