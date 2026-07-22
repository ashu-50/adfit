import { generateStructured, type Usage } from "./client";
import { geminiClusterSchema, clusterResultSchema } from "./schemas";
import { CLUSTER_SYSTEM } from "./prompts/system";
import { buildClusterPrompt } from "./prompts/analysis";
import type { AdClusterResult, ParsedAd } from "@/types/domain";
import { sha256 } from "@/lib/utils";

/**
 * Clustering only runs with two or more ads. With one ad the "cluster" is the ad
 * itself, and paying for a model call to learn that would be waste — so the
 * single-ad blueprint is derived from the parsed creative directly.
 */
export async function clusterAds(args: {
  ads: ParsedAd[];
  pageUrl: string;
  signal?: AbortSignal;
  skipCache?: boolean;
}): Promise<{ clusters: AdClusterResult[]; usage: Usage }> {
  if (args.ads.length === 0) return { clusters: [], usage: { inputTokens: 0, outputTokens: 0 } };

  if (args.ads.length === 1) {
    const ad = args.ads[0]!;
    return {
      clusters: [
        {
          angle: ad.angle,
          label: ad.headline ? ad.headline.slice(0, 60) : "Single ad",
          rationale: "Only one ad was supplied, so there is nothing to group against.",
          adIndexes: [0],
          blueprint: {
            hero: ad.visualNotes || "Lead with the promise the ad makes, stated plainly.",
            headline: ad.headline,
            subheadline: ad.description || ad.primaryText.slice(0, 200),
            benefits: ad.personaSignals.slice(0, 5),
            testimonials: [],
            faq: [],
            cta: ad.ctaLabel,
          },
        },
      ],
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  const fingerprint = await sha256(args.ads.map((a) => `${a.headline}|${a.ctaLabel}|${a.offer}|${a.angle}`).join("::"));

  const result = await generateStructured({
    operation: "cluster-ads",
    system: CLUSTER_SYSTEM,
    parts: [{ text: buildClusterPrompt(args.ads, args.pageUrl) }],
    responseSchema: geminiClusterSchema,
    validator: clusterResultSchema,
    maxOutputTokens: 6144,
    cacheParts: [fingerprint, args.pageUrl],
    skipCache: args.skipCache,
    signal: args.signal,
  });

  // The model occasionally drops or duplicates an index. Reconcile against the
  // real array so the UI can always resolve every cluster member.
  const assigned = new Set<number>();
  const clusters: AdClusterResult[] = result.data.clusters.map((c) => {
    const indexes = c.adIndexes.filter((i) => i < args.ads.length && !assigned.has(i));
    indexes.forEach((i) => assigned.add(i));
    return { ...c, adIndexes: indexes };
  }).filter((c) => c.adIndexes.length > 0);

  const orphans = args.ads.map((_, i) => i).filter((i) => !assigned.has(i));
  for (const index of orphans) {
    const ad = args.ads[index]!;
    const home = clusters.find((c) => c.angle === ad.angle);
    if (home) home.adIndexes.push(index);
    else clusters.push({
      angle: ad.angle,
      label: ad.headline.slice(0, 60) || "Unclustered",
      rationale: "This ad did not share an angle with the others.",
      adIndexes: [index],
      blueprint: { hero: "", headline: ad.headline, subheadline: "", benefits: [], testimonials: [], faq: [], cta: ad.ctaLabel },
    });
  }

  return { clusters, usage: result.usage };
}
