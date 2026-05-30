import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray } from "drizzle-orm";
import { generationEmitter } from "../db/emitter.js";
import { db } from "../db/index.js";
import { generations } from "../db/schema.js";
import type { Generation, GenerationStatus } from "../db/schema.js";
import { logger } from "../utils/logger.js";
import {
  buildComfyImageFilename,
  fetchComfyHistory,
  getComfyPollIntervalMs,
  getComfyTimeoutMs,
  loadComfyWorkflow,
  patchComfyWorkflow,
  submitComfyWorkflow,
} from "./comfyui.service.js";
import type { ComfyImageRef } from "./comfyui.service.js";
import { buildGenerationPromptInput } from "./prompt-builder.service.js";
import type { GenerationRequestConfig } from "./prompt-builder.service.js";
export type { GenerationRequestConfig } from "./prompt-builder.service.js";

export const GENERATION_UPDATE_EVENT = "generation:update";

const IN_FLIGHT_STATUSES: GenerationStatus[] = ["queued", "running"];
const TERMINAL_STATUSES: GenerationStatus[] = ["completed", "failed"];

export interface GenerationUpdateEvent {
  generationId: string;
  status: GenerationStatus;
  progress?: number;
  imageUrl?: string | null;
  error?: string | null;
}

interface CreateQueuedGenerationInput {
  workId: string;
  userId: string;
  config: GenerationRequestConfig;
}

