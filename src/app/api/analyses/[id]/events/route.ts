import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getAnalysisStatus } from "@/lib/db/repositories/analysis";
import { prisma } from "@/lib/db/client";
import { fail } from "@/lib/http/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const POLL_MS = 900;
const MAX_LIFETIME_MS = 5 * 60 * 1000;

/**
 * Server-sent events over polling rather than websockets or Supabase Realtime.
 *
 * The progress stream is one-directional and short-lived, which is exactly what
 * SSE is for; it works through every proxy, needs no extra service, and
 * reconnects on its own. The server polls Postgres because the pipeline may be
 * running in a different instance than the one holding this connection.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let userId: string;
  let analysisId: string;

  try {
    const user = await requireUser();
    userId = user.id;
    analysisId = (await ctx.params).id;
    await getAnalysisStatus(userId, analysisId); // 404s before the stream opens
  } catch (err) {
    return fail(err);
  }

  const encoder = new TextEncoder();
  let lastEventId: string | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        clearTimeout(lifetime);
        try { controller.close(); } catch { /* already closed */ }
      };

      req.signal.addEventListener("abort", stop, { once: true });
      const lifetime = setTimeout(stop, MAX_LIFETIME_MS);

      const tick = async () => {
        if (closed) return;
        try {
          const status = await getAnalysisStatus(userId, analysisId);

          const events = await prisma.analysisEvent.findMany({
            where: { analysisId, ...(lastEventId ? { id: { not: lastEventId } } : {}) },
            orderBy: { createdAt: "asc" },
            take: 20,
            ...(lastEventId ? { skip: 1, cursor: { id: lastEventId } } : {}),
          });

          for (const event of events) {
            send("progress", { stage: event.stage, progress: event.progress, message: event.message, level: event.level, at: event.createdAt });
            lastEventId = event.id;
          }

          send("status", status);

          if (TERMINAL.has(status.status)) {
            send("done", { status: status.status, overallScore: status.overallScore, grade: status.grade, error: status.error });
            stop();
          }
        } catch {
          send("error", { message: "Lost contact with the analysis. Refresh to reconnect." });
          stop();
        }
      };

      const timer = setInterval(() => void tick(), POLL_MS);
      await tick();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
