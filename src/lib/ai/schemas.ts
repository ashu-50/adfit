import { Type, type Schema } from "@google/genai";
import { z } from "zod";
import { AD_ANGLES, DIMENSIONS } from "@/types/domain";

/**
 * Every model call is constrained twice:
 *   1. `responseSchema` — Gemini's OpenAPI subset, enforced during decoding.
 *   2. The matching Zod schema — enforced after parsing, because the API
 *      guarantees shape but not semantics (ranges, enum drift, empty strings).
 *
 * The pairs live side by side so they cannot silently diverge. Gemini's subset
 * has no unions, no `additionalProperties` and no `minimum`/`maximum`, which is
 * exactly the gap the Zod half closes.
 */

const str = (description: string): Schema => ({ type: Type.STRING, description });
const strArr = (description: string): Schema => ({ type: Type.ARRAY, description, items: { type: Type.STRING } });
const int = (description: string): Schema => ({ type: Type.INTEGER, description });

// ---------------------------------------------------------------- ad parsing

export const adAngleEnum = z.enum(AD_ANGLES);

export const geminiAdSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    headline: str("The largest, most prominent line of the ad. Empty string if none."),
    primaryText: str("Body copy above or below the creative."),
    description: str("Link description or secondary line. Empty string if none."),
    ctaLabel: str("Exact text on the call-to-action button, verbatim."),
    offer: str("The concrete offer: percentage off, free trial length, demo, guarantee. Empty string if none."),
    personaSignals: strArr("Phrases naming or implying who this is for: job titles, industries, company sizes, life stages."),
    productClaim: str("What the ad says the product IS, in the ad's own vocabulary."),
    urgencyCues: strArr("Deadlines, scarcity, countdowns. Empty array if none."),
    brandName: str("Advertiser name if visible."),
    dominantColors: strArr("Up to 4 hex colours sampled from the creative. Empty array for text-only ads."),
    visualNotes: str("Layout, imagery and typography in one or two sentences. Empty string for text-only ads."),
    angle: { type: Type.STRING, format: "enum", enum: [...AD_ANGLES], description: "The dominant persuasion angle." },
  },
  required: [
    "headline", "primaryText", "description", "ctaLabel", "offer", "personaSignals",
    "productClaim", "urgencyCues", "brandName", "dominantColors", "visualNotes", "angle",
  ],
  propertyOrdering: [
    "headline", "primaryText", "description", "ctaLabel", "offer", "personaSignals",
    "productClaim", "urgencyCues", "brandName", "dominantColors", "visualNotes", "angle",
  ],
};

export const parsedAdSchema = z.object({
  headline: z.string().max(500).default(""),
  primaryText: z.string().max(4000).default(""),
  description: z.string().max(2000).default(""),
  ctaLabel: z.string().max(120).default(""),
  offer: z.string().max(500).default(""),
  personaSignals: z.array(z.string().max(200)).max(15).default([]),
  productClaim: z.string().max(500).default(""),
  urgencyCues: z.array(z.string().max(200)).max(10).default([]),
  brandName: z.string().max(120).default(""),
  dominantColors: z.array(z.string().max(24)).max(6).default([]),
  visualNotes: z.string().max(1000).default(""),
  angle: adAngleEnum.catch("UNKNOWN"),
});

// ---------------------------------------------------------------- OCR

export const geminiOcrSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    text: str("Every readable word in the image, in reading order, newline separated. Do not paraphrase."),
    confidence: int("0-100. How legible the image was."),
    isAdvertisement: { type: Type.BOOLEAN, description: "True if the image is an ad creative rather than an unrelated screenshot." },
  },
  required: ["text", "confidence", "isAdvertisement"],
  propertyOrdering: ["text", "confidence", "isAdvertisement"],
};

export const ocrResultSchema = z.object({
  text: z.string().max(20_000).default(""),
  confidence: z.number().min(0).max(100).catch(50),
  isAdvertisement: z.boolean().catch(true),
});

