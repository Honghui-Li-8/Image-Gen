import { useQuery } from "@tanstack/react-query";
import type { ApiHealth } from "../types";

export const useApiHealth = (apiUrl: string): ApiHealth => {
  const { data, status } = useQuery({
    queryKey: ["health", apiUrl],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/health`);
      if (!response.ok) {
        throw new Error(`Health check failed with ${response.status}`);
      }
      return response.json() as Promise<{ ok: boolean; timestamp?: string }>;
    },
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: false,
  });

  if (status === "pending") {
    return { status: "checking", message: "Checking API connection..." };
  }

  if (status === "error") {
    return { status: "offline", message: "API server is not reachable" };
  }

  return {
    status: data.ok ? "healthy" : "unhealthy",
    message: data.ok
      ? "API server is healthy"
      : "API server returned an unhealthy status",
    checkedAt: data.timestamp,
  };
};