interface UpdateGenerationStatusInput {
  generationId: string;
  status: GenerationStatus;
  progress?: number;
  imageUrl?: string | null;
  error?: string | null;
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const isTerminalGenerationStatus = (status: GenerationStatus): boolean =>
  TERMINAL_STATUSES.includes(status);

export const countInFlightGenerations = async (userId: string): Promise<number> => {
  const rows = await db
    .select({ id: generations.id })
    .from(generations)
    .where(and(eq(generations.userId, userId), inArray(generations.status, IN_FLIGHT_STATUSES)));

  return rows.length;
};

export const countAllInFlightGenerations = async (): Promise<number> => {
  const rows = await db
    .select({ id: generations.id })
    .from(generations)
    .where(inArray(generations.status, IN_FLIGHT_STATUSES));

  return rows.length;
};

export const failInterruptedGenerations = async (): Promise<number> => {
  const interrupted = await db
    .select({ id: generations.id })
    .from(generations)
    .where(inArray(generations.status, IN_FLIGHT_STATUSES));

  if (interrupted.length === 0) {
    return 0;
  }

  await db
    .update(generations)
    .set({
      status: "failed",
      error: "Generation interrupted by API restart",
      completedAt: new Date(),
    })
    .where(inArray(generations.status, IN_FLIGHT_STATUSES));

  logger.warn("generation.interrupted.failed", {
    count: interrupted.length,
  });

  return interrupted.length;
};

export const createQueuedGeneration = async ({
  workId,
  userId,
  config,
}: CreateQueuedGenerationInput): Promise<Generation> => {
  const now = new Date();
  const id = createId();

  await db.insert(generations).values({
    id,
    workId,
    userId,
    status: "queued",
    promptId: null,
    config,
    workflowSnapshot: {},
    imageUrl: null,
    error: null,
    scheduledAt: now,
    createdAt: now,
    completedAt: null,
  });

  const [generation] = await db.select().from(generations).where(eq(generations.id, id));

  return generation;
};

export const emitGenerationUpdate = (event: GenerationUpdateEvent): void => {
  generationEmitter.emit(GENERATION_UPDATE_EVENT, event);
  logger.debug("generation.progress.emitted", {
    generationId: event.generationId,
    progress: event.progress,
    status: event.status,
  });
};

export const updateGenerationStatus = async ({
  generationId,
  status,
  progress,
  imageUrl,
  error,
}: UpdateGenerationStatusInput): Promise<Generation> => {
  const patch: Partial<typeof generations.$inferInsert> = {
    status,
    completedAt: isTerminalGenerationStatus(status) ? new Date() : null,
  };

  if (imageUrl !== undefined) {
    patch.imageUrl = imageUrl;
  }
  if (error !== undefined) {
    patch.error = error;
  }

  await db.update(generations).set(patch).where(eq(generations.id, generationId));

  const [generation] = await db.select().from(generations).where(eq(generations.id, generationId));

  emitGenerationUpdate({
    generationId,
    status,
    progress,
    imageUrl: generation.imageUrl,
    error: generation.error,
  });
  logger.info("generation.status.updated", {
    generationId,
    progress,
    status,
  });

  return generation;
};

export const runStubGeneration = async (generationId: string): Promise<void> => {
  try {
    await delay(250);
    await updateGenerationStatus({ generationId, status: "running", progress: 10 });

    for (const progress of [30, 60, 90]) {
      await delay(250);
      emitGenerationUpdate({ generationId, status: "running", progress });
    }

    await delay(250);
    await updateGenerationStatus({
      generationId,
      status: "completed",
      progress: 100,
      imageUrl: null,
    });
    logger.info("generation.stub.completed", { generationId });
  } catch (error) {
    try {
      await updateGenerationStatus({
        generationId,
        status: "failed",
        progress: 100,
        error: error instanceof Error ? error.message : "Generation failed",
      });
      logger.error("generation.stub.failed", {
        error: error instanceof Error ? error.message : "Generation failed",
        generationId,
      });
    } catch {
      // The work may have been deleted while the stub worker was running.
    }
  }
};

const getGeneration = async (generationId: string): Promise<Generation | null> => {
  const [generation] = await db.select().from(generations).where(eq(generations.id, generationId));
  return generation ?? null;
};

const updateGenerationComfyFields = async ({
  generationId,
  promptId,
  workflowSnapshot,
}: {
  generationId: string;
  promptId?: string;
  workflowSnapshot?: unknown;
}): Promise<void> => {
  const patch: Partial<typeof generations.$inferInsert> = {};
  if (promptId !== undefined) patch.promptId = promptId;
  if (workflowSnapshot !== undefined) patch.workflowSnapshot = workflowSnapshot;
  if (Object.keys(patch).length === 0) return;
  await db.update(generations).set(patch).where(eq(generations.id, generationId));
};

const extractComfyImageFilename = (history: unknown, promptId: string): string | null => {
  if (typeof history !== "object" || history === null) return null;
  const entry = (history as Record<string, unknown>)[promptId];
  if (typeof entry !== "object" || entry === null) return null;
  const outputs = (entry as Record<string, unknown>).outputs;
  if (typeof outputs !== "object" || outputs === null) return null;

  for (const nodeOutput of Object.values(outputs as Record<string, unknown>)) {
    if (typeof nodeOutput !== "object" || nodeOutput === null) continue;
    const images = (nodeOutput as Record<string, unknown>).images;
    if (!Array.isArray(images) || images.length === 0) continue;
    const ref = images[0] as Record<string, unknown>;
    if (typeof ref.filename !== "string") continue;
    return buildComfyImageFilename({
      filename: ref.filename,
      subfolder: typeof ref.subfolder === "string" ? ref.subfolder : undefined,
      type: typeof ref.type === "string" ? ref.type : undefined,
    } satisfies ComfyImageRef);
  }

  return null;
};

export const runComfyGeneration = async (generationId: string): Promise<void> => {
  try {
    await delay(250);
    await updateGenerationStatus({ generationId, status: "running", progress: 10 });

    const generation = await getGeneration(generationId);
    if (!generation) throw new Error("Generation not found");

    logger.info("generation.comfy.building", { generationId });
    const config = generation.config as GenerationRequestConfig;
    const promptInput = buildGenerationPromptInput(config);

    const workflow = await loadComfyWorkflow(promptInput.workflowFile);
    const patched = patchComfyWorkflow(workflow, promptInput);

    await updateGenerationComfyFields({ generationId, workflowSnapshot: patched });

    const promptId = await submitComfyWorkflow(patched);
    await updateGenerationComfyFields({ generationId, promptId });
    await updateGenerationStatus({ generationId, status: "running", progress: 15 });
    logger.info("generation.comfy.submitted", { generationId, promptId });

    const startedAt = Date.now();
    const timeoutMs = getComfyTimeoutMs();
    let progress = 15;

    while (Date.now() - startedAt < timeoutMs) {
      await delay(getComfyPollIntervalMs());
      const history = await fetchComfyHistory(promptId);
      const imageUrl = extractComfyImageFilename(history, promptId);

      if (imageUrl !== null) {
        await updateGenerationStatus({
          generationId,
          status: "completed",
          progress: 100,
          imageUrl,
        });
        logger.info("generation.comfy.completed", { generationId, imageUrl });
        return;
      }

      progress = Math.min(progress + 5, 90);
      emitGenerationUpdate({ generationId, status: "running", progress });
    }

    throw new Error(`ComfyUI generation timed out after ${timeoutMs}ms`);
  } catch (error) {
    try {
      await updateGenerationStatus({
        generationId,
        status: "failed",
        progress: 100,
        error: error instanceof Error ? error.message : "Generation failed",
      });
      logger.error("generation.comfy.failed", {
        error: error instanceof Error ? error.message : "Generation failed",
        generationId,
      });
    } catch {
      // The work may have been deleted while the worker was running.
    }
  }
};
