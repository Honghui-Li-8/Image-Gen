import { useEffect, useState } from "react";
import type { ApiHealth } from "../types";

export const useApiHealth = (apiUrl: string): ApiHealth => {
  const [health, setHealth] = useState<ApiHealth>({
    status: "checking",
    message: "Checking API connection...",
  });

  useEffect(() => {
    let ignore = false;

    const checkHealth = async () => {
      try {
        const response = await fetch(`${apiUrl}/health`);

        if (!response.ok) {
          throw new Error(`Health check failed with ${response.status}`);
        }

        const data = await response.json();

        if (!ignore) {
          setHealth({
            status: data.ok ? "healthy" : "unhealthy",
            message: data.ok
              ? "API server is healthy"
              : "API server returned an unhealthy status",
            checkedAt: data.timestamp,
          });
        }
      } catch (error) {
        if (!ignore) {
          setHealth({
            status: "offline",
            message: "API server is not reachable",
            detail: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    };

    checkHealth();
    const timer = window.setInterval(checkHealth, 15000);

    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [apiUrl]);

  return health;
};
