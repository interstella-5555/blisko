FROM node:24-alpine

RUN apk add --no-cache bash curl unzip \
 && curl -fsSL https://bun.sh/install | bash \
 && ln -s /root/.bun/bin/bun /usr/local/bin/bun
RUN corepack enable && corepack prepare pnpm@9 --activate

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