// ---------------------------------------------------------------- dimensions

const evidenceSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    adQuote: str("Verbatim fragment from the ad, under 20 words. Empty string if not applicable."),
    pageQuote: str("Verbatim fragment from the landing page, under 20 words. Empty string if not applicable."),
    selector: str("CSS selector or section name where the page fragment appeared. Empty string if unknown."),
  },
  required: ["adQuote", "pageQuote", "selector"],
  propertyOrdering: ["adQuote", "pageQuote", "selector"],
};

const problemSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    severity: { type: Type.STRING, format: "enum", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
    title: str("One line naming the problem. No hedging."),
    detail: str("Two or three sentences: what is wrong and what it costs the visitor."),
    evidence: evidenceSchema,
  },
  required: ["severity", "title", "detail", "evidence"],
  propertyOrdering: ["severity", "title", "detail", "evidence"],
};

const recommendationSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    priority: { type: Type.STRING, format: "enum", enum: ["HIGH", "MEDIUM", "LOW"] },
    effort: { type: Type.STRING, format: "enum", enum: ["TRIVIAL", "SMALL", "MEDIUM", "LARGE"] },
    impact: int("1-10. Expected conversion impact if shipped."),
    title: str("Imperative sentence: the change to make."),
    detail: str("Why it works, in two sentences."),
    example: str("Ready-to-paste copy or markup. Empty string if not applicable."),
  },
  required: ["priority", "effort", "impact", "title", "detail", "example"],
  propertyOrdering: ["priority", "effort", "impact", "title", "detail", "example"],
};

const dimensionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    dimension: { type: Type.STRING, format: "enum", enum: [...DIMENSIONS] },
    score: int("0-100. 0 = total mismatch, 100 = seamless continuation."),
    confidence: int("0-100. Lower it when the page content was thin or ambiguous."),
    applicable: { type: Type.BOOLEAN, description: "False only when the inputs cannot support a judgement, e.g. visual continuity with no screenshots." },
    summary: str("Two sentences. State the finding, not the method."),
    problems: { type: Type.ARRAY, items: problemSchema, description: "Empty array if the dimension is clean." },
    recommendations: { type: Type.ARRAY, items: recommendationSchema },
  },
  required: ["dimension", "score", "confidence", "applicable", "summary", "problems", "recommendations"],
  propertyOrdering: ["dimension", "score", "confidence", "applicable", "summary", "problems", "recommendations"],
};

export const geminiAnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: str("Three sentences a marketer could paste into Slack."),
    verdict: str("One sentence. The single most important thing to fix or keep."),
    strengths: strArr("Up to 5. Concrete, evidence-backed."),
    weaknesses: strArr("Up to 5. Concrete, evidence-backed."),
    dimensions: {
      type: Type.ARRAY,
      description: "Exactly one entry per dimension, in the order given.",
      items: dimensionSchema,
    },
    rewrites: {
      type: Type.OBJECT,
      properties: {
        headline: strArr("2-3 replacement H1s that continue the ad's promise."),
        subheadline: strArr("2-3 replacement subheads."),
        cta: strArr("2-3 replacement button labels matching the ad's ask."),
        heroAngle: strArr("1-2 alternative hero concepts."),
      },
      required: ["headline", "subheadline", "cta", "heroAngle"],
      propertyOrdering: ["headline", "subheadline", "cta", "heroAngle"],
    },
  },
  required: ["summary", "verdict", "strengths", "weaknesses", "dimensions", "rewrites"],
  propertyOrdering: ["summary", "verdict", "strengths", "weaknesses", "dimensions", "rewrites"],
};

const zEvidence = z.object({
  adQuote: z.string().max(400).default(""),
  pageQuote: z.string().max(400).default(""),
  selector: z.string().max(200).default(""),
});

const zProblem = z.object({
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).catch("MEDIUM"),
  title: z.string().min(1).max(200),
  detail: z.string().max(1500).default(""),
  evidence: zEvidence.default({ adQuote: "", pageQuote: "", selector: "" }),
});

