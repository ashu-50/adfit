export type RenderStrategy = "STATIC" | "HEADLESS" | "CACHED";

export type Cta = {
  label: string;
  href: string | null;
  isPrimary: boolean;
  /** Approximate vertical position in the DOM, used to decide "above the fold". */
  domIndex: number;
  selector: string;
  kind: "link" | "button" | "submit";
};

export type Heading = { level: "h1" | "h2" | "h3"; text: string; domIndex: number };

export type Testimonial = { quote: string; author: string | null; role: string | null; selector: string };

export type PricingPlan = { name: string; price: string; period: string | null; highlight: boolean; features: string[] };

export type FaqEntry = { question: string; answer: string };

export type FormSummary = { fieldCount: number; fields: string[]; submitLabel: string | null; action: string | null };

export type ProductSection = { heading: string; text: string; hasImage: boolean };

export type ExtractedPage = {
  url: string;
  finalUrl: string;
  httpStatus: number;
  strategy: RenderStrategy;
  fetchDurationMs: number;
  contentHash: string;

  meta: {
    title: string;
    description: string;
    lang: string | null;
    canonical: string | null;
    favicon: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImage: string | null;
    twitterCard: string | null;
    themeColor: string | null;
    robots: string | null;
  };

  hero: {
    headline: string;
    subheadline: string;
    eyebrow: string;
    text: string;
    ctas: Cta[];
    imageSrc: string | null;
    imageAlt: string | null;
    backgroundColors: string[];
  };

  headings: Heading[];
  ctas: Cta[];
  navigation: string[];

  proof: {
    testimonials: Testimonial[];
    logos: string[];
    metrics: string[];
    trustBadges: string[];
    ratings: string[];
    caseStudyLinks: string[];
  };

  pricing: {
    present: boolean;
    plans: PricingPlan[];
    freeTrial: string | null;
    guarantee: string | null;
    currencySymbols: string[];
  };

  faq: FaqEntry[];
  forms: FormSummary[];
  productSections: ProductSection[];
  images: { src: string; alt: string }[];

  readableText: string;
  wordCount: number;
  /** Signals the renderer escalation heuristic used, kept for debugging. */
  diagnostics: {
    escalated: boolean;
    escalationReason: string | null;
    htmlBytes: number;
    scriptCount: number;
    blockedByRobots: boolean;
  };
};

export type FetchResult = {
  html: string;
  finalUrl: string;
  status: number;
  strategy: RenderStrategy;
  durationMs: number;
  screenshotBase64?: string;
};
