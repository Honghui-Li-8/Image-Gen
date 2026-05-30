import { describe, expect, it } from "vitest";
import {
  buildComfyImageUrl,
  isWorkflowNode,
  patchComfyWorkflow,
  stripWorkflowMetadata,
} from "./comfyui.service.js";
import type { ComfyWorkflowPatch, Workflow } from "./comfyui.service.js";

const PATCH: ComfyWorkflowPatch = {
  seed: 999,
  baseWidth: 832,
  baseHeight: 1216,
  qualityTags: "masterpiece, best quality",
  customPromptXml: "<appearance_tags>\nblue hair\n</appearance_tags>",
  caption: "dynamic pose",
};

const makeWorkflow = (): Workflow => ({
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
  "13": {
    class_type: "PrimitiveStringMultiline",
    inputs: { value: "original content" },
  },
  "14": {
    class_type: "PrimitiveStringMultiline",
    inputs: { value: "A full-body anime portrait.\n" },
  },
  "18": {
    class_type: "KSampler",
    inputs: { seed: 200, steps: 12, denoise: 0.18 },
    _meta: { title: "KSampler refine" },
  },
  "21": {
    class_type: "PrimitiveStringMultiline",
    inputs: { value: "old quality tags" },
  },
  "_meta": { title: "test_workflow" },
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
    const node5 = result["5"] as { inputs: Record<string, unknown> };
    expect(node5.inputs.width).toBe(832);
    expect(node5.inputs.height).toBe(1216);
  });

  it("patches node 13 value with customPromptXml", () => {
    const result = patchComfyWorkflow(makeWorkflow(), PATCH);
    const node13 = result["13"] as { inputs: Record<string, unknown> };
    expect(node13.inputs.value).toBe(PATCH.customPromptXml);
  });

  it("patches node 21 value with qualityTags", () => {
    const result = patchComfyWorkflow(makeWorkflow(), PATCH);
    const node21 = result["21"] as { inputs: Record<string, unknown> };
    expect(node21.inputs.value).toBe("masterpiece, best quality");
  });
});

describe("patchComfyWorkflow — caption (node 14)", () => {
  it("appends non-empty user caption to existing node 14 value", () => {
    const result = patchComfyWorkflow(makeWorkflow(), PATCH);
    const node14 = result["14"] as { inputs: Record<string, unknown> };
    expect(node14.inputs.value).toBe("A full-body anime portrait.\n\ndynamic pose");
  });

  it("keeps existing node 14 value unchanged when caption is empty", () => {
    const result = patchComfyWorkflow(makeWorkflow(), { ...PATCH, caption: "" });
    const node14 = result["14"] as { inputs: Record<string, unknown> };
    expect(node14.inputs.value).toBe("A full-body anime portrait.\n");
  });

  it("trims whitespace-only caption and keeps existing value unchanged", () => {
    const result = patchComfyWorkflow(makeWorkflow(), { ...PATCH, caption: "   " });
    const node14 = result["14"] as { inputs: Record<string, unknown> };
    expect(node14.inputs.value).toBe("A full-body anime portrait.\n");
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
    expect(Object.keys(stripped).sort()).toEqual(["13", "14", "18", "21", "5", "7"]);
  });
});

describe("buildComfyImageUrl", () => {
  it("builds a /view URL with filename and default type=output", () => {
    const url = buildComfyImageUrl({ filename: "image.png" });
    expect(url).toContain("/view?");
    expect(url).toContain("filename=image.png");
    expect(url).toContain("type=output");
  });

  it("includes subfolder when provided", () => {
    const url = buildComfyImageUrl({ filename: "img.png", subfolder: "api_workflow" });
    expect(url).toContain("subfolder=api_workflow");
  });

  it("uses the provided type instead of the default", () => {
    const url = buildComfyImageUrl({ filename: "img.png", type: "temp" });
    expect(url).toContain("type=temp");
  });
});
