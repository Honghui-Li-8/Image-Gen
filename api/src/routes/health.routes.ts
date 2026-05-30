import type { Request, Response } from "express";
import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Image Gen API" });
});

healthRouter.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    status: "healthy",
    service: "image-gen-api",
    timestamp: new Date().toISOString()
  });
});

const getProxyUrl = (): string => {
  const url = process.env.PROXY_URL ?? "http://localhost:3001";
  return url.endsWith("/") ? url.slice(0, -1) : url;
};

healthRouter.get("/comfy-health", async (_req: Request, res: Response) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(`${getProxyUrl()}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const body = (await response.json()) as unknown;
    res.status(response.ok ? response.status : 502).json(body);
  } catch {
    clearTimeout(timeout);
    res.status(502).json({ error: "ComfyUI proxy unreachable" });
  }
});
