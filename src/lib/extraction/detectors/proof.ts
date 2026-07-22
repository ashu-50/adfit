import type { CheerioAPI } from "cheerio";
import type { Testimonial } from "../types";
import { text, selectorFor, uniqueBy, absolute } from "./shared";
import { normalizeText, truncate } from "@/lib/utils";

const TESTIMONIAL_HINT = /testimonial|review|quote|customer[-_ ]?stor|case[-_ ]?stud|praise|what.*(?:say|clients)/i;
const AUTHOR_HINT = /author|name|cite|byline|customer|person|role|title|position|company/i;

const TRUST_BADGE_PATTERNS: [RegExp, string][] = [
  [/\bSOC\s?2\b/i, "SOC 2"],
  [/\bISO\s?27001\b/i, "ISO 27001"],
  [/\bGDPR\b/i, "GDPR"],
  [/\bHIPAA\b/i, "HIPAA"],
  [/\bPCI[- ]?DSS\b/i, "PCI DSS"],
  [/\bCCPA\b/i, "CCPA"],
  [/\bSSL\b|\bsecure checkout\b/i, "Secure checkout"],
  [/money[- ]back guarantee/i, "Money-back guarantee"],
  [/\b\d+[- ]day (?:money[- ]back|refund|guarantee)/i, "Refund window"],
  [/\bno credit card required\b/i, "No credit card required"],
  [/\bcancel any ?time\b/i, "Cancel anytime"],
  [/\bfree (?:shipping|returns)\b/i, "Free shipping or returns"],
  [/\bencrypt(?:ed|ion)\b/i, "Encryption"],
  [/\btrusted by\b/i, "Trusted-by claim"],
  [/\b(?:norton|mcafee|trustpilot|verisign|bbb accredited)\b/i, "Third-party seal"],
];

const METRIC_PATTERN =
  /\b(?:\d[\d,.]*\s?(?:k|m|bn|b|million|billion|thousand)?\+?\s?(?:customers|users|companies|teams|businesses|downloads|installs|reviews|hours saved|leads|sites|brands)|\d{1,3}(?:\.\d)?%\s+(?:more|less|faster|increase|growth|higher|lower|reduction|uplift|conversion)|\d+x\s+(?:faster|more|roi|growth|return))\b/gi;

const RATING_PATTERN = /\b([0-5](?:\.\d)?)\s*(?:\/\s*5|out of 5|stars?)\b/gi;

export function detectProof($: CheerioAPI, baseUrl: string) {
  const testimonials: Testimonial[] = [];

  const containers = $("blockquote, figure, [class*='testimonial' i], [class*='review' i], [class*='quote' i], [data-testimonial]");
  containers.each((_, el) => {
    if (testimonials.length >= 12) return;
    const node = $(el);
    if (node.parents("[class*='testimonial' i], blockquote").length > 0) return;

    const quoteEl = node.find("blockquote, p, [class*='quote' i]").first();
    const quote = normalizeText(quoteEl.length > 0 ? text($, quoteEl.get(0), 800) : text($, el, 800));
    if (quote.length < 30 || quote.length > 900) return;

    let author: string | null = null;
    let role: string | null = null;
    node.find("cite, figcaption, footer, [class*='author' i], [class*='name' i], [class*='role' i], [class*='title' i]").each((_, a) => {
      const value = text($, a, 160);
      if (!value || value === quote) return;
      const className = $(a).attr("class") ?? "";
      if (!author && AUTHOR_HINT.test(className + " " + ($(a).prop("tagName") ?? ""))) author = value;
      else if (!role) role = value;
    });

    testimonials.push({ quote: truncate(quote, 700), author, role, selector: selectorFor($, el) });
  });

  // Sections whose heading advertises social proof; catches carousels that use
  // no semantic markup at all.
  if (testimonials.length === 0) {
    $("section, div").each((_, el) => {
      if (testimonials.length >= 6) return;
      const heading = normalizeText($(el).find("h2, h3").first().text());
      if (!heading || !TESTIMONIAL_HINT.test(heading)) return;
      $(el).find("p").each((_, p) => {
        if (testimonials.length >= 6) return;
        const quote = text($, p, 600);
        if (quote.length >= 60 && quote.length <= 600) {
          testimonials.push({ quote, author: null, role: null, selector: selectorFor($, p) });
        }
      });
    });
  }

  const logos: string[] = [];
  $("img, [class*='logo' i] img, [class*='client' i] img, [class*='partner' i] img").each((_, el) => {
    const alt = normalizeText($(el).attr("alt") ?? "");
    const src = $(el).attr("src") ?? "";
    const isLogoish = /logo|client|partner|brand|customer/i.test(src + " " + ($(el).attr("class") ?? ""));
    if (alt && alt.length <= 40 && (isLogoish || /logo/i.test(alt))) logos.push(alt.replace(/\s*logo\s*/i, "").trim());
  });

  const body = normalizeText($("body").text());

  const metrics = [...new Set((body.match(METRIC_PATTERN) ?? []).map((m) => m.trim()))].slice(0, 12);

  const trustBadges: string[] = [];
  for (const [pattern, label] of TRUST_BADGE_PATTERNS) {
    if (pattern.test(body)) trustBadges.push(label);
  }

  const ratings = [...new Set([...body.matchAll(RATING_PATTERN)].map((m) => m[0].trim()))].slice(0, 6);

  const caseStudyLinks: string[] = [];
  $("a").each((_, el) => {
    const label = normalizeText($(el).text());
    if (/case stud|success stor|customer stor/i.test(label)) {
      const href = absolute($(el).attr("href"), baseUrl);
      if (href) caseStudyLinks.push(href);
    }
  });

  return {
    testimonials: uniqueBy(testimonials, (t) => t.quote.slice(0, 80)).slice(0, 10),
    logos: [...new Set(logos.filter((l) => l.length > 1))].slice(0, 24),
    metrics,
    trustBadges: [...new Set(trustBadges)],
    ratings,
    caseStudyLinks: [...new Set(caseStudyLinks)].slice(0, 8),
  };
}
