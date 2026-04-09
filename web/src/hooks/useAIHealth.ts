import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";

type AIHealth = {
  configured: boolean;
  working: boolean;
  error: string;
};

export function useAIHealth() {
  return useQuery({
    queryKey: ["ai-health"],
    queryFn: () => apiFetch<AIHealth>("/api/v1/ai/health"),
    staleTime: 5 * 60 * 1000, // cache for 5 minutes
    retry: false,
  });
}
