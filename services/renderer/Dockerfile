# The Playwright image ships Chromium and every system library it needs.
# Building from node:slim instead means chasing ~40 apt packages by hand and
# rediscovering a missing one each time a page uses a font you did not expect.
FROM mcr.microsoft.com/playwright:v1.49.1-noble

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src
# tsc is a build-time need only; npx --package pins it to the typescript
# binary explicitly so it can never resolve to the unrelated "tsc" stub package.
RUN npx --yes --package typescript@^5.7.3 --package @types/node@^22.10.5 tsc -p tsconfig.json

ENV PORT=4000
EXPOSE 4000

# Chromium spawns a process tree; without an init, zombie renderers accumulate
# until the container runs out of PIDs.
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/server.js"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
