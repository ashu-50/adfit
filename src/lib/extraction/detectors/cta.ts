import type { CheerioAPI } from "cheerio";
import type { Cta } from "../types";
import { absolute, selectorFor, uniqueBy } from "./shared";
import { normalizeText } from "@/lib/utils";

const ACTION_WORDS =
  /\b(?:start|get|try|book|buy|sign\s?up|signup|join|request|schedule|demo|download|subscribe|claim|shop|order|contact|talk|call|apply|register|create|launch|upgrade|add to (?:cart|bag)|checkout|free trial|see plans|view pricing|learn more)\b/i;

const NAV_NOISE =
  /^(?:home|about|blog|careers|login|log in|sign in|privacy|terms|cookies?|docs|documentation|support|help|menu|search|close|skip to content|english|back)$/i;

const PRIMARY_HINTS = /\b(?:btn-primary|primary|cta|button--primary|bg-(?:primary|indigo|blue|black|green)|hero-cta)\b/i;

/**
 * CTA detection scores candidates rather than pattern-matching classes,
 * because Tailwind-era markup has no semantic button class to look for.
 * Signals: element type, action verb, position, styling hints, prominence.
 */
export function detectCtas($: CheerioAPI, baseUrl: string): Cta[] {
  const candidates: (Cta & { score: number })[] = [];
  let domIndex = 0;

  $("a, button, input[type='submit'], [role='button']").each((_, el) => {
    domIndex++;
    const node = $(el);
    const tag = (node.prop("tagName") ?? "").toLowerCase();

    const label = normalizeText(
      tag === "input" ? (node.attr("value") ?? "") : node.text() || node.attr("aria-label") || node.attr("title") || "",
    );
    if (!label || label.length > 60 || label.length < 2) return;
    if (NAV_NOISE.test(label)) return;
    if (node.closest("footer, nav[aria-label*='footer' i]").length > 0) return;

    const className = node.attr("class") ?? "";
    const inNav = node.closest("nav, header").length > 0;

    let score = 0;
    if (ACTION_WORDS.test(label)) score += 40;
    if (tag === "button" || tag === "input") score += 20;
    if (PRIMARY_HINTS.test(className)) score += 25;
    if (/\b(?:rounded|px-|py-|btn|button)\b/.test(className)) score += 10;
    if (domIndex <= 15) score += 15;
    if (inNav) score -= 10;
    if (label.split(/\s+/).length <= 4) score += 10;

    if (score < 30) return;

    candidates.push({
      label,
      href: absolute(node.attr("href") ?? node.attr("formaction"), baseUrl),
      isPrimary: false,
      domIndex,
      selector: selectorFor($, el),
      kind: tag === "a" ? "link" : tag === "input" ? "submit" : "button",
      score,
    });
  });

  const ranked = uniqueBy(candidates, (c) => c.label).sort((a, b) => b.score - a.score || a.domIndex - b.domIndex);

  // The primary CTA is the highest-scoring one, and any repeat of that exact
  // label elsewhere on the page is also primary — repetition is the signal.
  const topLabel = ranked[0]?.label.toLowerCase();
  return ranked
    .slice(0, 20)
    .map(({ score: _score, ...cta }) => ({ ...cta, isPrimary: cta.label.toLowerCase() === topLabel }))
    .sort((a, b) => a.domIndex - b.domIndex);
}
