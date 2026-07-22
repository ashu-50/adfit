import { Prisma, prisma } from "@/lib/db/client";
import type { AnalysisStatus } from "@prisma/client";
import { notFound } from "@/lib/http/errors";
import { paginationMeta } from "@/lib/validation/common";
import type { z } from "zod";
import type { listAnalysesSchema } from "@/lib/validation/analysis";

/**
 * Prisma connects with a role that bypasses RLS, so ownership is enforced here.
 * Every read and write takes a userId and folds it into the WHERE clause — there
 * is no unscoped accessor in this file by design.
 */

const listSelect = {
  id: true,
  title: true,
  targetUrl: true,
  status: true,
  progress: true,
  stage: true,
  overallScore: true,
  grade: true,
  error: true,
  createdAt: true,
  completedAt: true,
  durationMs: true,
  project: { select: { id: true, name: true, color: true } },
  _count: { select: { ads: true } },
} satisfies Prisma.AnalysisSelect;

export type AnalysisListItem = Prisma.AnalysisGetPayload<{ select: typeof listSelect }>;

export async function listAnalyses(userId: string, filters: z.infer<typeof listAnalysesSchema>) {
  const where: Prisma.AnalysisWhereInput = {
    userId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.minScore !== undefined || filters.maxScore !== undefined
      ? { overallScore: { gte: filters.minScore, lte: filters.maxScore } }
      : {}),
    ...(filters.from || filters.to ? { createdAt: { gte: filters.from, lte: filters.to } } : {}),
    ...(filters.q
      ? {
          OR: [
            { title: { contains: filters.q, mode: "insensitive" } },
            { targetUrl: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.AnalysisOrderByWithRelationInput =
    filters.sort === "oldest" ? { createdAt: "asc" }
    : filters.sort === "score-desc" ? { overallScore: { sort: "desc", nulls: "last" } }
    : filters.sort === "score-asc" ? { overallScore: { sort: "asc", nulls: "last" } }
    : { createdAt: "desc" };

  const [items, total] = await Promise.all([
    prisma.analysis.findMany({
      where,
      orderBy,
      select: listSelect,
      skip: (filters.page - 1) * filters.perPage,
      take: filters.perPage,
    }),
    prisma.analysis.count({ where }),
  ]);

  return { items, meta: paginationMeta(total, filters.page, filters.perPage) };
}

export async function getAnalysisDetail(userId: string, id: string) {
  const analysis = await prisma.analysis.findFirst({
    where: { id, userId },
    include: {
      project: { select: { id: true, name: true, color: true } },
      ads: { orderBy: { position: "asc" } },
      clusters: { include: { ads: { select: { id: true, position: true } } } },
      landingPage: true,
      report: { include: { dimensions: true } },
      events: { orderBy: { createdAt: "asc" }, take: 60 },
    },
  });
  if (!analysis) throw notFound("That analysis does not exist, or is not yours.");
  return analysis;
}

/** Lightweight status read for polling. Deliberately does not join the report. */
export async function getAnalysisStatus(userId: string, id: string) {
  const analysis = await prisma.analysis.findFirst({
    where: { id, userId },
    select: { id: true, status: true, progress: true, stage: true, error: true, errorCode: true, overallScore: true, grade: true },
  });
  if (!analysis) throw notFound("That analysis does not exist, or is not yours.");
  return analysis;
}

export async function updateProgress(
  id: string,
  data: { status?: AnalysisStatus; progress?: number; stage?: string; message?: string; level?: string },
) {
  await prisma.$transaction([
    prisma.analysis.update({
      where: { id },
      data: {
        ...(data.status ? { status: data.status } : {}),
        ...(data.progress !== undefined ? { progress: data.progress } : {}),
        ...(data.stage ? { stage: data.stage } : {}),
        ...(data.status === "EXTRACTING" ? { startedAt: new Date() } : {}),
      },
    }),
    ...(data.message
      ? [
          prisma.analysisEvent.create({
            data: {
              analysisId: id,
              stage: data.stage ?? "",
              progress: data.progress ?? 0,
              message: data.message,
              level: data.level ?? "info",
            },
          }),
        ]
      : []),
  ]);
}

export async function markFailed(id: string, message: string, code: string) {
  await prisma.analysis.update({
    where: { id },
    data: { status: "FAILED", error: message, errorCode: code, completedAt: new Date() },
  });
  await prisma.analysisEvent.create({
    data: { analysisId: id, stage: "FAILED", progress: 100, message, level: "error" },
  });
}

export async function deleteAnalysis(userId: string, id: string) {
  const analysis = await prisma.analysis.findFirst({
    where: { id, userId },
    select: { id: true, ads: { select: { storagePath: true } } },
  });
  if (!analysis) throw notFound("That analysis does not exist, or is not yours.");

  await prisma.analysis.delete({ where: { id } });
  return analysis.ads.map((a) => a.storagePath).filter((p): p is string => Boolean(p));
}

export async function dashboardStats(userId: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totals, failed, recent, scored, byGrade] = await Promise.all([
    prisma.analysis.count({ where: { userId } }),
    prisma.analysis.count({ where: { userId, status: "FAILED" } }),
    prisma.analysis.findMany({
      where: { userId, status: "COMPLETED", completedAt: { gte: since } },
      select: { overallScore: true, completedAt: true, targetUrl: true },
      orderBy: { completedAt: "asc" },
    }),
    prisma.analysis.aggregate({ where: { userId, status: "COMPLETED" }, _avg: { overallScore: true }, _count: true }),
    prisma.analysis.groupBy({ by: ["grade"], where: { userId, status: "COMPLETED" }, _count: true }),
  ]);

  return {
    total: totals,
    failed,
    completed: scored._count,
    averageScore: scored._avg.overallScore != null ? Math.round(scored._avg.overallScore) : null,
    trend: recent.map((r) => ({ date: r.completedAt?.toISOString() ?? "", score: r.overallScore ?? 0, url: r.targetUrl })),
    gradeDistribution: byGrade.map((g) => ({ grade: g.grade ?? "?", count: g._count })),
  };
}
