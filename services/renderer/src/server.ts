/**
 * Headless rendering service.
 *
 * Chromium does not fit in a serverless function and a cold browser launch per
 * request would dominate latency, so it lives here: one long-lived container
 * that keeps a browser warm and hands back HTML plus a first-screen screenshot.
 *
 * The Next.js app talks to it over HTTP (see src/lib/extraction/fetcher.ts) and
 * degrades to static fetching when it is unreachable, so this service is a
 * quality upgrade rather than a hard dependency.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { chromium, type Browser, type BrowserContext } from "playwright";

const PORT = Number(process.env.PORT ?? 4000);
const SECRET = process.env.RENDERER_SECRET ?? "";
const MAX_CONCURRENCY = Number(process.env.RENDERER_CONCURRENCY ?? 3);
const DEFAULT_TIMEOUT_MS = Number(process.env.RENDERER_TIMEOUT_MS ?? 40_000);
const MAX_BODY_BYTES = 16 * 1024;
const VIEWPORT = { width: 1366, height: 900 };

const USER_AGENT =
  "Mozilla/5.0 (compatible; AdFitBot/1.0; +https://adfit.app/bot) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

type RenderRequest = {
  url: string;
  screenshot?: boolean;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  timeoutMs?: number;
};

type RenderResponse = {
  html: string;
  finalUrl: string;
  status: number;
  screenshotBase64?: string;
  durationMs: number;
};

// ------------------------------------------------------------------ browser

let browser: Browser | null = null;
let launching: Promise<Browser> | null = null;

/**
 * One browser, many contexts. A context is ~10ms and gives each render its own
 * cookie jar, cache and storage, so two analyses of the same site can never see
 * each other's session. Launching a browser per request would cost ~700ms.
 */
async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  if (launching) return launching;

  launching = chromium
    .launch({
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
      ],
    })
    .then((b) => {
      browser = b;
      launching = null;
      // A crashed browser must not wedge the service: drop the handle so the
      // next request relaunches instead of failing forever.
      b.on("disconnected", () => {
        if (browser === b) browser = null;
      });
      return b;
    })
    .catch((err: unknown) => {
      launching = null;
      throw err;
    });

  return launching;
}

// ------------------------------------------------------------------ guards

const PRIVATE_V4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

function isPrivateAddress(address: string, family: number): boolean {
  if (family === 4) return PRIVATE_V4.some((re) => re.test(address));
  const a = address.toLowerCase();
  if (a === "::1" || a === "::") return true;
  if (a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe80")) return true;
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) would otherwise slip past the v6 checks.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped?.[1]) return PRIVATE_V4.some((re) => re.test(mapped[1] as string));
  return false;
}

/**
 * The app guards its own fetches, but this service is separately addressable.
 * Without this check it is an open SSRF proxy into whatever VPC it runs in.
 */
async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "That is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, "Only http and https URLs can be rendered.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new HttpError(400, "That host is not reachable from here.");
  }

  if (isIP(host)) {
    if (isPrivateAddress(host, isIP(host))) throw new HttpError(400, "That address is not publicly routable.");
    return url;
  }

  const records = await lookup(host, { all: true, verbatim: true }).catch(() => {
    throw new HttpError(400, `Could not resolve ${host}.`);
  });
  if (records.length === 0) throw new HttpError(400, `Could not resolve ${host}.`);
  if (records.some((r) => isPrivateAddress(r.address, r.family))) {
    throw new HttpError(400, "That host resolves to a private address.");
  }
  return url;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// ------------------------------------------------------------------ queue

let active = 0;
const waiting: Array<() => void> = [];

/** Chromium contexts are memory-hungry; more than a handful at once will OOM a
 *  small container long before CPU becomes the limit. */
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENCY) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

// ------------------------------------------------------------------ render

const BLOCKED_TYPES = new Set(["media", "font", "websocket", "manifest"]);
const BLOCKED_HOSTS = [
  "googletagmanager.com", "google-analytics.com", "doubleclick.net",
  "facebook.net", "hotjar.com", "fullstory.com", "segment.io", "intercom.io",
];

