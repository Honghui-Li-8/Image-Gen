import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray } from "drizzle-orm";
import { generationEmitter } from "../db/emitter.js";
import { db } from "../db/index.js";
import { generations } from "../db/schema.js";
import type { Generation, GenerationStatus } from "../db/schema.js";
import { logger } from "../utils/logger.js";

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
    .where(
      and(
        eq(generations.userId, userId),
        inArray(generations.status, IN_FLIGHT_STATUSES)
      )
    );

  return rows.length;
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

  const [generation] = await db
    .select()
    .from(generations)
    .where(eq(generations.id, id));

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

  const [generation] = await db
    .select()
    .from(generations)
    .where(eq(generations.id, generationId));

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
