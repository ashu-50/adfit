import type { CheerioAPI } from "cheerio";
import type { Cta } from "../types";
import { text, absolute, selectorFor } from "./shared";
import { normalizeText, truncate } from "@/lib/utils";

const HERO_SELECTORS = [
  "header + section", "main > section:first-of-type", "main > div:first-of-type",
  "[class*='hero' i]", "[id*='hero' i]", "[data-section='hero']",
  "[class*='banner' i]", "[class*='masthead' i]", "[class*='above-fold' i]",
];

/**
 * Hero detection is a cascade rather than a single selector, because "hero" is
 * a design convention with no markup contract. The H1's own container is the
 * most reliable anchor: whatever wraps the first H1 is, in practice, the hero.
 */
export function detectHero($: CheerioAPI, baseUrl: string, allCtas: Cta[]) {
  const h1 = $("h1").first();
  let container = h1.length > 0 ? h1.closest("section, header, div[class], main") : $();

  if (container.length === 0 || normalizeText(container.text()).length < 40) {
    for (const selector of HERO_SELECTORS) {
      const candidate = $(selector).first();
      if (candidate.length > 0 && normalizeText(candidate.text()).length > 40) {
        container = candidate;
        break;
      }
    }
  }
  if (container.length === 0) container = $("body");

  const headline = normalizeText(h1.text()) || normalizeText(container.find("h1, h2").first().text());

  // The subheadline is the first substantial block after the H1 that is not
  // itself a heading and not a button label.
  let subheadline = "";
  const candidates = container.find("p, h2, [class*='subtitle' i], [class*='subhead' i], [class*='lead' i]");
  candidates.each((_, el) => {
    if (subheadline) return;
    const value = text($, el, 400);
    if (value.length >= 25 && value !== headline && !/^(?:sign up|get started|learn more|book|start)/i.test(value)) {
      subheadline = value;
    }
  });

  // Eyebrows sit above the H1 and are short, often uppercase or pill-styled.
  let eyebrow = "";
  const before = h1.prevAll().slice(0, 3);
  before.each((_, el) => {
    if (eyebrow) return;
    const value = text($, el, 120);
    if (value.length > 0 && value.length <= 60) eyebrow = value;
  });

  const heroImage = container.find("img").filter((_, el) => {
    const src = $(el).attr("src") ?? "";
    return !/(?:logo|icon|avatar|badge|sprite)/i.test(src);
  }).first();

  const containerHtml = $.html(container);
  const heroCtas = allCtas.filter((c) => containerHtml.includes(c.label) && c.label.length > 0).slice(0, 6);

  const backgroundColors = [
    ...new Set(
      (containerHtml.match(/(?:background(?:-color)?|from|to|via)\s*[:-]\s*(#[0-9a-f]{3,8}|rgba?\([^)]+\))/gi) ?? [])
        .map((m) => m.split(/[:\s-]/).pop() ?? "")
        .filter(Boolean),
    ),
  ].slice(0, 6);

  return {
    headline: truncate(headline, 300),
    subheadline: truncate(subheadline, 600),
    eyebrow: truncate(eyebrow, 120),
    text: text($, container.get(0), 2500),
    ctas: heroCtas,
    imageSrc: absolute(heroImage.attr("src") ?? heroImage.attr("data-src"), baseUrl),
    imageAlt: normalizeText(heroImage.attr("alt") ?? "") || null,
    backgroundColors,
    selector: container.get(0) ? selectorFor($, container.get(0)!) : "body",
  };
}
