import { readFile } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { WebSocket } from "ws";
import { signProxyRequest } from "../lib/proxy-auth.js";

export interface ComfyWorkflowPatch {
  seed: number;
  baseWidth: number;
  baseHeight: number;
  positivePrompt: string;
  negativePrompt: string;
}

export interface ComfyImageRef {
  filename: string;
  subfolder?: string;
  type?: string;
}

export interface WorkflowNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

export type Workflow = Record<string, unknown>;

export type ComfyWsEvent =
  | { type: "status"; promptId?: string; sid?: string; raw: unknown }
  | { type: "progress"; promptId?: string; nodeId?: string; value: number; max: number }
  | { type: "executing"; promptId?: string; nodeId: string | null }
  | { type: "execution_success"; promptId?: string }
  | { type: "execution_error"; promptId?: string; message: string; nodeId?: string }
  | { type: "execution_interrupted"; promptId?: string; message: string }
  | {
      type: "execution_start" | "executed" | "execution_cached" | "progress_state";
      promptId?: string;
      raw: unknown;
    };

export const WORKFLOW_NODE_IDS = {
  positivePrompt: "3",
  negativePrompt: "4",
  latentImage: "5",
} as const;

const WORKFLOW_DIR =
  process.env.COMFYUI_WORKFLOW_DIR ??
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../workflow");

export const getBaseUrl = (): string => {
  const url = process.env.PROXY_URL ?? "http://localhost:3001";
  return url.endsWith("/") ? url.slice(0, -1) : url;
};

export const getComfyTimeoutMs = (): number => Number(process.env.COMFYUI_TIMEOUT_MS ?? 600000);

export const getComfyPollIntervalMs = (): number =>
  Number(process.env.COMFYUI_POLL_INTERVAL_MS ?? 1000);

export const getComfyFetchTimeoutMs = (): number =>
  Number(process.env.COMFYUI_FETCH_TIMEOUT_MS ?? 30000);

const getProxySecret = (): string => {
  const secret = process.env.PROXY_AUTH_SECRET;
  if (!secret) {
    throw new Error("PROXY_AUTH_SECRET is required");
  }
  return secret;
};

const getHeaders = (
  method: string,
  pathWithQuery: string,
  contentType?: string
): Record<string, string> => {
  const headers: Record<string, string> = {
    ...signProxyRequest(getProxySecret(), method, pathWithQuery),
  };
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
};

const getFetchSignal = (): AbortSignal => AbortSignal.timeout(getComfyFetchTimeoutMs());

const getPromptId = (data: Record<string, unknown>): string | undefined =>
  typeof data.prompt_id === "string" ? data.prompt_id : undefined;

const getNodeId = (data: Record<string, unknown>): string | undefined =>
  typeof data.node === "string"
    ? data.node
    : typeof data.node_id === "string"
      ? data.node_id
      : undefined;

const getMessage = (data: Record<string, unknown>, fallback: string): string => {
  if (typeof data.exception_message === "string" && data.exception_message.trim()) {
    return data.exception_message;
  }
  if (typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }
  return fallback;
};

const resolveWorkflowPath = (filename?: string): string => {
  if (filename) return resolve(WORKFLOW_DIR, filename);
  if (process.env.COMFYUI_WORKFLOW_PATH) return process.env.COMFYUI_WORKFLOW_PATH;
  return resolve(WORKFLOW_DIR, "workflow_illustrious_xl_v2.json");
};

export const isWorkflowNode = (value: unknown): value is WorkflowNode =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as Record<string, unknown>).class_type === "string";

export const stripWorkflowMetadata = (workflow: Workflow): Workflow =>
  Object.fromEntries(Object.entries(workflow).filter(([, value]) => isWorkflowNode(value)));

const patchRequiredNodeInput = (
  workflow: Workflow,
  nodeId: string,
  field: string,
  value: unknown
): void => {
  const node = workflow[nodeId];
  if (!isWorkflowNode(node)) {
    throw new Error(`ComfyUI workflow missing required node ${nodeId}`);
  }
  node.inputs[field] = value;
};

export const patchComfyWorkflow = (workflow: Workflow, patch: ComfyWorkflowPatch): Workflow => {
  const patched = structuredClone(workflow) as Workflow;

  let seedCount = 0;
  for (const node of Object.values(patched)) {
    if (isWorkflowNode(node) && "seed" in node.inputs) {
      node.inputs.seed = patch.seed;
      seedCount++;
    }
  }
  if (seedCount === 0) {
    throw new Error("ComfyUI workflow has no seed input to patch");
  }

  patchRequiredNodeInput(patched, WORKFLOW_NODE_IDS.latentImage, "width", patch.baseWidth);
  patchRequiredNodeInput(patched, WORKFLOW_NODE_IDS.latentImage, "height", patch.baseHeight);
  patchRequiredNodeInput(patched, WORKFLOW_NODE_IDS.positivePrompt, "text", patch.positivePrompt);
  patchRequiredNodeInput(patched, WORKFLOW_NODE_IDS.negativePrompt, "text", patch.negativePrompt);

  return patched;
};

