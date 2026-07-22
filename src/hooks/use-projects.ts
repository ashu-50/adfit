"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Project } from "@/types/api";

export const projectKeys = { all: ["projects"] as const };

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: async () => (await api.get<Project[]>("/api/projects")).data,
    staleTime: 60_000,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string; color?: string }) =>
      api.post<Project>("/api/projects", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ deleted: true }>(`/api/projects/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
}
