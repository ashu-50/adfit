# adfit — ad-to-landing-page fit analyzer

Takes the ads you are running and the page they point at, and scores how well
the page delivers on what the ad promised. Paste ad copy or upload screenshots,
give it a URL, get a graded report with the specific lines that broke the
promise and what to write instead.

The premise: most paid-acquisition waste is not a targeting problem or a bid
problem. It is that the page answers a different question than the ad asked, and
nobody on the team ever sees the two side by side.

**Status: complete and verified.** Typecheck, lint, tests and production build
all pass. See [What is missing](#what-is-missing) for the honest remainder.

---

## How it works

```
ads (text or screenshots) ──┐
                            ├──> Gemini parse/OCR ──┐
landing page URL ───────────┘                       ├──> scoring engine ──> report
                    static fetch ──> extractors ────┘
                    (escalates to headless when the HTML is an SPA shell)
```

1. **Extract.** Plain `fetch` first, because most landing pages are
   server-rendered and that costs ~200ms against ~4s for a browser. If the HTML
   turns out to be an empty shell, it escalates to the Playwright service in
   `services/renderer`. Cheerio detectors pull out the hero, every CTA, proof,
   pricing, FAQ, forms and navigation as structured data rather than a wall of text.
2. **Parse the ads.** Screenshots go through Gemini vision for OCR and structure;
   pasted text skips straight to structuring. Both land on the same `ParsedAd` shape.
3. **Analyse.** One model call compares ads against the extracted page across
   nine dimensions. A second call clusters multi-ad inputs by persuasion angle
   and drafts a page blueprint per cluster.
4. **Score.** A pure, synchronous function turns the model's per-dimension output
   into the final report. Deliberately not the model's job — see below.

### The scoring model

Nine weighted dimensions, summing to exactly 1.0:

| Dimension | Weight | The question it answers |
| --- | --- | --- |
| `MESSAGE_MATCH` | .18 | Does the headline continue the ad's promise? |
| `OFFER_MATCH` | .15 | Is it the same discount, trial or guarantee? |
| `CTA_MATCH` | .13 | Does the primary action match what the ad asked for? |
| `ABOVE_FOLD` | .12 | Does the first screen carry the promise? |
| `PERSONA_MATCH` | .11 | Does the page speak to who the ad targeted? |
| `PRODUCT_FRAMING` | .10 | Is it described as the same thing the ad sold? |
| `PROOF` | .09 | Is there evidence a sceptic would accept? |
| `OBJECTIONS` | .07 | Are price, trust and risk answered? |
| `VISUAL_CONTINUITY` | .05 | Does it look like it belongs to the ad? |

Grades band at A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, F below.

**Scoring is not the model's job.** Gemini returns per-dimension scores,
confidence, problems and recommendations. The engine in `src/lib/scoring` owns
everything after that, because these rules have to be identical across runs:

- **Critical findings impose ceilings.** A page whose CTA contradicts the ad
  cannot be "78 out of 100" no matter how good its testimonials are.
- **Low confidence is damped toward 50**, not trusted. Thin evidence should not
  produce a confident 20.
- **Inapplicable dimensions redistribute their weight** proportionally rather
  than scoring zero. With no screenshots there is no visual continuity to judge,
  and marking a page down for something the user never supplied is dishonest.
  The app overrules the model here — if it scores a dimension it had no input
  for, that score is discarded.

## Setup

Needs Node ≥ 20.11, a Supabase project and a Gemini API key.

```bash
pnpm install
cp .env.example .env.local     # then fill it in

pnpm db:migrate                # schema
pnpm db:rls                    # RLS policies + signup trigger — not optional
pnpm db:seed                   # one demo analysis, no API spend

pnpm dev
```

Commit the `pnpm-lock.yaml` that first install produces — CI runs
`pnpm install --frozen-lockfile` and will fail without it.

`pnpm db:rls` installs the trigger that mirrors `auth.users` into `public.users`.
Skip it and every signup 500s on first request.

To attach the seed to your real login instead of a placeholder:

```bash
SEED_USER_ID=<your supabase auth uid> pnpm db:seed
```

The renderer is optional. Leave `RENDERER_URL` blank and the extractor degrades
to static-only rather than failing — JavaScript-rendered pages just come back
thin. See [services/renderer](services/renderer/README.md) to run it.

## API

All routes are `nodejs` runtime and return `{ ok: true, data }` or
`{ ok: false, error: { code, message, details? } }`.

| Route | Methods | Notes |
| --- | --- | --- |
| `/api/analyses` | `GET` `POST` | POST reserves quota, returns `202` + id immediately |
| `/api/analyses/[id]` | `GET` `DELETE` | `?view=status` for poll-light responses |
| `/api/analyses/[id]/events` | `GET` | SSE progress stream |
| `/api/analyses/[id]/export` | `GET` | `?format=pdf\|markdown\|json\|csv`, plan-gated |
| `/api/analyses/[id]/rerun` | `POST` | Creates a *new* analysis so history shows before/after |
| `/api/analyses/[id]/process` | `POST` | Internal worker, `WORKER_SECRET` bearer |
| `/api/projects` | `GET` `POST` | |
| `/api/projects/[id]` | `PATCH` `DELETE` | |
| `/api/uploads` | `POST` | Returns a signed Supabase Storage upload URL |
| `/api/usage` | `GET` | Usage, dashboard stats, current plan |
| `/api/health` | `GET` | Probes DB, Gemini, renderer. `200`/`503` |
| `/api/billing/checkout` | `POST` | |
| `/api/billing/portal` | `POST` | |
| `/api/billing/webhook` | `POST` | Unauthenticated, signature-verified |
| `/auth/callback` | `GET` | PKCE and OTP flows |
| `/auth/signout` | `POST` | POST only, on purpose |

## Decisions worth knowing

**Ownership is enforced in the repository layer, not by RLS.** Prisma connects
with a role that bypasses RLS, so every query in `src/lib/db/repositories`
carries `userId` in its `WHERE` clause and there are no unscoped accessors. The
policies in `prisma/rls.sql` are defence in depth for anything reaching Postgres
through the Supabase anon key — Realtime, Storage, PostgREST.

**Quota is reserved atomically.** `reserveAnalysisQuota` is a single
`INSERT … ON CONFLICT … WHERE analyses_run < limit RETURNING`. Read-then-write
lets a user on 4 of 5 open six tabs and get eight analyses. Failures refund.

**Background work runs via `after()`.** The pipeline runs post-response in the
same invocation. `/api/analyses/[id]/process` exists as the swap-in point for a
real queue when one invocation stops being enough — the seam is already there.

**Progress is SSE polling Postgres, not Realtime.** ~900ms poll, 5-minute
lifetime cap, terminal-state detection. One less service to operate and one
less thing to authenticate, for a stream that lives about 30 seconds.

**Stripe has exactly one writer.** Every webhook funnels into
`syncSubscription(customerId)`, which re-reads the live subscription and writes
the whole plan snapshot. Webhooks arrive out of order and more than once; this
makes both facts harmless. Event ids are claimed before work and released if it
throws, so a transient failure is not recorded as handled.

**PDF export uses pdf-lib, not Puppeteer.** Rendering HTML to PDF would mean a
second Chromium round-trip for a document whose layout we fully control.

## Verification

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint
pnpm test        # vitest
pnpm build
```

All four pass. The scoring engine is the part with unit tests, because it is the
part where a silent change of behaviour would be invisible in the output — the
weight sum, the redistribution, the critical ceilings and the confidence damping
are each pinned.

> **ESLint note.** `eslint-config-next` 15.1 is eslintrc-only and loads
> `@rushstack/eslint-patch`, which fails under ESLint 9 flat config when
> imported directly. `eslint.config.mjs` goes through `FlatCompat` for exactly
> this reason. Linting is type-aware, so it is slower than you may expect and
> `no-floating-promises` is enforced.

## Screens

| Route | What it does |
| --- | --- |
| `/` | Marketing page. The hero *is* the product: a live ad-vs-page diff |
| `/login`, `/signup` | Email, Google and GitHub via Supabase Auth |
| `/dashboard` | Stat cards and the five most recent analyses |
| `/new` | The composer — URL, ads as pasted copy or dropped screenshots |
| `/analyses` | Full history with search and sort |
| `/analyses/[id]` | Live progress while running, then the report |
| `/projects` | Create and delete projects |
| `/settings/billing` | Usage against plan, checkout and Stripe portal |

### Design notes

Dark is the default rather than an alternate: the report's colour language — red
for a broken promise, green for a kept one — carries more force against near
black, and this is a tool people keep open beside their ad manager.

The type signature is a pairing, not a webfont. System sans sets prose; mono
sets every number, label and quoted fragment, so measurements read as instrument
output rather than as design. Nothing is fetched from Google Fonts, which also
means the build works offline.

The signature element is `PromiseDiff` — the ad's claim and the page's answer on
one line with the verdict between them. On the report it is **derived from the
findings' own evidence quotes**, so the summary at the top cannot drift from the
detail below it. Everything else in the app is a summary of that comparison,
which is why the interface is built around it rather than around a score dial.

## What is missing

- **Migrations are not committed.** `prisma/schema.prisma` is authoritative;
  run `pnpm db:migrate:dev --name init` once against a real database. Writing
  one by hand risks differing from Prisma's output by an index or constraint
  name, which makes drift detection demand a database reset later — a bad trade
  for saving one command.
- **API key auth.** The `ApiKey` model and the Enterprise `apiAccess`
  entitlement exist; nothing consumes them yet. Routes are session-only.
- **`AuditEvent` is written by nothing.** The model is there, the call sites are not.
- **No component or E2E tests.** The scoring engine is unit tested because it is
  where a silent behaviour change would be invisible. The UI has no coverage.
- **Screenshots are uploaded but not displayed in the report.** Visual
  continuity is scored from them server-side; the report shows the finding, not
  the image.
