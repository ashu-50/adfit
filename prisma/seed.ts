/**
 * Seeds one fully-formed analysis so the dashboard, report page and all four
 * exporters can be developed without spending Gemini tokens or waiting on a
 * live crawl. Deliberately self-contained: no `@/` imports, so it runs under
 * plain tsx regardless of path-alias resolution.
 *
 *   pnpm db:seed
 *   SEED_USER_ID=<your supabase auth uid> pnpm db:seed   # attach to your login
 */
import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const USER_ID = process.env.SEED_USER_ID ?? "00000000-0000-4000-8000-000000000001";
const USER_EMAIL = process.env.SEED_USER_EMAIL ?? "demo@adfit.local";

const WEIGHTS = {
  MESSAGE_MATCH: 0.18,
  OFFER_MATCH: 0.15,
  CTA_MATCH: 0.13,
  ABOVE_FOLD: 0.12,
  PERSONA_MATCH: 0.11,
  PRODUCT_FRAMING: 0.1,
  PROOF: 0.09,
  OBJECTIONS: 0.07,
  VISUAL_CONTINUITY: 0.05,
} as const;

type DimKey = keyof typeof WEIGHTS;

const DIMENSION_DATA: Record<DimKey, { score: number; confidence: number; applicable: boolean; summary: string }> = {
  MESSAGE_MATCH: {
    score: 54,
    confidence: 0.9,
    applicable: true,
    summary: "The ad promises a 60-second setup; the page headline sells an all-in-one platform. A visitor has to infer the connection.",
  },
  OFFER_MATCH: {
    score: 41,
    confidence: 0.92,
    applicable: true,
    summary: "The ad offers 30 days free. The page leads with pricing tiers and mentions the trial only in the footer of the pricing card.",
  },
  CTA_MATCH: {
    score: 62,
    confidence: 0.85,
    applicable: true,
    summary: "Ad says Start free trial, page button says Get started. Same intent, different words, so the click feels one step further away.",
  },
  ABOVE_FOLD: {
    score: 58,
    confidence: 0.8,
    applicable: true,
    summary: "The first screen carries a headline and a button but no proof and no mention of the offer that earned the click.",
  },
  PERSONA_MATCH: {
    score: 71,
    confidence: 0.75,
    applicable: true,
    summary: "The ad targets solo operators; the page speaks to teams throughout, though the pricing page does address individuals.",
  },
  PRODUCT_FRAMING: {
    score: 76,
    confidence: 0.82,
    applicable: true,
    summary: "Both describe the same product category. The page adds capabilities the ad never mentioned, which reads as scope creep rather than contradiction.",
  },
  PROOF: {
    score: 68,
    confidence: 0.78,
    applicable: true,
    summary: "Four client logos and one testimonial with a full name and company. No metrics, no case study links.",
  },
  OBJECTIONS: {
    score: 49,
    confidence: 0.7,
    applicable: true,
    summary: "Price and cancellation are covered in the FAQ. Nothing addresses data security or migration effort, the two objections the ad's audience raises first.",
  },
  VISUAL_CONTINUITY: {
    score: 83,
    confidence: 0.65,
    applicable: true,
    summary: "Palette, logo and typography carry over cleanly from the creative to the hero.",
  },
};

const CRITICAL_ISSUES = [
  {
    id: "iss_offer_buried",
    severity: "CRITICAL",
    title: "The offer that earned the click is not on the page",
    detail:
      "The ad's entire hook is 30 days free. The landing page mentions the trial once, inside the pricing card, below the fold. Everyone who clicked came for the offer and has to hunt for it.",
    evidence: {
      adQuote: "Try it free for 30 days. No card needed.",
      pageQuote: "Plans start at $29 per month",
      selector: "section.pricing .plan-card:nth-of-type(2)",
    },
  },
  {
    id: "iss_headline_drift",
    severity: "HIGH",
    title: "The headline answers a broader question than the ad asked",
    detail:
      "The ad sells speed of setup. The headline sells breadth of platform. Both may be true, but the visitor arrived holding one specific expectation and the first line of the page does not acknowledge it.",
    evidence: {
      adQuote: "Set up in 60 seconds",
      pageQuote: "The all-in-one platform for modern teams",
      selector: "header h1",
    },
  },
];

const QUICK_WINS = [
  {
    id: "rec_headline",
    priority: "HIGH",
    effort: "TRIVIAL",
    impact: 12,
    title: "Put the ad's promise in the H1",
    detail: "Echo the setup-time claim verbatim in the headline so the page confirms the expectation instead of replacing it.",
    example: "Set up in 60 seconds. Free for 30 days.",
  },
  {
    id: "rec_offer_hero",
    priority: "HIGH",
    effort: "SMALL",
    impact: 11,
    title: "Move the trial terms above the fold",
    detail: "A single line under the CTA — 30 days free, no card required — removes the need to scroll to confirm the offer is real.",
    example: "30 days free. No card required. Cancel any time.",
  },
  {
    id: "rec_cta_copy",
    priority: "MEDIUM",
    effort: "TRIVIAL",
    impact: 6,
    title: "Match the button label to the ad",
    detail: "Change Get started to Start free trial so the action the visitor was sold is the action they see.",
    example: "Start free trial",
  },
];

