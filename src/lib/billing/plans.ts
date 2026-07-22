import type { Plan } from "@prisma/client";

export type PlanDefinition = {
  id: Plan;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
  limits: {
    analysesPerMonth: number;
    adsPerAnalysis: number;
    projects: number;
    historyDays: number;
    exportFormats: ("pdf" | "markdown" | "json" | "csv")[];
    headlessRendering: boolean;
    apiAccess: boolean;
  };
};

export const PLANS: Record<Plan, PlanDefinition> = {
  FREE: {
    id: "FREE",
    name: "Free",
    price: "$0",
    cadence: "forever",
    tagline: "Check a funnel before you commit budget to it.",
    features: ["5 analyses a month", "2 ads per analysis", "Markdown and JSON export", "30 days of history"],
    limits: {
      analysesPerMonth: 5,
      adsPerAnalysis: 2,
      projects: 1,
      historyDays: 30,
      exportFormats: ["markdown", "json"],
      headlessRendering: false,
      apiAccess: false,
    },
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    price: "$29",
    cadence: "per month",
    tagline: "For the person who owns the paid channel.",
    features: [
      "100 analyses a month",
      "10 ads per analysis",
      "Angle clustering and page blueprints",
      "PDF, CSV, Markdown and JSON export",
      "JavaScript pages rendered in a real browser",
      "Unlimited projects and history",
    ],
    limits: {
      analysesPerMonth: 100,
      adsPerAnalysis: 10,
      projects: 50,
      historyDays: 3650,
      exportFormats: ["pdf", "markdown", "json", "csv"],
      headlessRendering: true,
      apiAccess: false,
    },
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    name: "Enterprise",
    price: "$149",
    cadence: "per month",
    tagline: "For agencies auditing funnels they did not build.",
    features: [
      "1,000 analyses a month",
      "10 ads per analysis",
      "API access",
      "Priority rendering queue",
      "Everything in Pro",
    ],
    limits: {
      analysesPerMonth: 1000,
      adsPerAnalysis: 10,
      projects: 500,
      historyDays: 3650,
      exportFormats: ["pdf", "markdown", "json", "csv"],
      headlessRendering: true,
      apiAccess: true,
    },
  },
};

export const PLAN_ORDER: Plan[] = ["FREE", "PRO", "ENTERPRISE"];

export function priceIdFor(plan: Plan): string | undefined {
  if (plan === "PRO") return process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO;
  if (plan === "ENTERPRISE") return process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE;
  return undefined;
}

export function planForPriceId(priceId: string | null | undefined): Plan {
  if (!priceId) return "FREE";
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE) return "ENTERPRISE";
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO) return "PRO";
  return "FREE";
}
