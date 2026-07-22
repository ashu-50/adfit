import { z } from "zod";

export const uuidSchema = z.string().uuid("Not a valid id.");

/**
 * Public URL validator. Rejects non-http schemes, credentials in the URL and
 * obvious internal hostnames before the request ever leaves the process.
 * A second, DNS-level SSRF check runs in src/lib/extraction/guard.ts.
 */
export const publicUrlSchema = z
  .string()
  .trim()
  .min(4, "Enter a landing page URL.")
  .max(2048, "That URL is too long.")
  .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
  .superRefine((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "That does not look like a URL." });
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Use an http or https URL." });
    }
    if (url.username || url.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Remove the credentials from the URL." });
    }
    const host = url.hostname.toLowerCase();
    const blocked = host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host === "0.0.0.0";
    if (blocked) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a publicly reachable URL." });
    }
    if (!host.includes(".")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a full domain, for example acme.com." });
    }
  });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export function paginationMeta(total: number, page: number, perPage: number) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  return { total, page, perPage, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}
