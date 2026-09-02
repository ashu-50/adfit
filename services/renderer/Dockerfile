# ---------------------------------------------------------------- builder
# Full devDependencies (typescript, @types/node) are only needed to compile.
# A plain node image is enough here — no Chromium required for a tsc pass.
FROM node:20-slim AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------------------------------------------------------------- runner
# The Playwright image ships Chromium and every system library it needs.
# Building from node:slim instead means chasing ~40 apt packages by hand and
# rediscovering a missing one each time a page uses a font you did not expect.
FROM mcr.microsoft.com/playwright:v1.49.1-noble AS runner
WORKDIR /app
ENV NODE_ENV=production

# The base image doesn't ship dumb-init; Chromium spawns a process tree and
# without an init process, zombie renderers accumulate until the container
# runs out of PIDs.
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

ENV PORT=4000
EXPOSE 4000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/server.js"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