async function render(input: RenderRequest): Promise<RenderResponse> {
  const started = Date.now();
  const url = await assertPublicUrl(input.url);
  const timeout = Math.min(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, 60_000);

  const b = await getBrowser();
  let context: BrowserContext | null = null;

  try {
    context = await b.newContext({
      userAgent: USER_AGENT,
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      locale: "en-US",
      timezoneId: "UTC",
      javaScriptEnabled: true,
      bypassCSP: true,
      ignoreHTTPSErrors: true,
    });
    context.setDefaultTimeout(timeout);

    // Images stay enabled: the screenshot feeds the visual-continuity score, so
    // a page rendered without its hero art would be scored on the wrong thing.
    // Analytics and video are dead weight either way.
    await context.route("**/*", (routeReq) => {
      const req = routeReq.request();
      const type = req.resourceType();
      const host = (() => {
        try {
          return new URL(req.url()).hostname;
        } catch {
          return "";
        }
      })();
      if (BLOCKED_TYPES.has(type) || BLOCKED_HOSTS.some((h) => host.endsWith(h))) {
        return routeReq.abort().catch(() => undefined);
      }
      return routeReq.continue().catch(() => undefined);
    });

    const page = await context.newPage();

    const response = await page.goto(url.toString(), {
      waitUntil: input.waitUntil ?? "networkidle",
      timeout,
    });

    // networkidle never settles on pages with polling or a persistent socket.
    // The goto above throws in that case; falling back to whatever has painted
    // beats returning nothing, because a half-hydrated page still has a hero.
    await page.waitForTimeout(350);

    // Lazy-loaded heroes only appear after a scroll event. One pass down and
    // back is enough to trigger IntersectionObserver without changing what the
    // first-screen screenshot shows.
    await page
      .evaluate(async () => {
        const step = Math.max(400, window.innerHeight);
        for (let y = 0; y < Math.min(document.body.scrollHeight, step * 6); y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 120));
        }
        window.scrollTo(0, 0);
      })
      .catch(() => undefined);

    await page.waitForTimeout(250);

    const html = await page.content();
    const finalUrl = page.url();
    const status = response?.status() ?? 200;

    let screenshotBase64: string | undefined;
    if (input.screenshot !== false) {
      // Viewport only, not fullPage: the score this feeds is about what the
      // visitor sees before scrolling, and a full-page PNG of a long marketing
      // site can be 8MB of base64 for no analytical gain.
      const buffer = await page.screenshot({ type: "jpeg", quality: 78, fullPage: false }).catch(() => null);
      if (buffer) screenshotBase64 = buffer.toString("base64");
    }

    return { html, finalUrl, status, screenshotBase64, durationMs: Date.now() - started };
  } finally {
    await context?.close().catch(() => undefined);
  }
}

// ------------------------------------------------------------------ http

function send(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Request body too large.");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Body must be JSON.");
  }
}

/** Length-independent compare so a wrong secret cannot be probed by timing. */
function secretMatches(header: string | undefined): boolean {
  if (!SECRET) return true;
  const provided = header?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(provided.padEnd(64, "\0").slice(0, 64));
  const bBuf = Buffer.from(SECRET.padEnd(64, "\0").slice(0, 64));
  let diff = provided.length === SECRET.length ? 0 : 1;
  for (let i = 0; i < 64; i++) diff |= (a[i] ?? 0) ^ (bBuf[i] ?? 0);
  return diff === 0;
}

const server = createServer((req, res) => {
  void (async () => {
    try {
      const path = (req.url ?? "/").split("?")[0];

      if (req.method === "GET" && path === "/health") {
        return send(res, 200, {
          ok: true,
          browser: browser?.isConnected() ? "up" : "cold",
          active,
          queued: waiting.length,
        });
      }

      if (req.method !== "POST" || path !== "/render") {
        return send(res, 404, { error: "Not found." });
      }

      if (!secretMatches(req.headers.authorization)) {
        return send(res, 401, { error: "Unauthorised." });
      }

      const body = (await readJson(req)) as Partial<RenderRequest>;
      if (typeof body.url !== "string" || body.url.length === 0) {
        return send(res, 400, { error: "url is required." });
      }

      const result = await withSlot(() => render(body as RenderRequest));
      return send(res, 200, result);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ level: "error", msg: "render failed", error: message }));
      // 502, not 500: the failure is almost always the target page, and the
      // caller treats 5xx as retryable.
      return send(res, 502, { error: "Render failed.", detail: message.slice(0, 300) });
    }
  })();
});

server.headersTimeout = 70_000;
server.requestTimeout = 70_000;

server.listen(PORT, () => {
  console.log(JSON.stringify({ level: "info", msg: "renderer listening", port: PORT, concurrency: MAX_CONCURRENCY }));
});

async function shutdown(signal: string) {
  console.log(JSON.stringify({ level: "info", msg: "shutting down", signal }));
  server.close();
  await browser?.close().catch(() => undefined);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