const zRecommendation = z.object({
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).catch("MEDIUM"),
  effort: z.enum(["TRIVIAL", "SMALL", "MEDIUM", "LARGE"]).catch("MEDIUM"),
  impact: z.number().min(0).max(10).catch(5),
  title: z.string().min(1).max(200),
  detail: z.string().max(1500).default(""),
  example: z.string().max(2000).default(""),
});

export const analysisResultSchema = z.object({
  summary: z.string().max(2000).default(""),
  verdict: z.string().max(600).default(""),
  strengths: z.array(z.string().max(400)).max(8).default([]),
  weaknesses: z.array(z.string().max(400)).max(8).default([]),
  dimensions: z
    .array(
      z.object({
        dimension: z.enum(DIMENSIONS),
        score: z.number().min(0).max(100).catch(50),
        confidence: z.number().min(0).max(100).catch(70),
        applicable: z.boolean().catch(true),
        summary: z.string().max(1200).default(""),
        problems: z.array(zProblem).max(12).default([]),
        recommendations: z.array(zRecommendation).max(12).default([]),
      }),
    )
    .min(1),
  rewrites: z
    .object({
      headline: z.array(z.string().max(300)).max(5).default([]),
      subheadline: z.array(z.string().max(400)).max(5).default([]),
      cta: z.array(z.string().max(120)).max(5).default([]),
      heroAngle: z.array(z.string().max(400)).max(4).default([]),
    })
    .default({ headline: [], subheadline: [], cta: [], heroAngle: [] }),
});

export type RawAnalysisResult = z.infer<typeof analysisResultSchema>;

// ---------------------------------------------------------------- clustering

export const geminiClusterSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    clusters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          angle: { type: Type.STRING, format: "enum", enum: [...AD_ANGLES] },
          label: str("Short human name for this group, e.g. 'Cost-of-churn pain'."),
          rationale: str("Two sentences on what these ads share."),
          adIndexes: { type: Type.ARRAY, items: { type: Type.INTEGER }, description: "Zero-based indexes of the ads in this cluster." },
          blueprint: {
            type: Type.OBJECT,
            properties: {
              hero: str("The hero concept: what the visitor sees first."),
              headline: str("H1 written for this angle."),
              subheadline: str("Supporting line."),
              benefits: strArr("3-5 benefit bullets in this angle's language."),
              testimonials: strArr("2-3 testimonial themes to source, not fabricated quotes."),
              faq: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { question: str("Question"), answer: str("Answer") }, required: ["question", "answer"], propertyOrdering: ["question", "answer"] } },
              cta: str("Button label for this angle."),
            },
            required: ["hero", "headline", "subheadline", "benefits", "testimonials", "faq", "cta"],
            propertyOrdering: ["hero", "headline", "subheadline", "benefits", "testimonials", "faq", "cta"],
          },
        },
        required: ["angle", "label", "rationale", "adIndexes", "blueprint"],
        propertyOrdering: ["angle", "label", "rationale", "adIndexes", "blueprint"],
      },
    },
  },
  required: ["clusters"],
  propertyOrdering: ["clusters"],
};

export const clusterResultSchema = z.object({
  clusters: z
    .array(
      z.object({
        angle: adAngleEnum.catch("UNKNOWN"),
        label: z.string().max(120).default("Cluster"),
        rationale: z.string().max(1000).default(""),
        adIndexes: z.array(z.number().int().min(0)).default([]),
        blueprint: z.object({
          hero: z.string().max(800).default(""),
          headline: z.string().max(300).default(""),
          subheadline: z.string().max(500).default(""),
          benefits: z.array(z.string().max(300)).max(8).default([]),
          testimonials: z.array(z.string().max(400)).max(5).default([]),
          faq: z.array(z.object({ question: z.string().max(300), answer: z.string().max(1000) })).max(8).default([]),
          cta: z.string().max(120).default(""),
        }),
      }),
    )
    .default([]),
});
