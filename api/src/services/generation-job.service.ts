import { createId } from "@paralleldrive/cuid2";
import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { WebSocket } from "ws";
import { generationEmitter } from "../db/emitter.js";
import { db } from "../db/index.js";
import { generations } from "../db/schema.js";
import type { Generation, GenerationStatus } from "../db/schema.js";
import { logger } from "../utils/logger.js";
import {
  buildComfyImageFilename,
  connectComfyWebSocket,
  fetchComfyHistory,
  getComfyPollIntervalMs,
  getComfyTimeoutMs,
  loadComfyWorkflow,
  patchComfyWorkflow,
  parseComfyWsMessage,
  submitComfyWorkflow,
} from "./comfyui.service.js";
import type { ComfyWsEvent, Workflow, WorkflowNode } from "./comfyui.service.js";
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
  detail?: GenerationProgressDetail;
}

export interface GenerationProgressDetail {
  stage?: "queued" | "executing" | "sampling" | "finalizing" | "completed" | "failed";
  nodeId?: string;
  nodeLabel?: string;
  step?: number;
  totalSteps?: number;
  message?: string;
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
  detail?: GenerationProgressDetail;
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
  detail,
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
    detail,
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
    });
  }

  return null;
};

const extractComfyFailureMessage = (history: unknown, promptId: string): string | null => {
  if (typeof history !== "object" || history === null) return null;
  const entry = (history as Record<string, unknown>)[promptId];
  if (typeof entry !== "object" || entry === null) return null;
  const status = (entry as Record<string, unknown>).status;
  if (typeof status !== "object" || status === null) return null;
  const statusRecord = status as Record<string, unknown>;
  const completed = statusRecord.completed;
  const statusStr = typeof statusRecord.status_str === "string" ? statusRecord.status_str : "";

  if (completed === false || statusStr.toLowerCase().includes("error")) {
    const messages = statusRecord.messages;
    if (Array.isArray(messages)) {
      const message = messages
        .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
        .find((entry) => typeof entry === "string" && entry.trim());
      if (typeof message === "string") return message;
    }
    return statusStr || "ComfyUI generation failed";
  }

  return null;
};

interface WorkflowProgressNode {
  id: string;
  label?: string;
  weight: number;
}

const isWorkflowNodeRecord = (value: unknown): value is WorkflowNode =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as Record<string, unknown>).class_type === "string";

const getNodeLabel = (node: WorkflowNode): string | undefined => {
  const title = node._meta?.title;
  return typeof title === "string" && title.trim() ? title : undefined;
};

const getNodeWeight = (node: WorkflowNode): number => {
  const classType = node.class_type.toLowerCase();
  return classType.includes("sampler") ? 4 : 1;
};

const buildWorkflowProgressNodes = (workflow: Workflow): WorkflowProgressNode[] =>
  Object.entries(workflow)
    .filter(([, node]) => isWorkflowNodeRecord(node))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([id, node]) => ({
      id,
      label: getNodeLabel(node as WorkflowNode),
      weight: getNodeWeight(node as WorkflowNode),
    }));

const computeWorkflowProgress = ({
  nodes,
  nodeId,
  value,
  max,
  previous,
}: {
  nodes: WorkflowProgressNode[];
  nodeId?: string;
  value?: number;
  max?: number;
  previous: number;
}): number => {
  if (!nodeId || nodes.length === 0) return previous;

  const index = nodes.findIndex((node) => node.id === nodeId);
  if (index === -1) return previous;

  const totalWeight = nodes.reduce((sum, node) => sum + node.weight, 0);
  const completedWeight = nodes.slice(0, index).reduce((sum, node) => sum + node.weight, 0);
  const fraction =
    typeof value === "number" && typeof max === "number" && max > 0
      ? Math.min(Math.max(value / max, 0), 1)
      : 0;
  const nodeWeight = nodes[index]?.weight ?? 1;
  const progress = Math.round(15 + ((completedWeight + fraction * nodeWeight) / totalWeight) * 80);

  return Math.max(previous, Math.min(progress, 95));
};

const getWorkflowNode = (
  nodes: WorkflowProgressNode[],
  nodeId: string | undefined
): WorkflowProgressNode | undefined => nodes.find((node) => node.id === nodeId);

