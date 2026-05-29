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
