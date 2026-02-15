# ── Stage 1: Build ───────────────────────────
FROM oven/bun:1-alpine AS build

WORKDIR /app

COPY apps/chatbot/package.json apps/chatbot/package.json
RUN cd apps/chatbot && bun install

COPY apps/chatbot/ apps/chatbot/
COPY apps/api/src/db/ apps/api/src/db/

RUN cd apps/chatbot && bun build src/index.ts --outdir=dist --target=bun

# ── Stage 2: Production ─────────────────────
FROM oven/bun:1-alpine AS runtime

WORKDIR /app

COPY --from=build /app/apps/chatbot/dist ./dist

ENV NODE_ENV=production

CMD ["bun", "dist/index.js"]
