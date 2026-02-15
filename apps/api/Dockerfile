FROM oven/bun:1-alpine

WORKDIR /app

COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN cd apps/api && bun install
RUN cd packages/shared && bun install

COPY apps/api/ ./apps/api/
COPY packages/shared/ ./packages/shared/

ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "apps/api/src/index.ts"]
