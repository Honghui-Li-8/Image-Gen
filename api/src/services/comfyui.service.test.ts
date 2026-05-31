import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildComfyWsHeaders,
  buildComfyWsProxyPath,
  buildComfyWsProxyUrl,
  buildComfyImageFilename,
  computeOutputDimensions,
  isWorkflowNode,
  interruptComfyGeneration,
  patchComfyWorkflow,
  parseComfyWsMessage,
  submitComfyWorkflow,
  stripWorkflowMetadata,
  WORKFLOW_NODE_IDS,
} from "./comfyui.service.js";
import type { ComfyWorkflowPatch, Workflow } from "./comfyui.service.js";

const PATCH: ComfyWorkflowPatch = {
  seed: 999,
  baseWidth: 832,
  baseHeight: 1216,
  positivePrompt: "A fully rendered positive prompt",
  negativePrompt: "cropped, bad anatomy",
};

const makeWorkflow = (): Workflow => ({
  "3": {
    class_type: "CLIPTextEncode",
    inputs: { text: "old positive prompt" },
  },
  "4": {
    class_type: "CLIPTextEncode",
    inputs: { text: "old negative prompt" },
  },
  "5": {
    class_type: "EmptyLatentImage",
    inputs: { width: 896, height: 1344, batch_size: 1 },
    _meta: { title: "EmptyLatentImage" },
  },
  "7": {
    class_type: "KSampler",
    inputs: { seed: 100, steps: 32, cfg: 6, denoise: 1 },
    _meta: { title: "KSampler base" },
  },
  "11": {
    class_type: "ImageScale",
    inputs: { upscale_method: "lanczos", width: 1536, height: 2304, crop: "disabled" },
    _meta: { title: "ImageScale" },
  },
  "18": {
    class_type: "KSampler",
    inputs: { seed: 200, steps: 12, denoise: 0.18 },
    _meta: { title: "KSampler refine" },
  },
  _meta: { title: "test_workflow" },
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("patchComfyWorkflow — seed", () => {
  it("patches seed on all KSampler nodes", () => {
    const result = patchComfyWorkflow(makeWorkflow(), PATCH);
    const node7 = result["7"] as { inputs: Record<string, unknown> };
    const node18 = result["18"] as { inputs: Record<string, unknown> };
    expect(node7.inputs.seed).toBe(999);
    expect(node18.inputs.seed).toBe(999);
  });

  it("does not change seed on nodes that have no seed input", () => {
    const result = patchComfyWorkflow(makeWorkflow(), PATCH);
    const node5 = result["5"] as { inputs: Record<string, unknown> };
    expect(node5.inputs.seed).toBeUndefined();
  });

  it("throws when the workflow has no seed node", () => {
    const noSeedWorkflow: Workflow = {
      "1": { class_type: "CLIPTextEncode", inputs: { text: "hello" } },
    };
    expect(() => patchComfyWorkflow(noSeedWorkflow, PATCH)).toThrow(
      "ComfyUI workflow has no seed input to patch"
    );
  });
});

describe("patchComfyWorkflow — canvas and prompt nodes", () => {
  it("patches node 5 width and height", () => {
    const result = patchComfyWorkflow(makeWorkflow(), PATCH);
    const node5 = result[WORKFLOW_NODE_IDS.latentImage] as {
      inputs: Record<string, unknown>;
    };
    expect(node5.inputs.width).toBe(832);
    expect(node5.inputs.height).toBe(1216);
  });

  it("patches node 3 text with positivePrompt", () => {
    const result = patchComfyWorkflow(makeWorkflow(), PATCH);
    const node3 = result[WORKFLOW_NODE_IDS.positivePrompt] as {
      inputs: Record<string, unknown>;
    };
    expect(node3.inputs.text).toBe("A fully rendered positive prompt");
  });

  it("patches node 4 text with negativePrompt", () => {
    const result = patchComfyWorkflow(makeWorkflow(), PATCH);
    const node4 = result[WORKFLOW_NODE_IDS.negativePrompt] as {
      inputs: Record<string, unknown>;
    };
    expect(node4.inputs.text).toBe("cropped, bad anatomy");
  });

  it("patches node 11 output dimensions proportional to base dimensions", () => {
    const result = patchComfyWorkflow(makeWorkflow(), PATCH);
    const node11 = result[WORKFLOW_NODE_IDS.outputScale] as { inputs: Record<string, unknown> };
    expect(node11.inputs.width).toBe(1536);
    expect(node11.inputs.height).toBe(2304);
  });
});

describe("computeOutputDimensions", () => {
  it("preserves 2:3 ratio and hits ~3.5MP target for portrait-2-3 preset", () => {
    const { width, height } = computeOutputDimensions(832, 1216);
    expect(width).toBe(1536);
    expect(height).toBe(2304);
  });

  it("scales 3:4 preset to matching ratio", () => {
    const { width, height } = computeOutputDimensions(896, 1152);
    expect(width / height).toBeCloseTo(896 / 1152, 1);
    expect(width * height).toBeGreaterThan(3_000_000);
  });

  it("scales 9:16 preset to matching ratio", () => {
    const { width, height } = computeOutputDimensions(768, 1344);
    expect(width / height).toBeCloseTo(768 / 1344, 1);
    expect(width * height).toBeGreaterThan(3_000_000);
  });

  it("output dimensions are multiples of 64", () => {
    for (const [w, h] of [
      [832, 1216],
      [896, 1152],
      [768, 1344],
    ] as [number, number][]) {
      const { width, height } = computeOutputDimensions(w, h);
      expect(width % 64).toBe(0);
      expect(height % 64).toBe(0);
    }
  });
});

describe("patchComfyWorkflow — immutability", () => {
  it("does not mutate the original workflow object", () => {
    const original = makeWorkflow();
    const node7Before = (original["7"] as { inputs: Record<string, unknown> }).inputs.seed;
    patchComfyWorkflow(original, PATCH);
    const node7After = (original["7"] as { inputs: Record<string, unknown> }).inputs.seed;
    expect(node7After).toBe(node7Before);
  });
});

describe("isWorkflowNode", () => {
  it("returns true for objects with class_type string", () => {
    expect(isWorkflowNode({ class_type: "KSampler", inputs: {} })).toBe(true);
  });

  it("returns false for plain objects without class_type", () => {
    expect(isWorkflowNode({ title: "workflow_name" })).toBe(false);
  });

  it("returns false for arrays, primitives, and null", () => {
    expect(isWorkflowNode(null)).toBe(false);
    expect(isWorkflowNode([])).toBe(false);
    expect(isWorkflowNode("string")).toBe(false);
  });
});

describe("stripWorkflowMetadata", () => {
  it("removes the top-level _meta key", () => {
    const stripped = stripWorkflowMetadata(makeWorkflow());
    expect("_meta" in stripped).toBe(false);
  });

  it("retains all workflow nodes", () => {
    const stripped = stripWorkflowMetadata(makeWorkflow());
    expect(Object.keys(stripped).sort()).toEqual(["11", "18", "3", "4", "5", "7"]);
  });
});

describe("buildComfyImageFilename", () => {
  it("returns the bare filename from a ComfyUI image ref", () => {
    expect(buildComfyImageFilename({ filename: "image.png" })).toBe("image.png");
  });
});

describe("submitComfyWorkflow", () => {
  it("submits through the proxy with HMAC headers", async () => {
    vi.stubEnv("PROXY_URL", "http://proxy.test");
    vi.stubEnv("PROXY_AUTH_SECRET", "test-secret");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ prompt_id: "prompt-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitComfyWorkflow(makeWorkflow())).resolves.toBe("prompt-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://proxy.test/comfy/prompt",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Proxy-Signature": expect.any(String),
          "X-Proxy-Timestamp": expect.any(String),
        }),
      })
    );
  });

  it("includes client_id when provided", async () => {
    vi.stubEnv("PROXY_URL", "http://proxy.test");
    vi.stubEnv("PROXY_AUTH_SECRET", "test-secret");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ prompt_id: "prompt-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await submitComfyWorkflow(makeWorkflow(), { clientId: "client-1" });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      prompt: stripWorkflowMetadata(makeWorkflow()),
      client_id: "client-1",
    });
  });
});