type ComfyTerminalEvent =
  | { type: "success" }
  | { type: "failed"; message: string; detail: GenerationProgressDetail };

const isMatchingPromptEvent = (event: ComfyWsEvent, promptId: string): boolean =>
  event.promptId === undefined || event.promptId === promptId;

const waitForImageFromHistory = async ({
  generationId,
  promptId,
  startedAt,
  timeoutMs,
}: {
  generationId: string;
  promptId: string;
  startedAt: number;
  timeoutMs: number;
}): Promise<string> => {
  while (Date.now() - startedAt < timeoutMs) {
    const history = await fetchComfyHistory(promptId);
    const imageUrl = extractComfyImageFilename(history, promptId);
    if (imageUrl !== null) return imageUrl;

    const failure = extractComfyFailureMessage(history, promptId);
    if (failure) throw new Error(failure);

    await updateGenerationStatus({
      generationId,
      status: "running",
      progress: 95,
      detail: { stage: "finalizing", message: "Finalizing" },
    });
    await delay(getComfyPollIntervalMs());
  }

  throw new Error(`ComfyUI generation timed out after ${timeoutMs}ms`);
};

export const runComfyGeneration = async (generationId: string): Promise<void> => {
  let websocket: WebSocket | null = null;
  let terminalResolved = false;

  const closeWebSocket = () => {
    websocket?.removeAllListeners();
    websocket?.close();
    websocket = null;
  };

  try {
    await delay(250);
    await updateGenerationStatus({
      generationId,
      status: "running",
      progress: 10,
      detail: { stage: "queued", message: "Starting" },
    });

    const generation = await getGeneration(generationId);
    if (!generation) throw new Error("Generation not found");

    logger.info("generation.comfy.building", { generationId });
    const config = generation.config as GenerationRequestConfig;
    const promptInput = buildGenerationPromptInput(config);

    const workflow = await loadComfyWorkflow(promptInput.workflowFile);
    const patched = patchComfyWorkflow(workflow, promptInput);

    await updateGenerationComfyFields({ generationId, workflowSnapshot: patched });

    const clientId = randomUUID();
    const workflowNodes = buildWorkflowProgressNodes(patched);
    let promptId: string | null = null;
    let progress = 15;
    let websocketDisconnected = false;
    let resolveTerminal: (event: ComfyTerminalEvent) => void = () => undefined;
    let terminalPromise = new Promise<ComfyTerminalEvent>((resolve) => {
      resolveTerminal = resolve;
    });

    const resetTerminalPromise = () => {
      terminalPromise = new Promise<ComfyTerminalEvent>((resolve) => {
        resolveTerminal = resolve;
      });
    };

    const resolveOnce = (event: ComfyTerminalEvent) => {
      if (terminalResolved) return;
      terminalResolved = true;
      resolveTerminal(event);
    };

    const handleComfyEvent = (event: ComfyWsEvent) => {
      if (!promptId || !isMatchingPromptEvent(event, promptId)) return;

      if (event.type === "progress") {
        const node = getWorkflowNode(workflowNodes, event.nodeId);
        progress = computeWorkflowProgress({
          nodes: workflowNodes,
          nodeId: event.nodeId,
          value: event.value,
          max: event.max,
          previous: progress,
        });
        emitGenerationUpdate({
          generationId,
          status: "running",
          progress,
          detail: {
            stage: "sampling",
            nodeId: event.nodeId,
            nodeLabel: node?.label,
            step: event.value,
            totalSteps: event.max,
            message: `Sampling ${event.value}/${event.max}`,
          },
        });
        return;
      }

      if (event.type === "executing") {
        if (event.nodeId === null) {
          emitGenerationUpdate({
            generationId,
            status: "running",
            progress: Math.max(progress, 95),
            detail: { stage: "finalizing", message: "Finalizing" },
          });
          return;
        }

        const node = getWorkflowNode(workflowNodes, event.nodeId);
        progress = computeWorkflowProgress({
          nodes: workflowNodes,
          nodeId: event.nodeId,
          previous: progress,
        });
        emitGenerationUpdate({
          generationId,
          status: "running",
          progress,
          detail: {
            stage: "executing",
            nodeId: event.nodeId,
            nodeLabel: node?.label,
            message: node?.label ? `Running ${node.label}` : `Running node ${event.nodeId}`,
          },
        });
        return;
      }

      if (event.type === "execution_success") {
        resolveOnce({ type: "success" });
        return;
      }

      if (event.type === "execution_error" || event.type === "execution_interrupted") {
        resolveOnce({
          type: "failed",
          message: event.message,
          detail: {
            stage: "failed",
            nodeId: event.type === "execution_error" ? event.nodeId : undefined,
            message: event.message,
          },
        });
      }
    };

    const connectWebSocket = () => {
      websocketDisconnected = false;
      try {
        websocket = connectComfyWebSocket(clientId);
      } catch (error) {
        websocketDisconnected = true;
        logger.warn("generation.comfy.websocket_unavailable", {
          error: error instanceof Error ? error.message : "WebSocket unavailable",
          generationId,
        });
        return;
      }

      websocket.on("message", (data, isBinary) => {
        const event = parseComfyWsMessage(data, isBinary);
        if (event) handleComfyEvent(event);
      });
      websocket.on("close", () => {
        websocketDisconnected = !terminalResolved;
      });
      websocket.on("error", (error) => {
        websocketDisconnected = true;
        logger.warn("generation.comfy.websocket_error", {
          error: error instanceof Error ? error.message : "WebSocket error",
          generationId,
        });
      });
    };

    connectWebSocket();

    const promptIdValue = await submitComfyWorkflow(patched, { clientId });
    promptId = promptIdValue;
    await updateGenerationComfyFields({ generationId, promptId });
    await updateGenerationStatus({
      generationId,
      status: "running",
      progress: 15,
      detail: { stage: "queued", message: "Queued" },
    });
    logger.info("generation.comfy.submitted", { clientId, generationId, promptId });

    const startedAt = Date.now();
    const timeoutMs = getComfyTimeoutMs();

    while (Date.now() - startedAt < timeoutMs) {
      const terminal = await Promise.race<ComfyTerminalEvent | null>([
        terminalPromise,
        delay(getComfyPollIntervalMs()).then(() => null),
      ]);

      if (terminal?.type === "failed") {
        throw new Error(terminal.message);
      }

      if (terminal?.type === "success") {
        await updateGenerationStatus({
          generationId,
          status: "running",
          progress: Math.max(progress, 95),
          detail: { stage: "finalizing", message: "Finalizing" },
        });
        const imageUrl = await waitForImageFromHistory({
          generationId,
          promptId,
          startedAt,
          timeoutMs,
        });
        await updateGenerationStatus({
          generationId,
          status: "completed",
          progress: 100,
          imageUrl,
          detail: { stage: "completed", message: "Completed" },
        });
        terminalResolved = true;
        closeWebSocket();
        logger.info("generation.comfy.completed", { generationId, imageUrl });
        return;
      }

      if (websocketDisconnected && !terminalResolved) {
        closeWebSocket();
        resetTerminalPromise();
        connectWebSocket();
      }

      const history = await fetchComfyHistory(promptId);
      const imageUrl = extractComfyImageFilename(history, promptId);

      if (imageUrl !== null) {
        await updateGenerationStatus({
          generationId,
          status: "completed",
          progress: 100,
          imageUrl,
          detail: { stage: "completed", message: "Completed" },
        });
        terminalResolved = true;
        closeWebSocket();
        logger.info("generation.comfy.completed", { generationId, imageUrl });
        return;
      }

      const failure = extractComfyFailureMessage(history, promptId);
      if (failure) {
        throw new Error(failure);
      }
    }

    throw new Error(`ComfyUI generation timed out after ${timeoutMs}ms`);
  } catch (error) {
    try {
      const message = error instanceof Error ? error.message : "Generation failed";
      await updateGenerationStatus({
        generationId,
        status: "failed",
        progress: 100,
        error: message,
        detail: { stage: "failed", message },
      });
      logger.error("generation.comfy.failed", {
        error: message,
        generationId,
      });
    } catch {
      // The work may have been deleted while the worker was running.
    } finally {
      terminalResolved = true;
      closeWebSocket();
    }
  }
};
