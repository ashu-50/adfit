import * as cheerio from "cheerio";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { ExtractedPage, FetchResult, Heading } from "./types";
import { fetchStatic, fetchRendered, needsHeadless } from "./fetcher";
import { detectHero } from "./detectors/hero";
import { detectCtas } from "./detectors/cta";
import { detectProof } from "./detectors/proof";
import { detectPricing } from "./detectors/pricing";
import { detectFaq, detectForms, detectProductSections, detectNavigation } from "./detectors/faq";
import { NOISE_SELECTOR, absolute } from "./detectors/shared";
import { normalizeText, sha256, truncate } from "@/lib/utils";
import { cached } from "@/lib/cache/store";
import { serverEnv } from "@/lib/env";
import { AppError } from "@/lib/http/errors";
import { logger } from "@/lib/logger";

export type ExtractOptions = {
  /** Skip both the fetch cache and the parsed-page cache. */
  forceRefresh?: boolean;
  /** Force the browser path even when the static HTML looks complete. */
  forceHeadless?: boolean;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

export type ExtractionOutcome = {
  page: ExtractedPage;
  screenshotBase64?: string;
  cacheHit: boolean;
};

function extractMeta($: cheerio.CheerioAPI, baseUrl: string) {
  const meta = (name: string) =>
    $(`meta[property='${name}'], meta[name='${name}']`).attr("content")?.trim() || null;

  return {
    title: normalizeText($("title").first().text() || meta("og:title") || ""),
    description: normalizeText($("meta[name='description']").attr("content") || meta("og:description") || ""),
    lang: $("html").attr("lang")?.trim() || null,
    canonical: absolute($("link[rel='canonical']").attr("href"), baseUrl),
    favicon: absolute($("link[rel~='icon']").first().attr("href") ?? "/favicon.ico", baseUrl),
    ogTitle: meta("og:title"),
    ogDescription: meta("og:description"),
    ogImage: absolute(meta("og:image") ?? undefined, baseUrl),
    twitterCard: meta("twitter:card"),
    themeColor: meta("theme-color"),
    robots: meta("robots"),
  };
}

function extractHeadings($: cheerio.CheerioAPI): Heading[] {
  const headings: Heading[] = [];
  let index = 0;
  $("h1, h2, h3").each((_, el) => {
    index++;
    const level = ($(el).prop("tagName") ?? "h2").toLowerCase() as Heading["level"];
    const text = normalizeText($(el).text());
    if (text && text.length <= 300 && headings.length < 60) headings.push({ level, text, domIndex: index });
  });
  return headings;
}

/**
 * Readability gives clean article text but strips exactly the parts a CRO audit
 * needs (nav, buttons, pricing tables). So it is used only for the body-copy
 * field, while the structural detectors run against the full DOM. When
 * Readability bails — common on landing pages, which are not articles — we fall
 * back to a de-noised text dump.
 */
function extractReadableText(html: string, url: string, $: cheerio.CheerioAPI): string {
  try {
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("error", () => {});
    virtualConsole.on("jsdomError", () => {});

    const dom = new JSDOM(html, { url, virtualConsole });
    const article = new Readability(dom.window.document, { charThreshold: 200 }).parse();
    const text = normalizeText(article?.textContent ?? "");
    if (text.length > 300) return text;
  } catch (err) {
    logger.debug("readability failed, using fallback text", { err: String(err) });
  }

  const body = $("body").clone();
  body.find(NOISE_SELECTOR).remove();
  body.find("nav, footer, header").remove();
  return normalizeText(body.text());
}

async function parseHtml(fetched: FetchResult, requestedUrl: string, escalationReason: string | null): Promise<ExtractedPage> {
  const $ = cheerio.load(fetched.html);
  const baseUrl = fetched.finalUrl;

  const meta = extractMeta($, baseUrl);
  const ctas = detectCtas($, baseUrl);
  const hero = detectHero($, baseUrl, ctas);
  const readableText = extractReadableText(fetched.html, baseUrl, $);

  const images: { src: string; alt: string }[] = [];
  $("img").each((_, el) => {
    if (images.length >= 30) return;
    const src = absolute($(el).attr("src") ?? $(el).attr("data-src"), baseUrl);
    if (src && !src.startsWith("data:")) images.push({ src, alt: normalizeText($(el).attr("alt") ?? "") });
  });

  const page: ExtractedPage = {
    url: requestedUrl,
    finalUrl: fetched.finalUrl,
    httpStatus: fetched.status,
    strategy: fetched.strategy,
    fetchDurationMs: fetched.durationMs,
    contentHash: await sha256(fetched.html.slice(0, 200_000)),
    meta,
    hero: {
      headline: hero.headline,
      subheadline: hero.subheadline,
      eyebrow: hero.eyebrow,
      text: hero.text,
      ctas: hero.ctas,
      imageSrc: hero.imageSrc,
      imageAlt: hero.imageAlt,
      backgroundColors: hero.backgroundColors,
    },
    headings: extractHeadings($),
    ctas,
    navigation: detectNavigation($),
    proof: detectProof($, baseUrl),
    pricing: detectPricing($),
    faq: detectFaq($),
    forms: detectForms($),
    productSections: detectProductSections($),
    images,
    readableText: truncate(readableText, 60_000),
    wordCount: readableText.split(/\s+/).filter(Boolean).length,
    diagnostics: {
      escalated: fetched.strategy === "HEADLESS",
      escalationReason,
      htmlBytes: fetched.html.length,
      scriptCount: $("script").length,
      blockedByRobots: false,
    },
  };

  if (page.wordCount < 30 && page.headings.length === 0 && page.ctas.length === 0) {
    throw new AppError(
      "EXTRACTION_EMPTY",
      "We reached that page but found no readable content. It may be behind a login, a consent wall, or bot protection.",
    );
  }

  return page;
}

/**
 * Entry point for the extraction stage.
 *
 * Order matters: cache -> static fetch -> escalation decision -> browser render.
 * The cache key is the URL alone (not the HTML), because two runs against the
 * same URL within the TTL should not both pay for a render. `forceRefresh`
 * exists for the "I just shipped a fix, re-check it" case.
 */
export async function extractLandingPage(url: string, opts: ExtractOptions = {}): Promise<ExtractionOutcome> {
  const env = serverEnv();

  const { value, hit } = await cached(
    "extraction",
    [url, opts.forceHeadless ?? false],
    env.CACHE_TTL_EXTRACTION_S,
    async () => {
      opts.onProgress?.("Fetching the page");

      let fetched: FetchResult;
      let escalationReason: string | null = null;

      if (opts.forceHeadless) {
        escalationReason = "Requested explicitly.";
        fetched = await fetchRendered(url, opts.signal);
      } else {
        fetched = await fetchStatic(url, opts.signal);
        const decision = needsHeadless(fetched.html);

        if (decision.escalate) {
          escalationReason = decision.reason;
          opts.onProgress?.("This page renders with JavaScript, opening a browser");
          try {
            fetched = await fetchRendered(url, opts.signal);
          } catch (err) {
            // Degrade rather than fail: a thin static parse still produces a
            // report, with the caveat surfaced in diagnostics.
            logger.warn("headless escalation failed, keeping static result", { url, err: String(err) });
            escalationReason = `${decision.reason} Browser rendering was unavailable, so results may be incomplete.`;
          }
        }
      }

      opts.onProgress?.("Reading the page structure");
      const page = await parseHtml(fetched, url, escalationReason);

      return { page, screenshotBase64: fetched.screenshotBase64 };
    },
    { skip: opts.forceRefresh },
  );

  return { page: hit ? { ...value.page, strategy: "CACHED" } : value.page, screenshotBase64: value.screenshotBase64, cacheHit: hit };
}

export type { ExtractedPage } from "./types";
