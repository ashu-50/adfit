"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type DiffPair = {
  label: string;
  ad: string;
  page: string;
  verdict: "match" | "drift" | "break";
};

const VERDICT = {
  match: { text: "kept", className: "text-success", rule: "bg-success/40" },
  drift: { text: "diluted", className: "text-warning", rule: "bg-warning/40" },
  break: { text: "broken", className: "text-destructive", rule: "bg-destructive/50" },
} as const;

/**
 * The signature element of the product: the ad's claim and the page's answer on
 * one line, with the verdict between them. Every other view in the app is a
 * summary of this comparison, so the comparison itself is what the interface is
 * built around rather than a score dial.
 */
export function PromiseDiff({ pairs, animate = false }: { pairs: DiffPair[]; animate?: boolean }) {
  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 bg-muted/40 px-4 py-2.5">
        <span className="label-mono">The ad promised</span>
        <span className="label-mono text-center">verdict</span>
        <span className="label-mono">The page delivered</span>
      </div>

      {pairs.map((pair, i) => {
        const verdict = VERDICT[pair.verdict];
        return (
          <motion.div
            key={pair.label}
            initial={animate ? { opacity: 0, y: 8 } : false}
            animate={animate ? { opacity: 1, y: 0 } : undefined}
            transition={{ delay: 0.25 + i * 0.09, duration: 0.4, ease: "easeOut" }}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-4"
          >
            <div className="flex flex-col gap-1">
              <span className="label-mono">{pair.label}</span>
              <p className="font-mono text-sm leading-snug text-foreground">{pair.ad}</p>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <div className={cn("h-px w-8", verdict.rule)} />
              <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
              <span className={cn("font-mono text-[10px] uppercase tracking-[0.14em]", verdict.className)}>
                {verdict.text}
              </span>
            </div>

            <p
              className={cn(
                "font-mono text-sm leading-snug",
                pair.verdict === "match" ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {pair.page}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}
