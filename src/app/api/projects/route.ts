import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/response";
import { createProjectSchema } from "@/lib/validation/analysis";
import { createProject, listProjects } from "@/lib/db/repositories/project";

export const runtime = "nodejs";

export const GET = route({}, async ({ user }) => ok(await listProjects(user.id)));

export const POST = route({ body: createProjectSchema }, async ({ user, body }) =>
  ok(await createProject(user.id, user.plan, body), { status: 201 }),
);