describe("interruptComfyGeneration", () => {
  it("posts interrupt through the proxy with HMAC headers", async () => {
    vi.stubEnv("PROXY_URL", "http://proxy.test");
    vi.stubEnv("PROXY_AUTH_SECRET", "test-secret");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    await interruptComfyGeneration();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://proxy.test/comfy/interrupt",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Proxy-Signature": expect.any(String),
          "X-Proxy-Timestamp": expect.any(String),
        }),
      })
    );
  });
});

describe("ComfyUI websocket helpers", () => {
  it("builds the signed websocket proxy path and URL", () => {
    vi.stubEnv("PROXY_URL", "http://proxy.test/");
    vi.stubEnv("PROXY_AUTH_SECRET", "test-secret");

    expect(buildComfyWsProxyPath("client 1")).toBe("/comfy/ws?clientId=client%201");
    expect(buildComfyWsProxyUrl("client 1")).toBe("http://proxy.test/comfy/ws?clientId=client%201");
    expect(buildComfyWsHeaders("client 1")).toEqual(
      expect.objectContaining({
        "X-Proxy-Signature": expect.any(String),
        "X-Proxy-Timestamp": expect.any(String),
      })
    );
  });
});

describe("parseComfyWsMessage", () => {
  it("extracts sid from status messages", () => {
    expect(
      parseComfyWsMessage(
        JSON.stringify({
          type: "status",
          data: { sid: "server-client-id", status: { exec_info: { queue_remaining: 0 } } },
        })
      )
    ).toEqual({
      type: "status",
      promptId: undefined,
      sid: "server-client-id",
      raw: { sid: "server-client-id", status: { exec_info: { queue_remaining: 0 } } },
    });
  });

  it("normalizes progress messages", () => {
    expect(
      parseComfyWsMessage(
        JSON.stringify({
          type: "progress",
          data: { prompt_id: "prompt-1", node: "7", value: 12, max: 28 },
        })
      )
    ).toEqual({
      type: "progress",
      promptId: "prompt-1",
      nodeId: "7",
      value: 12,
      max: 28,
    });
  });

  it("normalizes success and executing messages", () => {
    expect(
      parseComfyWsMessage(JSON.stringify({ type: "execution_success", data: { prompt_id: "p" } }))
    ).toEqual({ type: "execution_success", promptId: "p" });

    expect(
      parseComfyWsMessage(
        JSON.stringify({ type: "executing", data: { prompt_id: "p", node: null } })
      )
    ).toEqual({ type: "executing", promptId: "p", nodeId: null });
  });

  it("normalizes error and interruption messages", () => {
    expect(
      parseComfyWsMessage(
        JSON.stringify({
          type: "execution_error",
          data: { prompt_id: "p", node_id: "7", exception_message: "CUDA out of memory" },
        })
      )
    ).toEqual({
      type: "execution_error",
      promptId: "p",
      nodeId: "7",
      message: "CUDA out of memory",
    });

    expect(
      parseComfyWsMessage(
        JSON.stringify({
          type: "execution_interrupted",
          data: { prompt_id: "p" },
        })
      )
    ).toEqual({
      type: "execution_interrupted",
      promptId: "p",
      message: "ComfyUI execution interrupted",
    });
  });

  it("ignores binary, malformed, and unknown messages", () => {
    expect(parseComfyWsMessage(Buffer.from("{}"), true)).toBeNull();
    expect(parseComfyWsMessage("{not json")).toBeNull();
    expect(parseComfyWsMessage(JSON.stringify({ type: "unknown", data: {} }))).toBeNull();
  });
});
