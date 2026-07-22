"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { analysisKeys } from "./use-analyses";
import type { CreateAnalysisPayload } from "@/types/api";

export function useCreateAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateAnalysisPayload) =>
      (await api.post<{ id: string; status: string }>("/api/analyses", payload)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: analysisKeys.all }),
  });
}
