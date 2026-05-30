import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GenerationOptions, OptionsStatus } from "../types";
import { ApiError, apiFetch } from "../utils/api";

export const useGenerationOptions = (
  apiUrl: string,
  token: string | null,
  onUnauthorized: () => void,
): { options: GenerationOptions | null; optionsStatus: OptionsStatus; refetchOptions: () => void } => {
  const { data, status, error, refetch } = useQuery({
    queryKey: ["generation-options", apiUrl],
    queryFn: async () => {
      const response = await apiFetch(`${apiUrl}/generation-options`, { token: token! });
      return (await response.json()) as GenerationOptions;
    },
    staleTime: Infinity,
    retry: 2,
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      onUnauthorized();
    }
  }, [error, onUnauthorized]);

  const optionsStatus: OptionsStatus =
    !token || status === "pending" ? "loading"
    : status === "error" ? "failed"
    : "ready";

  return { options: data ?? null, optionsStatus, refetchOptions: refetch };
};
