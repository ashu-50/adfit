import type { AnalysisStatus, Plan } from "@prisma/client";
import type { getUsage } from "@/lib/billing/entitlements";
import type { PLANS } from "@/lib/billing/plans";
import type { dashboardStats, getAnalysisStatus, listAnalyses } from "@/lib/db/repositories/analysis";
import type { getAnalysisView } from "@/lib/services/report-hydrator";
import type { listProjects } from "@/lib/db/repositories/project";
import type { AdAngle, DimensionKey, FitReport, Problem, Recommendation } from "./domain";

/**
 * Wire types, derived from the server rather than declared by hand.
 *
 * These used to be written out separately, which meant TypeScript could not see
 * when a route's actual response drifted from what components expected — the
 * compiler checked both sides against a description that was simply wrong. Two
 * fields had already diverged and were rendering "undefined" in the UI: the
 * usage snapshot returns `analysesRemaining` while three components asked for
 * `remaining`, and dashboard stats never had the `failed` field two of them read.
 *
 * Deriving from the source functions turns that class of bug into a build
 * error. Every import here is `import type`, which TypeScript erases entirely,
 * so no server module reaches the client bundle.
 */

// ---------------------------------------------------------------- transport

/**
 * What a value looks like after JSON.stringify and back.
 *
 * Dates are the reason this exists: Prisma returns `Date` objects, the wire
 * carries ISO strings, and a component calling `.getTime()` on one would
 * compile cleanly and throw at runtime.
 */
export type Serialized<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

type Returned<T extends (...args: never[]) => unknown> = Serialized<Awaited<ReturnType<T>>>;

export type ApiEnvelope<T> = { ok: true; data: T; meta?: PaginationMeta } | { ok: false; error: ApiError };

export type ApiError = { code: string; message: string; details?: unknown };

export type PaginationMeta = { total: number; page: number; perPage: number; totalPages: number };

// ---------------------------------------------------------------- analyses

/** The route unwraps `{ items, meta }` and sends the items as `data`. */
export type AnalysisListItem = Returned<typeof listAnalyses>["items"][number];

export type AnalysisDetail = NonNullable<Returned<typeof getAnalysisView>>;

export type AnalysisStatusPayload = NonNullable<Returned<typeof getAnalysisStatus>>;

export type AdRecord = AnalysisDetail["ads"][number];

export type LandingPageRecord = NonNullable<AnalysisDetail["landingPage"]>;

export type ProgressEvent = {
  stage: string;
  progress: number;
  message: string;
  level?: "info" | "warn" | "error";
};

// ---------------------------------------------------------------- account

export type UsageSnapshot = Returned<typeof getUsage>;

export type DashboardStats = Returned<typeof dashboardStats>;

export type PlanDefinition = Serialized<(typeof PLANS)[Plan]>;

export type UsagePayload = { usage: UsageSnapshot; stats: DashboardStats; plan: PlanDefinition };

export type Project = Returned<typeof listProjects>[number];

export type ProjectSummary = { id: string; name: string; color: string };

// ---------------------------------------------------------------- requests

export type ExportFormat = "pdf" | "markdown" | "json" | "csv";

export type CreateAnalysisPayload = {
  url: string;
  title?: string;
  projectId?: string | null;
  forceRefresh?: boolean;
  ads: Array<
    | { type: "text"; text: string; label?: string }
    | { type: "image"; storagePath: string; mimeType: string; fileSize: number; label?: string }
  >;
};

/**
 * `/api/uploads` hands back the bucket the token was signed for. Uploading to
 * any other bucket fails with a Supabase error that never mentions
 * configuration, so the client must use this rather than its own env var.
 */
export type SignedUpload = { path: string; signedUrl: string; token: string; bucket: string };

export type { FitReport, DimensionKey, Problem, Recommendation, AdAngle, AnalysisStatus, Plan };
