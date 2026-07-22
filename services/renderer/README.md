# adfit renderer

Playwright behind a two-endpoint HTTP API. The Next.js app calls it when static
HTML turns out to be an empty SPA shell.

```
POST /render   Authorization: Bearer $RENDERER_SECRET
     { "url": "https://…", "screenshot": true, "waitUntil": "networkidle", "timeoutMs": 40000 }
  -> { "html": "…", "finalUrl": "…", "status": 200, "screenshotBase64": "…", "durationMs": 4210 }

GET  /health
  -> { "ok": true, "browser": "up", "active": 0, "queued": 0 }
```

## Running it

```bash
npm install && npx playwright install chromium
RENDERER_SECRET=dev npm run dev
```

Or with Docker, which is what production should use:

```bash
docker build -t adfit-renderer .
docker run -p 4000:4000 -e RENDERER_SECRET=dev --shm-size=1g adfit-renderer
```

`--shm-size=1g` matters. Chromium's default 64MB of shared memory in a container
causes tab crashes that look like random timeouts.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4000` | |
| `RENDERER_SECRET` | _(none)_ | Unset means unauthenticated. Set it anywhere reachable. |
| `RENDERER_CONCURRENCY` | `3` | Contexts in flight. Budget ~350MB each. |
| `RENDERER_TIMEOUT_MS` | `40000` | Per-render ceiling, capped at 60s. |

## Deliberate choices

**Images load, analytics does not.** The screenshot feeds the visual-continuity
score, so blocking images would mean scoring a page that no visitor ever sees.
Trackers, video and web fonts are blocked because nothing downstream reads them.

**Viewport screenshot, not full page.** The score it feeds is about the first
screen. A full-page capture of a long marketing site is several megabytes of
base64 for no analytical gain.

**SSRF is re-checked here.** The app validates URLs before calling, but this
service has its own address. Without the DNS and private-range checks in
`assertPublicUrl`, anyone who can reach it can read the VPC through it.

**One browser, one context per request.** Contexts cost about 10ms and isolate
cookies and cache; browsers cost about 700ms. Two analyses of the same site must
not share a session.
