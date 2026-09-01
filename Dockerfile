# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- deps
FROM node:20-alpine AS deps
# Prisma's engines are glibc-linked; alpine needs the compat shim or the client
# fails to load at runtime with a confusing "cannot open shared object file".
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json pnpm-lock.yaml* package-lock.json* ./
RUN corepack enable && \
    if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    else npm install; fi

# ---------------------------------------------------------------- builder
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, not
# read at runtime. They must be correct here — passing them only to `docker run`
# produces an image that talks to the wrong Supabase project.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=ad-screenshots
ARG NEXT_PUBLIC_STRIPE_PRICE_PRO
ARG NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=$NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET \
    NEXT_PUBLIC_STRIPE_PRICE_PRO=$NEXT_PUBLIC_STRIPE_PRICE_PRO \
    NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE=$NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE

# Server-only values are validated at module load, so the build needs something
# schema-valid present. Real secrets arrive at runtime and are never baked in.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    SUPABASE_SERVICE_ROLE_KEY=build-placeholder-service-role-key \
    GEMINI_API_KEY=build-placeholder-gemini-key \
    WORKER_SECRET=build-placeholder-worker-secret \
    NEXT_TELEMETRY_DISABLED=1

RUN ./node_modules/.bin/prisma generate && npm run build -- --no-lint || ./node_modules/.bin/next build# ---------------------------------------------------------------- runner
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# The query engine is not part of the traced standalone output.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
