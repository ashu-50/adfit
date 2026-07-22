"use client";

import * as React from "react";
import Link from "next/link";
import { formatDistanceStrict } from "@/lib/format";
import { BarChart3, Loader2, MoreHorizontal, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useAnalyses, useDeleteAnalysis, useRerunAnalysis, type AnalysisFilters } from "@/hooks/use-analyses";
import { ScoreBadge } from "@/components/shared/score-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { hostnameOf } from "@/lib/utils";
import type { AnalysisListItem } from "@/types/api";

const RUNNING = new Set(["QUEUED", "EXTRACTING", "OCR", "ANALYZING", "SCORING"]);

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function StatusCell({ analysis }: { analysis: AnalysisListItem }) {
  if (analysis.status === "FAILED") {
    return (
      <Badge variant="destructive">
        <TriangleAlert className="size-3" />
        Failed
      </Badge>
    );
  }
  if (RUNNING.has(analysis.status)) {
    return (
      <div className="flex w-32 flex-col gap-1.5">
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          {analysis.stage ?? analysis.status.toLowerCase()}
        </span>
        <Progress value={analysis.progress} />
      </div>
    );
  }
  return <ScoreBadge score={analysis.overallScore} grade={analysis.grade} />;
}

export function AnalysisList({ compact = false, pageSize = 20 }: { compact?: boolean; pageSize?: number }) {
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<NonNullable<AnalysisFilters["sort"]>>("recent");
  const debouncedSearch = useDebounced(search);

  const filters: AnalysisFilters = compact
    ? { perPage: pageSize }
    : { q: debouncedSearch || undefined, sort, perPage: pageSize };

  const { data, isPending, isError, error } = useAnalyses(filters);
  const remove = useDeleteAnalysis();
  const rerun = useRerunAnalysis();

  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: compact ? 3 : 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Could not load your analyses"
        description={error instanceof Error ? error.message : "Refresh the page to try again."}
      />
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      {!compact ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or URL"
            className="sm:max-w-xs"
            aria-label="Search analyses"
          />
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="sm:w-44">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="recent">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="score-desc">Best score</SelectItem>
                <SelectItem value="score-asc">Worst score</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title={debouncedSearch ? "Nothing matched that search" : "No analyses yet"}
          description={
            debouncedSearch
              ? "Try a different title or URL."
              : "Add your ads and a landing page URL, and the first report takes about thirty seconds."
          }
          action={
            debouncedSearch ? null : (
              <Button asChild size="sm">
                <Link href="/new">Run your first analysis</Link>
              </Button>
            )
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
          {items.map((analysis) => (
            <li key={analysis.id} className="group flex items-center gap-4 bg-card px-4 py-3 transition-colors hover:bg-accent/40">
              <Link href={`/analyses/${analysis.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-sm font-medium">{analysis.title}</span>
                <span className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <span className="truncate">{hostnameOf(analysis.targetUrl)}</span>
                  <span aria-hidden>·</span>
                  <span>{analysis._count.ads} {analysis._count.ads === 1 ? "ad" : "ads"}</span>
                  <span aria-hidden>·</span>
                  <span>{formatDistanceStrict(analysis.createdAt)}</span>
                </span>
              </Link>

              {analysis.project ? (
                <span className="hidden items-center gap-1.5 md:flex">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: analysis.project.color }}
                    aria-hidden
                  />
                  <span className="text-xs text-muted-foreground">{analysis.project.name}</span>
                </span>
              ) : null}

              <StatusCell analysis={analysis} />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Actions for ${analysis.title}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onSelect={() =>
                        rerun.mutate(analysis.id, {
                          onSuccess: () => toast.success("Re-running. It appears as a new analysis so you keep the old one."),
                          onError: (err) => toast.error(err instanceof Error ? err.message : "Could not re-run."),
                        })
                      }
                    >
                      <RefreshCw />
                      Run again
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        remove.mutate(analysis.id, {
                          onSuccess: () => toast.success("Analysis deleted."),
                          onError: (err) => toast.error(err instanceof Error ? err.message : "Could not delete."),
                        })
                      }
                    >
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      {!compact && data?.meta && data.meta.total > items.length ? (
        <p className="text-center font-mono text-xs text-muted-foreground">
          Showing {items.length} of {data.meta.total}
        </p>
      ) : null}
    </div>
  );
}
