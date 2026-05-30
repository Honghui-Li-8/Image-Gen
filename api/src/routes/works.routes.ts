import { and, asc, eq, inArray } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { generationOptions } from "image-gen-shared";
import type { Request, Response } from "express";
import { Router } from "express";
import { db } from "../db/index.js";
import { generations, works } from "../db/schema.js";
import type { Generation, Work } from "../db/schema.js";
import { serializeGenerationImageUrl } from "../services/image-url.service.js";

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

const serializeGenerationForResponse = (generation: Generation): Generation => ({
  ...generation,
  imageUrl: serializeGenerationImageUrl(generation.status, generation.imageUrl),
});

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

  const result: WorkWithGenerations = {
    ...work,
    generations: workGenerations.map(serializeGenerationForResponse),
  };
  res.json(result);
});

worksRouter.post("/works", async (req: Request, res: Response) => {
  const body = req.body as { name?: string; duplicateFromId?: string };

  // duplicate mode
  if (body.duplicateFromId) {
    const [source] = await db.select().from(works).where(eq(works.id, body.duplicateFromId));

    if (!source || source.userId !== req.userId) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const terminalGenerations = await db
      .select()
      .from(generations)
      .where(
        and(eq(generations.workId, source.id), inArray(generations.status, ["completed", "failed"]))
      );

    const idMap = new Map<string, string>();
    for (const g of terminalGenerations) {
      idMap.set(g.id, createId());
    }

    const now = new Date();
    const newWorkId = createId();
    const newActiveGenerationId = source.activeGenerationId
      ? (idMap.get(source.activeGenerationId) ?? null)
      : null;

    await db.insert(works).values({
      id: newWorkId,
      userId: req.userId,
      name: body.name ?? `Copy of ${source.name}`,
      config: source.config,
      activeGenerationId: newActiveGenerationId,
      createdAt: now,
      updatedAt: now,
    });

    const copiedGenerations = [];
    for (const g of terminalGenerations) {
      const newGen = {
        id: idMap.get(g.id)!,
        workId: newWorkId,
        userId: req.userId,
        status: g.status,
        promptId: null,
        config: g.config,
        workflowSnapshot: g.workflowSnapshot,
        imageUrl: g.imageUrl,
        error: g.error,
        scheduledAt: g.scheduledAt,
        createdAt: g.createdAt,
        completedAt: g.completedAt,
      };
      await db.insert(generations).values(newGen);
      copiedGenerations.push(serializeGenerationForResponse(newGen));
    }

    const [newWork] = await db.select().from(works).where(eq(works.id, newWorkId));
    res.status(201).json({ ...newWork, generations: copiedGenerations });
    return;
  }

  // create mode
  const defaultModel = generationOptions.models[generationOptions.defaultModelId];
  const defaultPreset = defaultModel.outputPresets[0].id;

  const existingWorks = await db.select().from(works).where(eq(works.userId, req.userId));

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

worksRouter.patch("/works/:id", async (req: Request, res: Response) => {
  const [work] = await db
    .select()
    .from(works)
    .where(eq(works.id, req.params.id as string));

  if (!work || work.userId !== req.userId) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const body = req.body as {
    name?: string;
    config?: Partial<WorkConfig>;
    activeGenerationId?: string;
  };

  if (body.activeGenerationId !== undefined) {
    const [gen] = await db
      .select()
      .from(generations)
      .where(eq(generations.id, body.activeGenerationId));

    if (!gen) {
      res.status(404).json({ error: "Generation not found" });
      return;
    }
    if (gen.workId !== work.id) {
      res.status(400).json({ error: "Generation does not belong to this work" });
      return;
    }
  }

  const mergedConfig = body.config
    ? { ...(work.config as WorkConfig), ...body.config }
    : (work.config as WorkConfig);

  const patch: Record<string, unknown> = { config: mergedConfig, updatedAt: new Date() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.activeGenerationId !== undefined) patch.activeGenerationId = body.activeGenerationId;

  await db.update(works).set(patch).where(eq(works.id, work.id));

  const [updated] = await db.select().from(works).where(eq(works.id, work.id));
  res.json(updated);
});

worksRouter.delete("/works/:id", async (req: Request, res: Response) => {
  const [work] = await db
    .select()
    .from(works)
    .where(eq(works.id, req.params.id as string));

  if (!work || work.userId !== req.userId) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.delete(works).where(eq(works.id, work.id));
  res.status(204).send();
});