const BLUEPRINT = {
  hero: "Speed-first hero: setup-time claim, trial terms, single primary action.",
  headline: "Set up in 60 seconds. Free for 30 days.",
  subheadline: "Connect your first channel before your coffee cools. No card, no onboarding call, no migration project.",
  benefits: [
    "Live in under a minute, not a quarter",
    "Import existing data with one click",
    "Cancel from settings, no email required",
  ],
  testimonials: ["Priya M., solo consultant — replaced three tools in an afternoon."],
  faq: [
    { question: "What happens after 30 days?", answer: "You choose a plan or the account pauses. Nothing is charged automatically." },
    { question: "Do I need a card to start?", answer: "No. The trial starts on signup and asks for payment only if you continue." },
  ],
  cta: "Start free trial",
};

const EXTRACTED = {
  hero: {
    headline: "The all-in-one platform for modern teams",
    subheadline: "Everything your team needs to plan, build and ship, in one place.",
    eyebrow: null,
    ctas: [{ label: "Get started", href: "/signup", primary: true }],
    imageUrl: "https://example.com/hero.png",
    backgroundColors: ["#0b0b12", "#6366f1"],
  },
  ctas: [
    { label: "Get started", href: "/signup", primary: true, aboveFold: true, score: 0.91 },
    { label: "Book a demo", href: "/demo", primary: false, aboveFold: true, score: 0.62 },
  ],
  proof: {
    testimonials: [{ quote: "We shipped in a week.", author: "Priya M.", role: "Head of Ops, Northwind" }],
    clientLogos: ["Northwind", "Acme", "Contoso", "Globex"],
    metrics: [],
    trustBadges: ["SOC 2 Type II"],
    ratings: [],
    caseStudyLinks: [],
  },
  pricing: {
    plans: [
      { name: "Starter", price: "$29", period: "month", features: ["3 seats", "Email support"] },
      { name: "Team", price: "$79", period: "month", features: ["10 seats", "Priority support", "30-day free trial"] },
    ],
    hasFreeTrial: true,
    guarantee: null,
  },
  faq: [
    { question: "Can I cancel any time?", answer: "Yes, from your billing settings." },
    { question: "How does billing work?", answer: "Monthly or annual, charged to your card." },
  ],
  forms: [{ fields: ["email", "password"], submitLabel: "Get started" }],
  navigation: { links: ["Product", "Pricing", "Docs", "Log in"] },
  sections: ["hero", "logos", "features", "pricing", "faq", "footer"],
};

