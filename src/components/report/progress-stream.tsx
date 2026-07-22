"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAnalysisEvents } from "@/hooks/use-analysis-events";
import { cn } from "@/lib/utils";

const STAGES = [
  { id: "EXTRACTING", label: "Reading the page" },
  { id: "OCR", label: "Reading the ads" },
  { id: "ANALYZING", label: "Comparing them" },
  { id: "SCORING", label: "Scoring" },
] as const;

export function ProgressStream({
  analysisId,
  initialProgress,
  initialStage,
}: {
  analysisId: string;
  initialProgress: number;
  initialStage: string | null;
}) {
  const { events, status, finished } = useAnalysisEvents(analysisId, true);

  const progress = status?.progress ?? initialProgress;
  const stage = status?.stage ?? initialStage;
  const failed = status?.status === "FAILED";
  const currentIndex = STAGES.findIndex((s) => s.id === (status?.status ?? ""));

  if (failed) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>This analysis could not finish</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <p>{status?.error ?? "Something went wrong while reading the page."}</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="self-start">
            Reload
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 p-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              {finished ? <Check className="size-4 text-success" /> : <Loader2 className="size-4 animate-spin text-primary" />}
              {finished ? "Report ready" : (stage ?? "Starting")}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>

        <ol className="grid gap-2 sm:grid-cols-4">
          {STAGES.map((s, i) => {
            const done = currentIndex > i || finished;
            const active = currentIndex === i && !finished;
            return (
              <li
                key={s.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors",
                  done && "border-success/30 bg-success/5 text-success",
                  active && "border-primary/40 bg-primary/5 text-foreground",
                  !done && !active && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5 shrink-0" /> : active ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : <span className="size-3.5 shrink-0 rounded-full border border-current opacity-40" />}
                {s.label}
              </li>
            );
          })}
        </ol>

        {/* Live log. Capped to the tail so a long run does not push the page
            down; the full history lives in the analysis events table. */}
        <div className="flex max-h-44 flex-col-reverse gap-1.5 overflow-y-auto scrollbar-thin rounded-md bg-muted/30 p-3">
          <AnimatePresence initial={false}>
            {[...events].reverse().slice(0, 12).map((event, i) => (
              <motion.p
                key={`${event.stage}-${event.progress}-${i}`}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "font-mono text-[11px] leading-relaxed",
                  event.level === "warn" ? "text-warning" : "text-muted-foreground",
                )}
              >
                <span className="opacity-50">{String(event.progress).padStart(3, " ")}% </span>
                {event.message}
              </motion.p>
            ))}
          </AnimatePresence>
          {events.length === 0 ? (
            <p className="font-mono text-[11px] text-muted-foreground">Waiting for the first stage…</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
