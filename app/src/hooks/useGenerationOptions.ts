import { useEffect, useState } from "react";
import type { GenerationOptions } from "../types";

type OptionsStatus = "loading" | "ready" | "failed";

export const useGenerationOptions = (
  apiUrl: string,
): { options: GenerationOptions | null; optionsStatus: OptionsStatus } => {
  const [options, setOptions] = useState<GenerationOptions | null>(null);
  const [optionsStatus, setOptionsStatus] =
    useState<OptionsStatus>("loading");

  useEffect(() => {
    let ignore = false;

    const loadGenerationOptions = async () => {
      try {
        const response = await fetch(`${apiUrl}/generation-options`);

        if (!response.ok) {
          throw new Error(`Options request failed with ${response.status}`);
        }

        const data = (await response.json()) as GenerationOptions;

        if (!ignore) {
          setOptions(data);
          setOptionsStatus("ready");
        }
      } catch (error) {
        if (!ignore) {
          setOptionsStatus("failed");
          console.error(error);
        }
      }
    };

    loadGenerationOptions();

    return () => {
      ignore = true;
    };
  }, [apiUrl]);

  return { options, optionsStatus };
};
