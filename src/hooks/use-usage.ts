"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { UsagePayload } from "@/types/api";

export function useUsage() {
  return useQuery({
    queryKey: ["usage"],
    queryFn: async () => (await api.get<UsagePayload>("/api/usage")).data,
    staleTime: 30_000,
  });
}
