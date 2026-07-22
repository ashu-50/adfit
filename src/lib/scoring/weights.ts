import type { DimensionKey } from "@/types/domain";

/**
 * Weights are the product's opinion, not a model output. Message, offer and CTA
 * carry the most because they are what a visitor checks in the first two seconds
 * after a click; visual continuity carries the least because a mismatched
 * palette annoys but rarely bounces.
 *
 * They sum to exactly 1.0. When a dimension is not applicable (visual
 * continuity with no screenshots), its weight is redistributed proportionally
 * across the rest rather than counted as a zero — scoring a page down for
 * something the user did not supply would be dishonest.
 */
export const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  MESSAGE_MATCH: 0.18,
  OFFER_MATCH: 0.15,
  CTA_MATCH: 0.13,
  ABOVE_FOLD: 0.12,
  PERSONA_MATCH: 0.11,
  PRODUCT_FRAMING: 0.1,
  PROOF: 0.09,
  OBJECTIONS: 0.07,
  VISUAL_CONTINUITY: 0.05,
};

/**
 * Some failures are not gradual. A page whose CTA contradicts the ad cannot be
 * "78 out of 100" no matter how good its testimonials are, so a critical finding
 * in these dimensions imposes a hard ceiling on the overall score.
 */
export const CRITICAL_CEILINGS: Partial<Record<DimensionKey, number>> = {
  MESSAGE_MATCH: 68,
  OFFER_MATCH: 70,
  CTA_MATCH: 72,
  PRODUCT_FRAMING: 70,
};

export const GRADE_BANDS: { min: number; grade: "A" | "B" | "C" | "D" | "F"; verdict: string }[] = [
  { min: 85, grade: "A", verdict: "The page continues the ad. Optimise, do not rebuild." },
  { min: 70, grade: "B", verdict: "The promise survives the click, with gaps worth closing." },
  { min: 55, grade: "C", verdict: "Recognisable but diluted. Fix the headline and CTA first." },
  { min: 40, grade: "D", verdict: "Visitors are landing somewhere they did not expect." },
  { min: 0, grade: "F", verdict: "The page answers a different question than the ad asked." },
];

/** Confidence multiplier applied to a dimension whose evidence was thin. */
export const LOW_CONFIDENCE_FLOOR = 0.6;
