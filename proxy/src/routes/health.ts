import type { RequestHandler } from "express";
import { getComfyUrl } from "../config.js";

export const healthHandler: RequestHandler = async (_req, res) => {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);

  try {
    const response = await fetch(`${getComfyUrl()}/system_stats`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      res.json({ status: "degraded", comfyui: { reachable: false } });
      return;
    }

    res.json({
      status: "ok",
      comfyui: {
        reachable: true,
        latencyMs: Date.now() - startedAt,
      },
    });
  } catch {
    clearTimeout(timeout);
    res.json({ status: "degraded", comfyui: { reachable: false } });
  }
};
