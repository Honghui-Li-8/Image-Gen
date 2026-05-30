import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { Router } from "express";
import { db } from "../db/index.js";
import { generationEmitter } from "../db/emitter.js";
import { resolveTokenUserId } from "../db/token-store.js";
import { generations, works } from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  GENERATION_UPDATE_EVENT,
  countInFlightGenerations,
  createQueuedGeneration,
  isTerminalGenerationStatus,
  runComfyGeneration,
} from "../services/generation-job.service.js";
import type {
  GenerationRequestConfig,
  GenerationUpdateEvent,
} from "../services/generation-job.service.js";
import {
  buildSignedImageUrl,
  serializeGenerationImageUrl,
} from "../services/image-url.service.js";
import { logger } from "../utils/logger.js";

const MAX_IN_FLIGHT_GENERATIONS = Number(process.env.COMFYUI_MAX_ACTIVE_JOBS ?? "1");

export const generationsRouter = Router();

const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((entry) => typeof entry === "string");

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const getRequestToken = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice(7);
  }

  return typeof req.query.token === "string" ? req.query.token : null;
};

const writeSseEvent = (
  res: Response,
  eventName: string,
  payload: object
): void => {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const serializeGenerationUpdate = (
  event: GenerationUpdateEvent
): GenerationUpdateEvent => ({
  ...event,
  imageUrl:
    event.imageUrl === undefined
      ? undefined
      : serializeGenerationImageUrl(event.status, event.imageUrl),
});

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
    const startedAt = Date.now();
    const requestedWorkId = req.params.workId as string;
    logger.info("generation.create.requested", {
      userId: req.userId,
      workId: requestedWorkId,
    });

    const [work] = await db
      .select()
      .from(works)
      .where(eq(works.id, requestedWorkId));

    if (!work || work.userId !== req.userId) {
      logger.warn("generation.create.rejected", {
        reason: "work_not_found",
        userId: req.userId,
        workId: requestedWorkId,
      });
      res.status(404).json({ error: "Not found" });
      return;
    }

    const config = parseGenerationConfig(req.body);
    if (!config) {
      logger.warn("generation.create.rejected", {
        reason: "invalid_body",
        userId: req.userId,
        workId: work.id,
      });
      res.status(400).json({ error: "Invalid generation request" });
      return;
    }

    const inFlightCount = await countInFlightGenerations(req.userId);
    if (inFlightCount >= MAX_IN_FLIGHT_GENERATIONS) {
      logger.warn("generation.create.rejected", {
        inFlightCount,
        reason: "queue_limit",
        userId: req.userId,
        workId: work.id,
      });
      res.status(429).json({ error: "GPU busy, try again shortly" });
      return;
    }

    const generation = await createQueuedGeneration({
      workId: work.id,
      userId: req.userId,
      config,
    });
    logger.info("generation.created", {
      generationId: generation.id,
      status: generation.status,
      userId: req.userId,
      workId: work.id,
    });

    await db
      .update(works)
      .set({ activeGenerationId: generation.id, updatedAt: new Date() })
      .where(eq(works.id, work.id));

    logger.info("generation.worker.started", {
      generationId: generation.id,
      userId: req.userId,
      workId: work.id,
    });
    void runComfyGeneration(generation.id);

    logger.info("generation.create.accepted", {
      durationMs: Date.now() - startedAt,
      generationId: generation.id,
      userId: req.userId,
      workId: work.id,
    });
    res.status(202).json({
      generationId: generation.id,
      status: generation.status,
    });
  }
);

generationsRouter.delete(
  "/generations/:generationId",
  authMiddleware,
  async (req: Request, res: Response) => {
    const generationId = req.params.generationId as string;

    const [generation] = await db
      .select()
      .from(generations)
      .where(eq(generations.id, generationId));

    if (!generation || generation.userId !== req.userId) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await db.delete(generations).where(eq(generations.id, generationId));
    logger.info("generation.deleted", { generationId, userId: req.userId });
    res.status(204).send();
  }
);

generationsRouter.get(
  "/generations/:generationId/image-token",
  authMiddleware,
  async (req: Request, res: Response) => {
    const generationId = req.params.generationId as string;

    const [generation] = await db
      .select()
      .from(generations)
      .where(eq(generations.id, generationId));

    if (!generation || generation.userId !== req.userId) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    if (generation.status !== "completed" || !generation.imageUrl) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    res.json({ url: buildSignedImageUrl(generation.imageUrl) });
  }
);

generationsRouter.get(
  "/generations/:generationId/status",
  async (req: Request, res: Response) => {
    const generationId = req.params.generationId as string;
    const startedAt = Date.now();
    const token = getRequestToken(req);
    const userId = token ? resolveTokenUserId(token) : null;

    if (!userId) {
      logger.warn("generation.sse.rejected", {
        generationId,
        reason: "unauthorized",
      });
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [generation] = await db
      .select()
      .from(generations)
      .where(eq(generations.id, generationId));

    if (!generation || generation.userId !== userId) {
      logger.warn("generation.sse.rejected", {
        generationId,
        reason: "generation_not_found",
        userId,
      });
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    logger.info("generation.sse.opened", {
      generationId: generation.id,
      status: generation.status,
      userId,
    });
    writeSseEvent(res, "status", {
      generationId: generation.id,
      status: generation.status,
      imageUrl: serializeGenerationImageUrl(generation.status, generation.imageUrl),
      error: generation.error,
    });

    if (isTerminalGenerationStatus(generation.status)) {
      logger.info("generation.sse.terminal_sent", {
        durationMs: Date.now() - startedAt,
        generationId: generation.id,
        status: generation.status,
        userId,
      });
      res.end();
      return;
    }

    let closed = false;
    const cleanup = () => {
      if (closed) {
        return;
      }
      closed = true;
      clearInterval(pingInterval);
      generationEmitter.off(GENERATION_UPDATE_EVENT, onGenerationUpdate);
      logger.info("generation.sse.closed", {
        durationMs: Date.now() - startedAt,
        generationId: generation.id,
        userId,
      });
    };

    const onGenerationUpdate = (event: GenerationUpdateEvent) => {
      if (event.generationId !== generation.id || closed) {
        return;
      }

      writeSseEvent(res, "status", serializeGenerationUpdate(event));
      logger.debug("generation.sse.event_sent", {
        generationId: event.generationId,
        progress: event.progress,
        status: event.status,
        userId,
      });

      if (isTerminalGenerationStatus(event.status)) {
        cleanup();
        res.end();
      }
    };

    const pingInterval = setInterval(() => {
      writeSseEvent(res, "ping", { timestamp: new Date().toISOString() });
    }, 20_000);

    generationEmitter.on(GENERATION_UPDATE_EVENT, onGenerationUpdate);
    req.on("close", cleanup);
  }
);
