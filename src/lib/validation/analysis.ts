import { z } from "zod";
import { paginationSchema, publicUrlSchema, uuidSchema } from "./common";

export const AD_TEXT_MAX = 5000;
export const MAX_ADS = 10;

export const adInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string().trim().min(10, "Paste at least a headline and one line of body copy.").max(AD_TEXT_MAX),
    label: z.string().trim().max(80).optional(),
  }),
  z.object({
    type: z.literal("image"),
    /** Path inside the private `ad-screenshots` bucket, returned by /api/uploads. */
    storagePath: z.string().min(1),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
    fileSize: z.number().int().positive().max(10 * 1024 * 1024, "Screenshots must be under 10 MB."),
    label: z.string().trim().max(80).optional(),
  }),
]);

export const createAnalysisSchema = z
  .object({
    url: publicUrlSchema,
    ads: z.array(adInputSchema).min(1, "Add at least one ad.").max(MAX_ADS, `Up to ${MAX_ADS} ads per analysis.`),
    projectId: uuidSchema.nullish(),
    title: z.string().trim().max(120).optional(),
    /** Skips the extraction + LLM caches. Costs a full run. */
    forceRefresh: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.ads.filter((a) => a.type === "image").length > 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ads"],
        message: "Up to 6 screenshots per analysis. Split larger batches into two runs.",
      });
    }
  });

export type CreateAnalysisInput = z.infer<typeof createAnalysisSchema>;
export type AdInput = z.infer<typeof adInputSchema>;

export const analysisStatusSchema = z.enum([
  "QUEUED", "EXTRACTING", "OCR", "ANALYZING", "SCORING", "COMPLETED", "FAILED", "CANCELLED",
]);

export const listAnalysesSchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  status: analysisStatusSchema.optional(),
  projectId: uuidSchema.optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  maxScore: z.coerce.number().int().min(0).max(100).optional(),
  sort: z.enum(["recent", "oldest", "score-desc", "score-asc"]).default("recent"),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const exportFormatSchema = z.enum(["pdf", "markdown", "json", "csv"]);

export const uploadRequestSchema = z.object({
  fileName: z.string().min(1).max(200),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  fileSize: z.number().int().positive().max(10 * 1024 * 1024),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name the project.").max(80),
  description: z.string().trim().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour.").default("#6366f1"),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  archived: z.boolean().optional(),
});