export const loadComfyWorkflow = async (filename?: string): Promise<Workflow> => {
  const workflowPath = resolveWorkflowPath(filename);

  let raw: string;
  try {
    raw = await readFile(workflowPath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read workflow file at ${workflowPath}: ${(err as Error).message}`);
  }

  if (!raw.trim()) {
    throw new Error(`Workflow file is empty: ${workflowPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Workflow file is not valid JSON: ${workflowPath}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Workflow file root must be an object: ${workflowPath}`);
  }

  return parsed as Workflow;
};

export const submitComfyWorkflow = async (
  workflow: Workflow,
  options: { clientId?: string } = {}
): Promise<string> => {
  const stripped = stripWorkflowMetadata(workflow);
  const path = "/comfy/prompt";
  const body: Record<string, unknown> = { prompt: stripped };
  if (options.clientId) body.client_id = options.clientId;

  const response = await fetch(`${getBaseUrl()}${path}`, {
    method: "POST",
    headers: getHeaders("POST", path, "application/json"),
    body: JSON.stringify(body),
    signal: getFetchSignal(),
  });

  if (!response.ok) {
    throw new Error(`ComfyUI /prompt returned ${response.status}: ${await response.text()}`);
  }

  const responseBody = (await response.json()) as Record<string, unknown>;
  const promptId = responseBody.prompt_id;
  if (typeof promptId !== "string" || !promptId) {
    throw new Error("ComfyUI /prompt response missing prompt_id");
  }

  return promptId;
};

export const fetchComfyHistory = async (promptId: string): Promise<unknown> => {
  const path = `/comfy/history/${encodeURIComponent(promptId)}`;
  const response = await fetch(`${getBaseUrl()}${path}`, {
    headers: getHeaders("GET", path),
    signal: getFetchSignal(),
  });

  if (!response.ok) {
    throw new Error(`ComfyUI /history returned ${response.status}`);
  }

  return response.json();
};

export const buildComfyImageFilename = (ref: ComfyImageRef): string => {
  return ref.subfolder ? `${ref.subfolder}/${ref.filename}` : ref.filename;
};

export const buildComfyWsProxyPath = (clientId: string): string =>
  `/comfy/ws?clientId=${encodeURIComponent(clientId)}`;

export const buildComfyWsProxyUrl = (clientId: string): string =>
  `${getBaseUrl()}${buildComfyWsProxyPath(clientId)}`;

export const buildComfyWsHeaders = (clientId: string): Record<string, string> =>
  getHeaders("GET", buildComfyWsProxyPath(clientId));

export const connectComfyWebSocket = (clientId: string): WebSocket =>
  new WebSocket(buildComfyWsProxyUrl(clientId), {
    headers: buildComfyWsHeaders(clientId),
  });

export const parseComfyWsMessage = (data: unknown, isBinary = false): ComfyWsEvent | null => {
  if (isBinary) return null;

  const rawText = typeof data === "string" ? data : Buffer.isBuffer(data) ? data.toString() : null;
  if (rawText === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const message = parsed as Record<string, unknown>;
  if (typeof message.type !== "string") return null;
  const dataValue = message.data;
  const eventData =
    typeof dataValue === "object" && dataValue !== null && !Array.isArray(dataValue)
      ? (dataValue as Record<string, unknown>)
      : {};
  const promptId = getPromptId(eventData);

  switch (message.type) {
    case "progress": {
      const value = eventData.value;
      const max = eventData.max;
      if (typeof value !== "number" || typeof max !== "number" || max <= 0) return null;
      return {
        type: "progress",
        promptId,
        nodeId: getNodeId(eventData),
        value,
        max,
      };
    }
    case "executing": {
      const node = eventData.node;
      return {
        type: "executing",
        promptId,
        nodeId: typeof node === "string" ? node : null,
      };
    }
    case "execution_success":
      return { type: "execution_success", promptId };
    case "execution_error":
      return {
        type: "execution_error",
        promptId,
        nodeId: getNodeId(eventData),
        message: getMessage(eventData, "ComfyUI execution failed"),
      };
    case "execution_interrupted":
      return {
        type: "execution_interrupted",
        promptId,
        message: getMessage(eventData, "ComfyUI execution interrupted"),
      };
    case "status":
      return {
        type: "status",
        promptId,
        sid: typeof eventData.sid === "string" ? eventData.sid : undefined,
        raw: eventData,
      };
    case "execution_start":
    case "executed":
    case "execution_cached":
    case "progress_state":
      return { type: message.type, promptId, raw: eventData };
    default:
      return null;
  }
};
