FROM oven/bun:1-slim

WORKDIR /app

# Website has no npm dependencies — just copy source
COPY apps/website/src ./src
COPY docs/pitch-deck.html ./docs/pitch-deck.html

# PORT is read from env at runtime (default 3001)
CMD ["bun", "run", "src/index.ts"]
