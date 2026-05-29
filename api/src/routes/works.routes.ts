import { asc, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { generationOptions } from "image-gen-shared";
import type { Request, Response } from "express";
import { Router } from "express";
import { db } from "../db/index.js";
import { generations, works } from "../db/schema.js";
import type { Generation, Work } from "../db/schema.js";

export interface WorkConfig {
  selectedModel: string;
  selections: Record<string, string>;
  selectedPreset: string;
  seed: string;
  additionalTags: string[];
  additionalPrompt: string;
}

type WorkWithGenerations = Work & { generations: Generation[] };

export const worksRouter = Router();

worksRouter.get("/works", async (req: Request, res: Response) => {
  const allWorks = await db
    .select()
    .from(works)
    .where(eq(works.userId, req.userId))
    .orderBy(asc(works.createdAt));
  res.json(allWorks);
});

worksRouter.get("/works/:id", async (req: Request, res: Response) => {
  const [work] = await db
    .select()
    .from(works)
    .where(eq(works.id, req.params.id as string));

  if (!work || work.userId !== req.userId) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const workGenerations = await db
    .select()
    .from(generations)
    .where(eq(generations.workId, work.id))
    .orderBy(asc(generations.createdAt));

  const result: WorkWithGenerations = { ...work, generations: workGenerations };
  res.json(result);
});

worksRouter.post("/works", async (req: Request, res: Response) => {
  const body = req.body as { name?: string; duplicateFromId?: string };

  // create mode
  const defaultModel = generationOptions.models[generationOptions.defaultModelId];
  const defaultPreset = defaultModel.outputPresets[0].id;

  const existingWorks = await db
    .select()
    .from(works)
    .where(eq(works.userId, req.userId));

  const config: WorkConfig = {
    selectedModel: generationOptions.defaultModelId,
    selections: {},
    selectedPreset: defaultPreset,
    seed: "",
    additionalTags: [],
    additionalPrompt: "",
  };

  const now = new Date();
  const id = createId();
  const name = body.name ?? `Work ${existingWorks.length + 1}`;

  await db.insert(works).values({
    id,
    userId: req.userId,
    name,
    config,
    activeGenerationId: null,
    createdAt: now,
    updatedAt: now,
  });

  const [newWork] = await db.select().from(works).where(eq(works.id, id));
  res.status(201).json(newWork);
});

worksRouter.patch("/works/:id", (_req: Request, res: Response) => {
  res.status(501).json({ error: "Not implemented" });
});

worksRouter.delete("/works/:id", (_req: Request, res: Response) => {
  res.status(501).json({ error: "Not implemented" });
});
