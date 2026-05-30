import { useCallback, useEffect, useState } from "react";

const POLL_INTERVAL = 10 * 60 * 1000;

interface ComfyHealthResponse {
  comfyui?: { reachable: boolean };
}

export const useComfyHealth = (apiUrl: string) => {
  const [reachable, setReachable] = useState<boolean | null>(null);

  const check = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/comfy-health`);
      if (!response.ok) {
        setReachable(false);
        return;
      }
      const data = (await response.json()) as ComfyHealthResponse;
      setReachable(data.comfyui?.reachable ?? false);
    } catch {
      setReachable(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), POLL_INTERVAL);
    return () => window.clearInterval(timer);
  }, [check]);

  const recheckNow = useCallback(() => void check(), [check]);

  return { reachable, recheckNow };
};
