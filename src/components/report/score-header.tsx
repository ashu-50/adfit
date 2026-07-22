"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { FitReport } from "@/types/domain";

const GRADE_TONE: Record<string, { ring: string; text: string }> = {
  A: { ring: "stroke-success", text: "text-success" },
  B: { ring: "stroke-success", text: "text-success" },
  C: { ring: "stroke-warning", text: "text-warning" },
  D: { ring: "stroke-destructive", text: "text-destructive" },
  F: { ring: "stroke-destructive", text: "text-destructive" },
};

/**
 * The score is an arc rather than a filled donut so the number stays the
 * loudest element. A grade alone is too coarse to act on and a number alone is
 * hard to place, so both appear together.
 */
export function ScoreHeader({ report }: { report: FitReport }) {
  const tone = GRADE_TONE[report.grade] ?? GRADE_TONE.C!;
  const circumference = 2 * Math.PI * 52;
  const dash = (report.overallScore / 100) * circumference;

  return (
    <div className="flex flex-col items-start gap-6 rounded-lg border border-border bg-card p-6 sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        <svg viewBox="0 0 120 120" className="size-32 -rotate-90" role="img" aria-label={`Score ${report.overallScore} out of 100, grade ${report.grade}`}>
          <circle cx="60" cy="60" r="52" fill="none" strokeWidth="6" className="stroke-muted" />
          <motion.circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            className={tone.ring}
            initial={{ strokeDasharray: `0 ${circumference}` }}
            animate={{ strokeDasharray: `${dash} ${circumference}` }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-3xl font-semibold tracking-tight">{report.overallScore}</span>
          <span className={cn("font-mono text-xs font-medium", tone.text)}>Grade {report.grade}</span>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="label-mono">Verdict</p>
          <p className="text-lg font-medium leading-snug text-balance">{report.verdict}</p>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{report.summary}</p>
        <p className="font-mono text-[11px] text-muted-foreground">
          Confidence {(report.confidence * 100).toFixed(0)}%
        </p>
      </div>
    </div>
  );
}
