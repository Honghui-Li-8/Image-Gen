import type { Request, Response } from "express";
import { Router } from "express";
import { fetchGenerationOptions } from "../services/generation.service.js";

export const generationRouter = Router();

generationRouter.get("/generation-options", (_req: Request, res: Response) => {
  res.json(fetchGenerationOptions());
});
