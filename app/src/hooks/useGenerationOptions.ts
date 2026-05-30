import { useEffect, useState } from "react";
import type { GenerationOptions, OptionsStatus } from "../types";
import { ApiError, apiFetch } from "../utils/api";

export const useGenerationOptions = (
  apiUrl: string,
  token: string | null,
  onUnauthorized: () => void,
): { options: GenerationOptions | null; optionsStatus: OptionsStatus } => {
  const [options, setOptions] = useState<GenerationOptions | null>(null);
  const [optionsStatus, setOptionsStatus] =
    useState<OptionsStatus>("loading");

  useEffect(() => {
    if (!token) {
      setOptions(null);
      setOptionsStatus("loading");
      return undefined;
    }

    let ignore = false;

    const loadGenerationOptions = async () => {
      try {
        const response = await apiFetch(`${apiUrl}/generation-options`, { token });
        const data = (await response.json()) as GenerationOptions;

        if (!ignore) {
          setOptions(data);
          setOptionsStatus("ready");
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          onUnauthorized();
          return;
        }

        if (!ignore) {
          setOptions(null);
          setOptionsStatus("failed");
          console.error(error);
        }
      }
    };

    loadGenerationOptions();

    return () => {
      ignore = true;
    };
  }, [apiUrl, onUnauthorized, token]);

  return { options, optionsStatus };
};
