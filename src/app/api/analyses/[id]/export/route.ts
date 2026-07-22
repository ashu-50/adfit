import { z } from "zod";
import { route } from "@/lib/http/handler";
import { hydrateReport } from "@/lib/services/report-hydrator";
import { buildExport } from "@/lib/export";
import { exportFormatSchema } from "@/lib/validation/analysis";
import { assertExportFormat } from "@/lib/billing/entitlements";
import { enforceRateLimit } from "@/lib/cache/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const querySchema = z.object({ format: exportFormatSchema.default("markdown") });

export const GET = route<undefined, z.infer<typeof querySchema>, { id: string }>(
  { query: querySchema },
  async ({ user, params, query }) => {
    assertExportFormat(user.plan, query.format);

    // PDF generation is the most expensive read path in the app; cap it so a
    // loop in someone's script cannot burn a function's whole budget.
    await enforceRateLimit(
      `export:${user.id}`,
      { capacity: 20, refillPerSecond: 20 / 60 },
      "That is a lot of exports at once. Try again in a moment.",
    );

    const { report, url, title, createdAt } = await hydrateReport(user.id, params.id);
    const payload = await buildExport(query.format, { report, url, title, createdAt });

    const body: BodyInit = typeof payload.body === "string" ? payload.body : new Uint8Array(payload.body);

    return new Response(body, {
      headers: {
        "content-type": payload.contentType,
        "content-disposition": `attachment; filename="${payload.filename}"`,
        "cache-control": "private, max-age=300",
      },
    });
  },
);
