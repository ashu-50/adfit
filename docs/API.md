# API reference

Every route lives under `/api`, runs on the Node runtime, and answers in one
envelope:

```jsonc
// success
{ "ok": true, "data": { }, "meta": { "total": 42, "page": 1, "perPage": 20, "totalPages": 3 } }

// failure
{ "ok": false, "error": { "code": "QUOTA_EXCEEDED", "message": "…", "details": { } } }
```

Authentication is the Supabase session cookie. Requests without one get `401`
with code `UNAUTHORIZED`. Every response carries `X-Request-Id`; quote it when
reporting a problem.

## Error codes

| Code | HTTP | Means |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | Malformed request body |
| `UNAUTHORIZED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Session is valid but the resource is not yours |
| `QUOTA_EXCEEDED` | 402 | Monthly analysis limit reached |
| `NOT_FOUND` | 404 | Missing, or owned by someone else |
| `VALIDATION_FAILED` | 422 | Zod rejected the payload; `details` lists fields |
| `UNSUPPORTED_URL` | 422 | Not public, too large, or robots-disallowed |
| `RATE_LIMITED` | 429 | Token bucket empty; see `Retry-After` |
| `FETCH_FAILED` | 502 | The target page could not be reached |
| `RENDER_FAILED` | 502 | The headless renderer failed or is not configured |
| `AI_INVALID_OUTPUT` | 502 | The model's reply failed schema validation after retries |
| `AI_UNAVAILABLE` | 503 | Gemini is down or rate limiting us |
| `TIMEOUT` | 504 | The analysis exceeded `ANALYSIS_MAX_DURATION_MS` |

Errors carrying a retryable flag are `RATE_LIMITED`, `AI_UNAVAILABLE`,
`TIMEOUT`, `FETCH_FAILED` and `RENDER_FAILED`. Everything else will fail the
same way if you send it again.

---

## Analyses

### `POST /api/analyses`

Reserves quota, creates the record, kicks off the pipeline and returns
immediately with `202`. The report is not ready yet — subscribe to the event
stream or poll the status view.

```jsonc
{
  "url": "https://acme.com/pricing",
  "title": "Q3 free trial push",          // optional
  "projectId": "uuid-or-null",            // optional
  "forceRefresh": false,                  // optional, skips caches
  "ads": [
    { "type": "text", "text": "Set up in 60 seconds…", "label": "Meta" },
    { "type": "image", "storagePath": "…", "mimeType": "image/png", "fileSize": 184320 }
  ]
}
```

Up to 10 ads, of which at most 6 may be screenshots. Text ads need at least 10
characters. Free plan caps ads per analysis at 2.

→ `202 { "id": "uuid", "status": "QUEUED" }`

### `GET /api/analyses`

Query: `q`, `status`, `projectId`, `minScore`, `maxScore`, `from`, `to`,
`sort` (`recent` | `oldest` | `score-desc` | `score-asc`), `page`, `perPage`.

→ `200` list plus pagination `meta`.

### `GET /api/analyses/:id`

`?view=status` returns only the polling fields — id, status, progress, stage,
error, score, grade. Anything else returns the full detail including ads,
landing page and the hydrated report.

### `DELETE /api/analyses/:id`

Deletes the analysis and its screenshots from storage.

### `GET /api/analyses/:id/events`

Server-sent events. Emits four types:

```
event: progress   data: { "stage": "OCR", "progress": 35, "message": "Read 2 ads", "level": "info" }
event: status     data: { "id": "…", "status": "ANALYZING", "progress": 50, … }
event: done       data: { "status": "COMPLETED", "overallScore": 61, "grade": "C" }
event: error      data: { "message": "Lost contact with the analysis." }
```

Polls Postgres roughly every 900ms and closes itself on a terminal state or
after five minutes, whichever comes first.

### `GET /api/analyses/:id/export?format=`

`pdf` | `markdown` | `json` | `csv`. Plan-gated: Free gets markdown and JSON.
Returns the file as an attachment.

### `POST /api/analyses/:id/rerun`

Creates a **new** analysis against the same inputs with caches bypassed, so the
before and after both stay in history. Returns the new id.

### `POST /api/analyses/:id/process`

Internal. Requires `Authorization: Bearer $WORKER_SECRET`. This is the seam to
point a real queue at when `after()` stops being enough.

---

## Projects

- `GET /api/projects` — all projects with analysis counts
- `POST /api/projects` — `{ name, description?, color? }`; slugs are derived and de-duplicated
- `PATCH /api/projects/:id` — partial update
- `DELETE /api/projects/:id` — analyses survive, their `projectId` is nulled

## Uploads

### `POST /api/uploads`

`{ fileName, mimeType, fileSize }` → `201 { path, signedUrl, token }`.

The browser then uploads straight to Supabase Storage with
`uploadToSignedUrl(path, token, file)`. Image bytes never pass through a route
handler. PNG, JPEG, WebP and GIF only, 10MB ceiling.

## Usage

### `GET /api/usage`

→ `{ usage, stats, plan }` — the current period's counters, lifetime dashboard
stats, and the full plan definition including limits.

## Billing

- `POST /api/billing/checkout` — `{ plan: "PRO" | "ENTERPRISE", returnPath? }` → `{ url }`
- `POST /api/billing/portal` — `{ returnPath? }` → `{ url }`
- `POST /api/billing/webhook` — Stripe only; signature-verified, unauthenticated

`returnPath` must be a relative app path. Absolute URLs are rejected so the
success URL cannot be turned into an open redirect.

## Health

### `GET /api/health`

Probes the database, Gemini and the renderer. `200` when all reachable, `503`
otherwise, with per-dependency detail in the body. Safe for load balancers.

---

## Rate limits

Token buckets, per user, enforced in Postgres:

| Action | Bucket |
| --- | --- |
| Create analysis | `RATE_LIMIT_ANALYSES_PER_MINUTE` (default 5/min) |
| Export | 20/min |
| Upload | 60, refilling 1/s |
| Checkout | 5/min |
| Portal | 10/min |

Quota is separate from rate limiting: quota is monthly and reserved atomically
before any work starts, then refunded if the analysis fails.
