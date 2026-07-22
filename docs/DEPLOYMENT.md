# Deployment

Two deployable units: the Next.js app and the Playwright renderer. The app runs
fine without the renderer — it falls back to static fetching and JavaScript-only
pages come back thin — so deploy the app first and add the renderer when you
want SPA coverage.

---

## 1. Supabase

Create a project, then from **Settings → API** and **Settings → Database**:

| Value | Goes into |
| --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` public key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` (server only, never public) |
| Pooled connection string, port 6543 | `DATABASE_URL` |
| Direct connection string, port 5432 | `DIRECT_URL` |

Append `?pgbouncer=true&connection_limit=1` to `DATABASE_URL`. Without it,
Prisma opens a pool on top of a pool and exhausts connections under load.

### Schema

```bash
pnpm db:migrate:dev --name init   # first time, against a real database
pnpm db:rls                       # policies, indexes, signup trigger
pnpm db:seed                      # optional demo analysis
```

`pnpm db:rls` is not optional. It installs the trigger that mirrors
`auth.users` into `public.users`; without it, every new signup fails on its
first authenticated request.

> **No migration is committed to this repo.** Prisma generates it from
> `schema.prisma` in one command against your database. A hand-written one that
> differs by so much as an index name causes drift detection to demand a reset
> later, which is a bad trade for saving one command.

### Storage

Create a **private** bucket named `ad-screenshots`. Uploads are authorised with
short-lived signed URLs minted by `/api/uploads`, so the bucket must not be
public.

### Auth

Under **Authentication → URL Configuration** set the site URL to your domain and
add the callback to the allow list:

```
https://your-domain.com/auth/callback
```

For Google and GitHub, enable each provider under **Authentication → Providers**
and paste the callback Supabase shows you into the provider's own console. The
app itself needs no extra configuration for either.

---

## 2. Vercel

Import the repo. The default build command works — `package.json` runs
`prisma generate` before `next build`, which Vercel's dependency caching would
otherwise skip and leave you with a stale client.

Set every variable from `.env.example`. Remember that `NEXT_PUBLIC_*` values are
inlined at build time: changing one requires a redeploy, not just a restart.

`ANALYSIS_MAX_DURATION_MS` defaults to 280s, which assumes a 300s function
limit. On Hobby the ceiling is 60s and long analyses will be cut off mid-run —
either upgrade or move the pipeline behind the queue seam described below.

---

## 3. Renderer

Any container host works. Railway, Fly and Render are all one command.

```bash
cd services/renderer
docker build -t adfit-renderer .
docker run -p 4000:4000 -e RENDERER_SECRET=$(openssl rand -hex 24) --shm-size=1g adfit-renderer
```

`--shm-size=1g` matters. Chromium's default 64MB of shared memory in a container
causes tab crashes that look like random timeouts.

Then point the app at it:

```
RENDERER_URL=https://renderer.your-domain.com
RENDERER_SECRET=<the same secret>
```

Budget roughly 350MB of memory per concurrent render and set
`RENDERER_CONCURRENCY` to match the container. Three fits comfortably in 2GB.

---

## 4. Stripe

Create two recurring prices, then:

```
STRIPE_SECRET_KEY=sk_live_…
NEXT_PUBLIC_STRIPE_PRICE_PRO=price_…
NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE=price_…
```

Add a webhook endpoint at `https://your-domain.com/api/billing/webhook` and
subscribe to:

```
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
invoice.paid
invoice.payment_failed
```

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

All eight events funnel into one `syncSubscription(customerId)` call that
re-reads the live subscription and writes the whole plan snapshot, so
out-of-order and duplicate deliveries are both harmless. Test locally with:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Billing is optional. Leave `STRIPE_SECRET_KEY` unset and everyone stays on the
free plan; the checkout routes return a clear error instead of crashing.

---

## 5. Docker (self-hosting)

```bash
cp .env.example .env.local     # fill it in first
docker compose up --build
```

Compose builds the app, the renderer and a local Postgres. Supabase Auth and
Storage stay hosted even in local development — reproducing them well enough to
be useful costs more than it saves.

The app image is a traced standalone bundle, so it ships `server.js` and the
Prisma engine rather than a 700MB `node_modules`.

---

## Operating notes

**Background work.** The pipeline runs via Next's `after()` — post-response, in
the same invocation. That is deliberate for a single-region deployment and has a
ceiling: one function timeout. When you outgrow it, point a queue at
`POST /api/analyses/:id/process`, which already exists, takes a bearer
`WORKER_SECRET`, and does exactly what `after()` does.

**Health checks.** `/api/health` probes Postgres, Gemini and the renderer, and
answers `503` if any is unreachable. Both Docker images have it wired to
`HEALTHCHECK`.

**Cost.** Roughly 18k input and 4k output tokens per analysis on
`gemini-2.5-flash`. Extraction results cache for a day and model replies for a
week, so re-running the same page is close to free — `forceRefresh` bypasses
both and costs a full run.

**Ownership.** Prisma connects with a role that bypasses RLS, so the
authoritative ownership check is the `userId` in every repository query. The
policies in `prisma/rls.sql` are defence in depth for anything reaching Postgres
through the anon key. If you add a repository function, it takes a `userId`.
