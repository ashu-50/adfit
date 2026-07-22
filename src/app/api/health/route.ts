import { prisma } from "@/lib/db/client";
import { ok } from "@/lib/http/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness plus a shallow dependency probe. Used by Railway and uptime checks. */
export async function GET() {
  const checks: Record<string, "ok" | "down"> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "down";
  }

  checks.gemini = process.env.GEMINI_API_KEY ? "ok" : "down";
  checks.renderer = process.env.RENDERER_URL ? "ok" : "down";

  const healthy = checks.database === "ok" && checks.gemini === "ok";
  return ok({ status: healthy ? "healthy" : "degraded", checks, version: process.env.npm_package_version ?? "1.0.0" }, { status: healthy ? 200 : 503 });
}
