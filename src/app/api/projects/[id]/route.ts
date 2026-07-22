import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/response";
import { updateProjectSchema } from "@/lib/validation/analysis";
import { deleteProject, updateProject } from "@/lib/db/repositories/project";
import type { z } from "zod";

export const runtime = "nodejs";

export const PATCH = route<z.infer<typeof updateProjectSchema>, undefined, { id: string }>(
  { body: updateProjectSchema },
  async ({ user, params, body }) => ok(await updateProject(user.id, params.id, body)),
);

export const DELETE = route<undefined, undefined, { id: string }>({}, async ({ user, params }) => {
  await deleteProject(user.id, params.id);
  return ok({ deleted: true });
});
