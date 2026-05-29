import type { Request, Response } from "express";
import { Router } from "express";

export interface WorkConfig {
  selectedModel: string;
  selections: Record<string, string>;
  selectedPreset: string;
  seed: string;
  additionalTags: string[];
  additionalPrompt: string;
}

export const worksRouter = Router();

worksRouter.get("/works", (_req: Request, res: Response) => {
  res.status(501).json({ error: "Not implemented" });
});

worksRouter.get("/works/:id", (_req: Request, res: Response) => {
  res.status(501).json({ error: "Not implemented" });
});

worksRouter.post("/works", (_req: Request, res: Response) => {
  res.status(501).json({ error: "Not implemented" });
});

worksRouter.patch("/works/:id", (_req: Request, res: Response) => {
  res.status(501).json({ error: "Not implemented" });
});

worksRouter.delete("/works/:id", (_req: Request, res: Response) => {
  res.status(501).json({ error: "Not implemented" });
});
