"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { analysisKeys } from "./use-analyses";
import type { AnalysisDetail } from "@/types/api";

export function useAnalysis(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: analysisKeys.detail(id),
    queryFn: async () => (await api.get<AnalysisDetail>(`/api/analyses/${id}`)).data,
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}
