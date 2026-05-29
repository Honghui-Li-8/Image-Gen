import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { Router } from "express";
import { db } from "../db/index.js";
import { generations, works } from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  countInFlightGenerations,
  createQueuedGeneration,
  runStubGeneration,
} from "../services/generation-job.service.js";
import type { GenerationRequestConfig } from "../services/generation-job.service.js";

const MAX_IN_FLIGHT_GENERATIONS = 3;

export const generationsRouter = Router();

const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((entry) => typeof entry === "string");

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const parseGenerationConfig = (value: unknown): GenerationRequestConfig | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const body = value as Record<string, unknown>;
  if (
    typeof body.modelId !== "string" ||
    !isStringRecord(body.selections) ||
    typeof body.selectedPreset !== "string" ||
    typeof body.seed !== "string" ||
    !isStringArray(body.additionalTags) ||
    typeof body.additionalPrompt !== "string"
  ) {
    return null;
  }

  return {
    modelId: body.modelId,
    selections: body.selections,
    selectedPreset: body.selectedPreset,
    seed: body.seed,
    additionalTags: body.additionalTags,
    additionalPrompt: body.additionalPrompt,
  };
};

generationsRouter.post(
  "/works/:workId/generations",
  authMiddleware,
  async (req: Request, res: Response) => {
    const [work] = await db
      .select()
      .from(works)
      .where(eq(works.id, req.params.workId as string));

    if (!work || work.userId !== req.userId) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const config = parseGenerationConfig(req.body);
    if (!config) {
      res.status(400).json({ error: "Invalid generation request" });
      return;
    }

    const inFlightCount = await countInFlightGenerations(req.userId);
    if (inFlightCount >= MAX_IN_FLIGHT_GENERATIONS) {
      res.status(429).json({ error: "Too many active generations" });
      return;
    }

    const generation = await createQueuedGeneration({
      workId: work.id,
      userId: req.userId,
      config,
    });

    await db
      .update(works)
      .set({ activeGenerationId: generation.id, updatedAt: new Date() })
      .where(eq(works.id, work.id));

    void runStubGeneration(generation.id);

    res.status(202).json({
      generationId: generation.id,
      status: generation.status,
    });
  }
);
