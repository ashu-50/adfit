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
# tsc is a build-time need only, so it is installed and discarded in one layer.
RUN npm install --no-save typescript@^5.7.3 && ./node_modules/.bin/tsc -p tsconfig.json && npm remove typescriptENV 

ENV PORT=4000
EXPOSE 4000

# Chromium spawns a process tree; without an init, zombie renderers accumulate
# until the container runs out of PIDs.
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/server.js"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
