"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, round } from "@/lib/utils";
import { DIMENSION_LABELS, DIMENSION_QUESTIONS, type DimensionResult } from "@/types/domain";
import { ProblemItem, RecommendationItem } from "./findings";

function toneFor(score: number): { bar: string; text: string } {
  if (score >= 70) return { bar: "bg-success", text: "text-success" };
  if (score >= 55) return { bar: "bg-warning", text: "text-warning" };
  return { bar: "bg-destructive", text: "text-destructive" };
}

function DimensionRow({ dimension }: { dimension: DimensionResult }) {
  const [open, setOpen] = React.useState(false);
  const tone = toneFor(dimension.score);
  const hasDetail = dimension.problems.length > 0 || dimension.recommendations.length > 0;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{DIMENSION_LABELS[dimension.dimension]}</span>
            {!dimension.applicable ? (
              <Badge variant="secondary" className="font-mono text-[10px]">
                not scored
              </Badge>
            ) : null}
            {dimension.confidence < 0.6 ? (
              <Badge variant="outline" className="font-mono text-[10px]">
                low confidence
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">{DIMENSION_QUESTIONS[dimension.dimension]}</p>
        </div>

        {/* Weight is shown because a low score on a 5% dimension is not the
            same problem as a low score on an 18% one. */}
        <span className="hidden font-mono text-[11px] text-muted-foreground sm:block">
          {round(dimension.weight * 100)}%
        </span>

        <div className="flex w-28 items-center gap-2.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <motion.div
              className={cn("h-full rounded-full", tone.bar)}
              initial={{ width: 0 }}
              animate={{ width: `${dimension.applicable ? dimension.score : 0}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
          <span className={cn("w-6 text-right font-mono text-xs font-medium", tone.text)}>
            {dimension.applicable ? dimension.score : "—"}
          </span>
        </div>

        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-5 border-t border-border bg-muted/20 px-5 py-5">
              <p className="text-sm leading-relaxed text-muted-foreground">{dimension.summary}</p>

              {dimension.problems.map((problem) => (
                <ProblemItem key={problem.id} problem={problem} />
              ))}
              {dimension.recommendations.map((recommendation) => (
                <RecommendationItem key={recommendation.id} recommendation={recommendation} />
              ))}

              {!hasDetail ? (
                <p className="text-sm text-muted-foreground">Nothing further to flag on this dimension.</p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function DimensionBreakdown({ dimensions }: { dimensions: DimensionResult[] }) {
  // Worst first: the report is a to-do list, not a scorecard.
  const ordered = [...dimensions].sort((a, b) => {
    if (a.applicable !== b.applicable) return a.applicable ? -1 : 1;
    return a.score - b.score;
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base">Dimension breakdown</CardTitle>
        <p className="text-sm text-muted-foreground">Worst first. Open any row for the evidence and the fix.</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-col divide-y divide-border border-t border-border">
          {ordered.map((dimension) => (
            <DimensionRow key={dimension.dimension} dimension={dimension} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
