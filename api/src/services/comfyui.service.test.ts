import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildComfyImageFilename,
  isWorkflowNode,
  patchComfyWorkflow,
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
    expect(Object.keys(stripped).sort()).toEqual(["18", "3", "4", "5", "7"]);
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
});
