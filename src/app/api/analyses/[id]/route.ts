import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/response";
import { deleteAnalysis, getAnalysisStatus } from "@/lib/db/repositories/analysis";
import { getAnalysisView } from "@/lib/services/report-hydrator";
import { deleteScreenshots } from "@/lib/storage";
import { z } from "zod";

export const runtime = "nodejs";

type Params = { id: string };

const querySchema = z.object({ view: z.enum(["full", "status"]).default("full") });

export const GET = route<undefined, z.infer<typeof querySchema>, Params>(
  { query: querySchema },
  async ({ user, params, query }) => {
    if (query.view === "status") return ok(await getAnalysisStatus(user.id, params.id));

    // Hydrated, not raw. The UI asks for a FitReport; returning the normalised
    // database rows is what left every finished analysis rendering an empty
    // page while the exporters, which hydrate, looked fine.
    return ok(await getAnalysisView(user.id, params.id));
  },
);

export const DELETE = route<undefined, undefined, Params>({}, async ({ user, params }) => {
  const orphanedPaths = await deleteAnalysis(user.id, params.id);
  await deleteScreenshots(orphanedPaths).catch(() => {});
  return ok({ deleted: true });
});
