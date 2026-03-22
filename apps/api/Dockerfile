FROM oven/bun:1-alpine

WORKDIR /app

COPY bun.lock package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN bun install --frozen-lockfile

COPY apps/api/ ./apps/api/
COPY packages/shared/ ./packages/shared/

ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "run", "api:start"]
