export const DIMENSIONS = [
  "PERSONA_MATCH", "OFFER_MATCH", "MESSAGE_MATCH", "PRODUCT_FRAMING",
  "PROOF", "OBJECTIONS", "CTA_MATCH", "ABOVE_FOLD", "VISUAL_CONTINUITY",
] as const;
export type DimensionKey = (typeof DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  PERSONA_MATCH: "Persona match",
  OFFER_MATCH: "Offer match",
  MESSAGE_MATCH: "Message match",
  PRODUCT_FRAMING: "Product framing",
  PROOF: "Proof",
  OBJECTIONS: "Objection handling",
  CTA_MATCH: "CTA match",
  ABOVE_FOLD: "Above-the-fold continuity",
  VISUAL_CONTINUITY: "Visual continuity",
};

export const DIMENSION_QUESTIONS: Record<DimensionKey, string> = {
  PERSONA_MATCH: "Does the page speak to the audience the ad targeted?",
  OFFER_MATCH: "Is the discount, trial, demo or guarantee the same one the ad promised?",
  MESSAGE_MATCH: "Does the headline continue the ad's promise?",
  PRODUCT_FRAMING: "Is the product described as the same thing the ad sold?",
  PROOF: "Is there evidence a sceptical visitor would accept?",
  OBJECTIONS: "Are price, trust, security, time and risk objections answered?",
  CTA_MATCH: "Does the primary action match what the ad asked for?",
  ABOVE_FOLD: "Does the first screen carry the promise without scrolling?",
  VISUAL_CONTINUITY: "Does the page look like it belongs to the ad that sent them?",
};

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type Priority = "HIGH" | "MEDIUM" | "LOW";
export type Effort = "TRIVIAL" | "SMALL" | "MEDIUM" | "LARGE";

export type Evidence = {
  adQuote?: string;
  pageQuote?: string;
  selector?: string;
};

export type Problem = {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  evidence?: Evidence;
};

export type Recommendation = {
  id: string;
  priority: Priority;
  effort: Effort;
  impact: number;
  title: string;
  detail: string;
  example?: string;
};

export type DimensionResult = {
  dimension: DimensionKey;
  score: number;
  weight: number;
  weightedScore: number;
  confidence: number;
  applicable: boolean;
  summary: string;
  problems: Problem[];
  recommendations: Recommendation[];
};

export type ReportGrade = "A" | "B" | "C" | "D" | "F";

export type FitReport = {
  analysisId: string;
  overallScore: number;
  grade: ReportGrade;
  confidence: number;
  summary: string;
  verdict: string;
  strengths: string[];
  weaknesses: string[];
  criticalIssues: Problem[];
  quickWins: Recommendation[];
  rewrites: {
    headline?: string[];
    subheadline?: string[];
    cta?: string[];
    heroAngle?: string[];
  };
  dimensions: DimensionResult[];
  clusters: AdClusterResult[];
};

export const AD_ANGLES = [
  "PAIN_POINT", "DISCOUNT", "FEATURE", "AUTHORITY",
  "SOCIAL_PROOF", "COMPARISON", "CURIOSITY", "URGENCY", "UNKNOWN",
] as const;
export type AdAngle = (typeof AD_ANGLES)[number];

export const AD_ANGLE_LABELS: Record<AdAngle, string> = {
  PAIN_POINT: "Pain point",
  DISCOUNT: "Discount",
  FEATURE: "Feature",
  AUTHORITY: "Authority",
  SOCIAL_PROOF: "Social proof",
  COMPARISON: "Comparison",
  CURIOSITY: "Curiosity",
  URGENCY: "Urgency",
  UNKNOWN: "Unclassified",
};

export type LandingBlueprint = {
  hero: string;
  headline: string;
  subheadline: string;
  benefits: string[];
  testimonials: string[];
  faq: { question: string; answer: string }[];
  cta: string;
};

export type AdClusterResult = {
  angle: AdAngle;
  label: string;
  rationale: string;
  adIndexes: number[];
  blueprint: LandingBlueprint;
};

/** Normalised creative, whether it arrived as pasted text or a screenshot. */
export type ParsedAd = {
  headline: string;
  primaryText: string;
  description: string;
  ctaLabel: string;
  offer: string;
  personaSignals: string[];
  productClaim: string;
  urgencyCues: string[];
  brandName: string;
  dominantColors: string[];
  visualNotes: string;
  angle: AdAngle;
};
