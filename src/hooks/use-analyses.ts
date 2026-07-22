"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toQuery } from "@/lib/api-client";
import type { AnalysisListItem, PaginationMeta } from "@/types/api";

export type AnalysisFilters = {
  q?: string;
  status?: string;
  projectId?: string;
  sort?: "recent" | "oldest" | "score-desc" | "score-asc";
  page?: number;
  perPage?: number;
};

export const analysisKeys = {
  all: ["analyses"] as const,
  list: (filters: AnalysisFilters) => ["analyses", "list", filters] as const,
  detail: (id: string) => ["analyses", "detail", id] as const,
  status: (id: string) => ["analyses", "status", id] as const,
};

export function useAnalyses(filters: AnalysisFilters = {}) {
  return useQuery({
    queryKey: analysisKeys.list(filters),
    queryFn: async () => {
      const res = await api.get<AnalysisListItem[]>(`/api/analyses${toQuery(filters)}`);
      return { items: res.data, meta: res.meta as PaginationMeta | undefined };
    },
    // A list containing running analyses is stale almost immediately.
    refetchInterval: (query) =>
      query.state.data?.items.some((a) => !["COMPLETED", "FAILED", "CANCELLED"].includes(a.status)) ? 4000 : false,
  });
}

export function useDeleteAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ deleted: true }>(`/api/analyses/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: analysisKeys.all }),
  });
}

export function useRerunAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ id: string }>(`/api/analyses/${id}/rerun`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: analysisKeys.all }),
  });
}
