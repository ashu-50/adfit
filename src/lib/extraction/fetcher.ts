import { assertPublicUrl, isAllowedByRobots } from "./guard";
import type { FetchResult } from "./types";
import { serverEnv } from "@/lib/env";
import { AppError } from "@/lib/http/errors";
import { logger } from "@/lib/logger";

export const USER_AGENT =
  "Mozilla/5.0 (compatible; AdFitBot/1.0; +https://adfit.app/bot) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const STATIC_TIMEOUT_MS = 15_000;

/**
 * Two-strategy fetch.
 *
 * Static first: most landing pages are server-rendered or pre-rendered, and a
 * plain fetch costs ~200ms versus ~4s for a browser. Escalating only when the
 * static HTML is clearly a shell keeps the median analysis fast and the
 * Playwright service small enough to run on one container.
 */
export async function fetchStatic(rawUrl: string, signal?: AbortSignal): Promise<FetchResult> {
  const started = Date.now();
  const url = await assertPublicUrl(rawUrl);

  if (!(await isAllowedByRobots(url, USER_AGENT))) {
    throw new AppError("UNSUPPORTED_URL", "This site's robots.txt asks us not to fetch that page.");
  }

  const timeout = AbortSignal.timeout(STATIC_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let current = url;
  let response: Response | null = null;

  // Manual redirect following so every hop is re-checked against the SSRF guard.
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    response = await fetch(current, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "manual",
      signal: combined,
    }).catch((err: unknown) => {
      throw new AppError("FETCH_FAILED", `We could not reach ${current.hostname}.`, { cause: err });
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) break;

    const location = response.headers.get("location");
    if (!location) break;
    if (hop === MAX_REDIRECTS) throw new AppError("FETCH_FAILED", "That URL redirects too many times.");
    current = await assertPublicUrl(new URL(location, current).toString());
  }

  if (!response) throw new AppError("FETCH_FAILED", "No response from that URL.");

  if (response.status >= 400) {
    throw new AppError("FETCH_FAILED", `That page returned ${response.status}. Check the URL is public and live.`, {
      details: { status: response.status },
      retryable: response.status >= 500,
    });
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("html") && !contentType.includes("xml") && contentType !== "") {
    throw new AppError("UNSUPPORTED_URL", `That URL serves ${contentType.split(";")[0]}, not a web page.`);
  }

  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_HTML_BYTES) {
    throw new AppError("UNSUPPORTED_URL", "That page is too large to analyse.");
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_HTML_BYTES) {
    throw new AppError("UNSUPPORTED_URL", "That page is too large to analyse.");
  }

  const charset = /charset=([\w-]+)/i.exec(contentType)?.[1] ?? "utf-8";
  let html: string;
  try {
    html = new TextDecoder(charset).decode(buffer);
  } catch {
    html = new TextDecoder("utf-8").decode(buffer);
  }

  return {
    html,
    finalUrl: current.toString(),
    status: response.status,
    strategy: "STATIC",
    durationMs: Date.now() - started,
  };
}

/**
 * Decides whether the static HTML is worth analysing or is an empty SPA shell.
 * Returns a human-readable reason so the diagnostics panel can explain the
 * extra latency to the user.
 */
export function needsHeadless(html: string): { escalate: boolean; reason: string | null } {
  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  const body = bodyMatch?.[1] ?? html;
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < 400) return { escalate: true, reason: "The HTML contained almost no text." };
  if (/<div[^>]+id=["'](root|app|__next|__nuxt)["'][^>]*>\s*<\/div>/i.test(body)) {
    return { escalate: true, reason: "The page renders its content with JavaScript." };
  }
  if (!/<h1[\s>]/i.test(body) && text.length < 1500) {
    return { escalate: true, reason: "No headline was present in the server response." };
  }
  const noscriptOnly = /<noscript>/i.test(body) && text.length < 800;
  if (noscriptOnly) return { escalate: true, reason: "The page requires JavaScript." };

  return { escalate: false, reason: null };
}

/**
 * Playwright lives in services/renderer, not in this process. Chromium does not
 * fit in a Vercel function and a cold browser launch per request would dominate
 * latency, so rendering is a separate long-lived container the app calls over
 * HTTP. When RENDERER_URL is unset the pipeline degrades to static-only rather
 * than failing, which keeps local development and the free tier workable.
 */
export async function fetchRendered(rawUrl: string, signal?: AbortSignal): Promise<FetchResult> {
  const env = serverEnv();
  const started = Date.now();

  if (!env.RENDERER_URL) {
    throw new AppError("RENDER_FAILED", "This page needs a browser to render and the renderer is not configured.");
  }

  await assertPublicUrl(rawUrl);

  const timeout = AbortSignal.timeout(env.RENDERER_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const res = await fetch(`${env.RENDERER_URL.replace(/\/$/, "")}/render`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.RENDERER_SECRET ?? ""}`,
    },
    body: JSON.stringify({ url: rawUrl, screenshot: true, waitUntil: "networkidle", timeoutMs: env.RENDERER_TIMEOUT_MS - 5000 }),
    signal: combined,
  }).catch((err: unknown) => {
    throw new AppError("RENDER_FAILED", "The page renderer did not respond.", { cause: err, retryable: true });
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    logger.warn("renderer returned an error", { status: res.status, detail: detail.slice(0, 300) });
    throw new AppError("RENDER_FAILED", "We could not render that page in a browser.", { retryable: res.status >= 500 });
  }

  const payload = (await res.json()) as { html: string; finalUrl: string; status: number; screenshotBase64?: string };

  return {
    html: payload.html,
    finalUrl: payload.finalUrl,
    status: payload.status,
    strategy: "HEADLESS",
    durationMs: Date.now() - started,
    screenshotBase64: payload.screenshotBase64,
  };
}
