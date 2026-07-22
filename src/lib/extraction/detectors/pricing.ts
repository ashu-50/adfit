import type { CheerioAPI } from "cheerio";
import type { PricingPlan } from "../types";
import { text, uniqueBy } from "./shared";
import { normalizeText } from "@/lib/utils";

const PRICE_PATTERN = /(?:[$£€₹¥]|USD|EUR|GBP|INR)\s?\d[\d,]*(?:\.\d{2})?|\b\d+\s?(?:USD|EUR|GBP|INR)\b|\bfree\b/i;
const PERIOD_PATTERN = /\/\s?(mo|month|monthly|yr|year|annually|user|seat|week)\b|\bper\s+(month|year|user|seat|week)\b/i;
const HIGHLIGHT_HINT = /popular|recommended|best value|featured|highlight|most-|ring-2|border-primary|scale-1/i;
const TRIAL_PATTERN = /\b(\d+)[- ]day (?:free )?trial\b|\bfree trial\b|\bstart (?:your )?free trial\b|\btry (?:it )?free\b/i;
const GUARANTEE_PATTERN = /\b(\d+)[- ]day (?:money[- ]back|refund)\b|\bmoney[- ]back guarantee\b|\bsatisfaction guarantee\b|\brisk[- ]free\b/i;

/**
 * Pricing is detected from the card up: find elements containing a currency
 * figure, then walk to the nearest container that also holds a plan name.
 * Cheaper and far more robust than trying to recognise pricing-table layouts.
 */
export function detectPricing($: CheerioAPI) {
  const plans: PricingPlan[] = [];
  const body = normalizeText($("body").text());

  const priceNodes = $("*").filter((_, el) => {
    const node = $(el);
    if (node.children().length > 3) return false;
    const value = normalizeText(node.text());
    return value.length < 40 && PRICE_PATTERN.test(value);
  });

  priceNodes.each((_, el) => {
    if (plans.length >= 8) return;
    const price = normalizeText($(el).text());
    const card = $(el).closest("[class*='card' i], [class*='plan' i], [class*='tier' i], [class*='price' i], li, article, section, div").first();
    if (card.length === 0) return;

    const name =
      normalizeText(card.find("h2, h3, h4, [class*='name' i], [class*='title' i]").first().text()) ||
      normalizeText(card.prevAll("h2, h3").first().text());
    if (!name || name.length > 60) return;

    const cardText = text($, card.get(0), 1200);
    const period = PERIOD_PATTERN.exec(cardText)?.[0]?.replace(/^\/\s?/, "") ?? null;

    const features: string[] = [];
    card.find("li").each((_, li) => {
      const value = text($, li, 160);
      if (value && value.length > 3 && features.length < 10) features.push(value);
    });

    plans.push({
      name,
      price,
      period,
      highlight: HIGHLIGHT_HINT.test(card.attr("class") ?? "") || /most popular|recommended/i.test(cardText),
      features,
    });
  });

  const deduped = uniqueBy(plans, (p) => `${p.name}|${p.price}`);
  const currencySymbols = [...new Set((body.match(/[$£€₹¥]/g) ?? []))].slice(0, 4);

  return {
    present: deduped.length > 0 || /\bpricing\b/i.test(normalizeText($("h1, h2, h3, nav").text())),
    plans: deduped.slice(0, 6),
    freeTrial: TRIAL_PATTERN.exec(body)?.[0] ?? null,
    guarantee: GUARANTEE_PATTERN.exec(body)?.[0] ?? null,
    currencySymbols,
  };
}
