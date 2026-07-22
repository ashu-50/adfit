import { prisma } from "@/lib/db/client";
import { notFound, quotaExceeded } from "@/lib/http/errors";
import { PLANS } from "@/lib/billing/plans";
import { slugify } from "@/lib/utils";
import type { Plan } from "@prisma/client";
import type { z } from "zod";
import type { createProjectSchema, updateProjectSchema } from "@/lib/validation/analysis";

export async function listProjects(userId: string) {
  return prisma.project.findMany({
    where: { userId, archivedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, slug: true, description: true, color: true, createdAt: true,
      _count: { select: { analyses: true } },
    },
  });
}

export async function createProject(userId: string, plan: Plan, input: z.infer<typeof createProjectSchema>) {
  const limit = PLANS[plan].limits.projects;
  const existing = await prisma.project.count({ where: { userId, archivedAt: null } });
  if (existing >= limit) {
    throw quotaExceeded(`The ${PLANS[plan].name} plan includes ${limit} project${limit === 1 ? "" : "s"}.`, { limit });
  }

  // Slug collisions are resolved by suffixing rather than failing: a marketer
  // naming two projects "Q3" should not see a database error.
  const base = slugify(input.name);
  let slug = base;
  for (let attempt = 1; attempt < 50; attempt++) {
    const taken = await prisma.project.findUnique({ where: { userId_slug: { userId, slug } }, select: { id: true } });
    if (!taken) break;
    slug = `${base}-${attempt + 1}`;
  }

  return prisma.project.create({
    data: { userId, slug, name: input.name, description: input.description, color: input.color },
  });
}

export async function updateProject(userId: string, id: string, input: z.infer<typeof updateProjectSchema>) {
  const result = await prisma.project.updateMany({
    where: { id, userId },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.color ? { color: input.color } : {}),
      ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
    },
  });
  if (result.count === 0) throw notFound("That project does not exist, or is not yours.");
  return prisma.project.findUniqueOrThrow({ where: { id } });
}

export async function deleteProject(userId: string, id: string) {
  const result = await prisma.project.deleteMany({ where: { id, userId } });
  if (result.count === 0) throw notFound("That project does not exist, or is not yours.");
}