async function main() {
  console.log("seeding…");

  const user = await prisma.user.upsert({
    where: { id: USER_ID },
    update: { email: USER_EMAIL },
    create: { id: USER_ID, email: USER_EMAIL, fullName: "Demo Account", plan: "PRO" },
  });

  const project = await prisma.project.upsert({
    where: { userId_slug: { userId: user.id, slug: "q3-acquisition" } },
    update: {},
    create: {
      userId: user.id,
      name: "Q3 acquisition",
      slug: "q3-acquisition",
      description: "Paid social funnels for the summer push.",
      color: "#6366f1",
    },
  });

  // Idempotent: wipe the previous demo analysis so reruns do not stack up.
  await prisma.analysis.deleteMany({ where: { userId: user.id, title: "Demo — Northwind free trial" } });

  const analysis = await prisma.analysis.create({
    data: {
      userId: user.id,
      projectId: project.id,
      title: "Demo — Northwind free trial",
      targetUrl: "https://example.com/pricing",
      urlHash: "0".repeat(64),
      status: "COMPLETED",
      progress: 100,
      stage: "done",
      overallScore: 61,
      grade: "C",
      model: "gemini-2.5-flash",
      promptVersion: "v1",
      inputTokens: 18_420,
      outputTokens: 4_180,
      costUsdMicros: 2_640,
      durationMs: 21_700,
      startedAt: new Date(Date.now() - 22_000),
      completedAt: new Date(),
    },
  });

  const cluster = await prisma.adCluster.create({
    data: {
      analysisId: analysis.id,
      angle: "URGENCY",
      label: "Speed of setup",
      rationale: "Both creatives lead with how little time it takes to get running, and treat price as secondary.",
      blueprint: BLUEPRINT as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.ad.createMany({
    data: [
      {
        analysisId: analysis.id,
        clusterId: cluster.id,
        sourceType: "TEXT",
        position: 0,
        rawText: "Set up in 60 seconds. Try it free for 30 days. No card needed.",
        angle: "URGENCY",
        parsed: {
          headline: "Set up in 60 seconds",
          primaryText: "Try it free for 30 days. No card needed.",
          description: "",
          ctaLabel: "Start free trial",
          offer: "30 days free, no card",
          personaSignals: ["solo operator", "time-poor"],
          productClaim: "Fast-setup ops platform",
          urgencyCues: ["60 seconds"],
          brandName: "Northwind",
        } as unknown as Prisma.InputJsonValue,
      },
      {
        analysisId: analysis.id,
        clusterId: cluster.id,
        sourceType: "TEXT",
        position: 1,
        rawText: "Stop losing an afternoon to onboarding. Live before your coffee cools. 30 days free.",
        angle: "PAIN_POINT",
        parsed: {
          headline: "Stop losing an afternoon to onboarding",
          primaryText: "Live before your coffee cools. 30 days free.",
          description: "",
          ctaLabel: "Start free trial",
          offer: "30 days free",
          personaSignals: ["solo operator", "switching from another tool"],
          productClaim: "Fast-setup ops platform",
          urgencyCues: ["before your coffee cools"],
          brandName: "Northwind",
        } as unknown as Prisma.InputJsonValue,
      },
    ],
  });

  await prisma.landingPage.create({
    data: {
      analysisId: analysis.id,
      url: "https://example.com/pricing",
      finalUrl: "https://example.com/pricing",
      httpStatus: 200,
      strategy: "STATIC",
      contentHash: "1".repeat(64),
      fetchDurationMs: 412,
      title: "Pricing — Northwind",
      description: "Simple pricing for teams of every size.",
      lang: "en",
      canonical: "https://example.com/pricing",
      ogImage: "https://example.com/og.png",
      extracted: EXTRACTED as unknown as Prisma.InputJsonValue,
      readableText:
        "The all-in-one platform for modern teams. Everything your team needs to plan, build and ship, in one place. Plans start at $29 per month.",
      wordCount: 742,
    },
  });

  const report = await prisma.report.create({
    data: {
      analysisId: analysis.id,
      overallScore: 61,
      grade: "C",
      confidence: 0.81,
      summary:
        "The page is recognisably the same product the ads sold, but the offer that earned the click is buried and the headline changes the subject. Two edits above the fold recover most of the gap.",
      verdict: "Recognisable but diluted. Fix the headline and CTA first.",
      strengths: ["Visual identity carries over cleanly", "Product category is consistent", "Named testimonial with a real company"] as unknown as Prisma.InputJsonValue,
      weaknesses: ["Trial offer is below the fold", "Headline broadens the ad's promise", "No answer to security or migration objections"] as unknown as Prisma.InputJsonValue,
      criticalIssues: CRITICAL_ISSUES as unknown as Prisma.InputJsonValue,
      quickWins: QUICK_WINS as unknown as Prisma.InputJsonValue,
      rewrites: {
        headline: ["Set up in 60 seconds. Free for 30 days.", "Live before your coffee cools"],
        subheadline: ["Connect your first channel in under a minute. No card, no onboarding call."],
        cta: ["Start free trial", "Start my 30 days"],
        heroAngle: ["Lead with elapsed time, prove it with a 20-second product clip."],
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.dimensionScore.createMany({
    data: (Object.keys(WEIGHTS) as DimKey[]).map((key) => {
      const d = DIMENSION_DATA[key];
      const weight = WEIGHTS[key];
      return {
        reportId: report.id,
        dimension: key,
        score: d.score,
        weight,
        weightedScore: Math.round(d.score * weight * 100) / 100,
        confidence: d.confidence,
        applicable: d.applicable,
        summary: d.summary,
        problems: (key === "OFFER_MATCH"
          ? [CRITICAL_ISSUES[0]]
          : key === "MESSAGE_MATCH"
            ? [CRITICAL_ISSUES[1]]
            : []) as unknown as Prisma.InputJsonValue,
        recommendations: (key === "MESSAGE_MATCH"
          ? [QUICK_WINS[0]]
          : key === "OFFER_MATCH"
            ? [QUICK_WINS[1]]
            : key === "CTA_MATCH"
              ? [QUICK_WINS[2]]
              : []) as unknown as Prisma.InputJsonValue,
      };
    }),
  });

  await prisma.analysisEvent.createMany({
    data: [
      { analysisId: analysis.id, stage: "EXTRACTING", progress: 15, message: "Fetched the page in 412ms." },
      { analysisId: analysis.id, stage: "OCR", progress: 35, message: "Read 2 ads." },
      { analysisId: analysis.id, stage: "ANALYZING", progress: 70, message: "Scored 9 dimensions." },
      { analysisId: analysis.id, stage: "SCORING", progress: 100, message: "Report ready." },
    ],
  });

  const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  await prisma.usageRecord.upsert({
    where: { userId_periodStart: { userId: user.id, periodStart } },
    update: { analysesRun: 1, adsProcessed: 2, inputTokens: 18_420, outputTokens: 4_180 },
    create: {
      userId: user.id,
      periodStart,
      analysesRun: 1,
      adsProcessed: 2,
      inputTokens: 18_420,
      outputTokens: 4_180,
    },
  });

  console.log(`seeded user ${user.email} with analysis ${analysis.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
