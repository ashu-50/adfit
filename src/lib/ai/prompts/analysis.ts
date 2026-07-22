import { DIMENSIONS, DIMENSION_QUESTIONS, type ParsedAd } from "@/types/domain";
import type { ExtractedPage } from "@/lib/extraction/types";
import { truncate } from "@/lib/utils";

/**
 * Budget-aware prompt assembly. Landing pages routinely produce 40k+ characters
 * of readable text; sending all of it triples cost for no accuracy gain, because
 * message match is decided above the fold. So the prompt is built in priority
 * order and each section is capped:
 *   above-the-fold and CTAs  -> generous budget, they carry the verdict
 *   proof and objections     -> medium, they are enumerable
 *   body copy                -> whatever budget remains
 */
const BUDGET = {
  adText: 2200,
  hero: 1500,
  headings: 1800,
  ctas: 900,
  proof: 1800,
  pricing: 900,
  faq: 1400,
  body: 6000,
} as const;

function list(items: readonly string[], max: number, cap: number): string {
  if (items.length === 0) return "(none found)";
  return items.slice(0, max).map((i) => `- ${truncate(i, cap)}`).join("\n");
}

export function buildAdBlock(ads: ParsedAd[]): string {
  return ads
    .map((ad, i) => {
      const lines = [
        `### Ad ${i + 1} (angle: ${ad.angle})`,
        ad.brandName && `Brand: ${ad.brandName}`,
        `Headline: ${ad.headline || "(none)"}`,
        ad.primaryText && `Body: ${truncate(ad.primaryText, BUDGET.adText)}`,
        ad.description && `Description: ${truncate(ad.description, 400)}`,
        `CTA button: ${ad.ctaLabel || "(none)"}`,
        `Offer: ${ad.offer || "(none stated)"}`,
        `Product is presented as: ${ad.productClaim || "(unclear)"}`,
        ad.personaSignals.length > 0 && `Audience signals: ${ad.personaSignals.join(", ")}`,
        ad.urgencyCues.length > 0 && `Urgency: ${ad.urgencyCues.join(", ")}`,
        ad.dominantColors.length > 0 && `Palette: ${ad.dominantColors.join(", ")}`,
        ad.visualNotes && `Visual: ${truncate(ad.visualNotes, 500)}`,
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n\n");
}

export function buildPageBlock(page: ExtractedPage): string {
  const sections = [
    `URL: ${page.finalUrl}`,
    `Title: ${page.meta.title || "(none)"}`,
    page.meta.description && `Meta description: ${truncate(page.meta.description, 400)}`,
    "",
    "## Above the fold",
    `H1: ${page.hero.headline || "(no H1 found)"}`,
    page.hero.subheadline && `Sub: ${truncate(page.hero.subheadline, 500)}`,
    page.hero.eyebrow && `Eyebrow: ${page.hero.eyebrow}`,
    page.hero.text && `Hero copy: ${truncate(page.hero.text, BUDGET.hero)}`,
    `Hero CTAs: ${page.hero.ctas.length > 0 ? page.hero.ctas.map((c) => `"${c.label}"`).join(", ") : "(none in the first screen)"}`,
    page.hero.imageAlt && `Hero image alt: ${truncate(page.hero.imageAlt, 200)}`,
    "",
    "## All calls to action",
    list(page.ctas.map((c) => `"${c.label}"${c.href ? ` -> ${truncate(c.href, 80)}` : ""}${c.isPrimary ? " [primary]" : ""}`), 14, 140),
    "",
    "## Headings in order",
    list(page.headings.map((h) => `${h.level.toUpperCase()}: ${h.text}`), 25, BUDGET.headings / 25),
    "",
    "## Proof found on page",
    `Testimonials (${page.proof.testimonials.length}):`,
    list(page.proof.testimonials.map((t) => `${t.quote}${t.author ? ` — ${t.author}` : ""}`), 6, 300),
    `Logos (${page.proof.logos.length}): ${page.proof.logos.slice(0, 12).join(", ") || "(none)"}`,
    `Metrics: ${page.proof.metrics.slice(0, 8).join(" | ") || "(none)"}`,
    `Trust badges: ${page.proof.trustBadges.slice(0, 10).join(", ") || "(none)"}`,
    `Ratings: ${page.proof.ratings.slice(0, 4).join(", ") || "(none)"}`,
    "",
    "## Pricing",
    page.pricing.present
      ? list(page.pricing.plans.map((p) => `${p.name}: ${p.price}${p.period ? `/${p.period}` : ""}${p.highlight ? " [featured]" : ""}`), 6, BUDGET.pricing / 6)
      : "(no pricing on the page)",
    page.pricing.freeTrial ? `Free trial mentioned: ${page.pricing.freeTrial}` : "",
    page.pricing.guarantee ? `Guarantee: ${page.pricing.guarantee}` : "",
    "",
    "## FAQ",
    list(page.faq.map((f) => `Q: ${f.question} A: ${truncate(f.answer, 200)}`), 8, BUDGET.faq / 8),
    "",
    "## Forms",
    page.forms.length > 0
      ? list(page.forms.map((f) => `${f.fieldCount} fields (${f.fields.join(", ")})${f.submitLabel ? ` submit: "${f.submitLabel}"` : ""}`), 4, 200)
      : "(no forms found)",
    "",
    "## Navigation",
    page.navigation.slice(0, 12).join(" | ") || "(none)",
    "",
    "## Body copy",
    truncate(page.readableText, BUDGET.body),
  ];

  // Conditional entries collapse to null when their field is absent; the bare
  // "" entries are deliberate blank lines between sections and are kept, since
  // the whole point of this layout is that the model can see where each
  // section starts.
  return sections.filter((s): s is string => typeof s === "string").join("\n");
}

export function buildAnalysisPrompt(args: {
  ads: ParsedAd[];
  page: ExtractedPage;
  hasScreenshots: boolean;
}): string {
  const dimensionBrief = DIMENSIONS.map((d, i) => `${i + 1}. ${d} — ${DIMENSION_QUESTIONS[d]}`).join("\n");

  const visualNote = args.hasScreenshots
    ? "Screenshots were supplied, so VISUAL_CONTINUITY is in scope: compare palette, brand marks, imagery style and layout density between creative and page."
    : "No screenshots were supplied. Set VISUAL_CONTINUITY applicable=false, score 0 and confidence 0. It will be excluded from the weighted total rather than counted as a failure.";

  return `# The ads

${buildAdBlock(args.ads)}

# The landing page they point to

${buildPageBlock(args.page)}

# Your task

Score all nine dimensions. Return one entry per dimension, in this order:

${dimensionBrief}

${visualNote}

For each dimension: give a score, a confidence, a two-sentence summary, every problem you can evidence, and recommendations that name the exact change. A clean dimension gets an empty problems array — do not manufacture issues to look thorough.

Then write:
- summary: three sentences a marketer pastes into Slack.
- verdict: one sentence naming the single highest-leverage change.
- strengths and weaknesses: up to five each, concrete and evidenced.
- rewrites: replacement headlines, subheadlines, CTA labels and hero angles that would close the gaps you found. Write them in the brand's existing voice, matching the ad's promise.`;
}

export function buildAdParsePrompt(source: { text: string; label?: string; fromImage: boolean }): string {
  const origin = source.fromImage
    ? "The following text was transcribed from an ad screenshot. Layout cues are lost, so infer field boundaries from wording and order."
    : "The following is ad copy pasted by a marketer.";
  return `${origin}${source.label ? `\nLabel given by the marketer: ${source.label}` : ""}

---
${truncate(source.text, 6000)}
---

Extract the structured fields.`;
}

export function buildClusterPrompt(ads: ParsedAd[], pageUrl: string): string {
  return `Landing page currently in use: ${pageUrl}

# Ads to group

${buildAdBlock(ads)}

# Your task

Group these ${ads.length} ads by persuasion angle. Reference each ad by its zero-based index (Ad 1 is index 0). Every ad must appear in exactly one cluster.

For each cluster, design the landing page that group of ads deserves: hero concept, H1, subheadline, 3-5 benefit bullets, 2-3 testimonial themes to source, 3-5 FAQ entries answering that angle's specific objections, and a CTA label matching what those ads ask for.`;
}
