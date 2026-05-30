import { describe, expect, it } from "vitest";
import {
  buildGenerationPromptInput,
  buildXml,
} from "./prompt-builder.service.js";
import type { GenerationRequestConfig } from "./prompt-builder.service.js";

const BASE_CONFIG: GenerationRequestConfig = {
  modelId: "illustrious-xl",
  selections: {
    bodyType: "slender",
    hairColor: "blue",
    clothingStyle: "casual",
  },
  selectedPreset: "portrait-2-3",
  seed: "42",
  additionalTags: ["cinematic lighting"],
  additionalPrompt: "dynamic pose",
};

describe("buildGenerationPromptInput — seed validation", () => {
  it("returns seed as a number", () => {
    expect(buildGenerationPromptInput(BASE_CONFIG).seed).toBe(42);
  });

  it("throws on empty seed", () => {
    expect(() => buildGenerationPromptInput({ ...BASE_CONFIG, seed: "" })).toThrow(
      "Seed is required"
    );
  });

  it("throws on fractional seed", () => {
    expect(() => buildGenerationPromptInput({ ...BASE_CONFIG, seed: "1.5" })).toThrow(
      "Seed must be a non-negative safe integer"
    );
  });

  it("throws on negative seed", () => {
    expect(() => buildGenerationPromptInput({ ...BASE_CONFIG, seed: "-1" })).toThrow(
      "Seed must be a non-negative safe integer"
    );
  });

  it("throws when seed exceeds MAX_SAFE_INTEGER", () => {
    expect(() =>
      buildGenerationPromptInput({ ...BASE_CONFIG, seed: String(Number.MAX_SAFE_INTEGER + 1) })
    ).toThrow("Seed must be a non-negative safe integer");
  });
});

describe("buildGenerationPromptInput — model and preset validation", () => {
  it("throws on unknown modelId", () => {
    expect(() =>
      buildGenerationPromptInput({ ...BASE_CONFIG, modelId: "unknown-model" })
    ).toThrow("Unknown modelId: unknown-model");
  });

  it("throws on unknown selectedPreset", () => {
    expect(() =>
      buildGenerationPromptInput({ ...BASE_CONFIG, selectedPreset: "unknown-preset" })
    ).toThrow("Unknown preset: unknown-preset");
  });

  it("throws on unknown category option value", () => {
    expect(() =>
      buildGenerationPromptInput({ ...BASE_CONFIG, selections: { bodyType: "giant" } })
    ).toThrow("Unknown option 'giant' for category 'bodyType'");
  });

  it("maps each modelId to the correct workflow file", () => {
    expect(buildGenerationPromptInput(BASE_CONFIG).workflowFile).toBe(
      "workflow_illustrious_xl_v2.json"
    );
    expect(
      buildGenerationPromptInput({ ...BASE_CONFIG, modelId: "pony-v6" }).workflowFile
    ).toBe("workflow_pony_v6.json");
    expect(
      buildGenerationPromptInput({ ...BASE_CONFIG, modelId: "animagine-xl-v3" }).workflowFile
    ).toBe("workflow_animagine_xl.json");
  });

  it("resolves baseWidth and baseHeight from the preset", () => {
    const result = buildGenerationPromptInput({ ...BASE_CONFIG, selectedPreset: "portrait-2-3" });
    expect(result.baseWidth).toBe(832);
    expect(result.baseHeight).toBe(1216);
  });
});

describe("buildGenerationPromptInput — XML prompt", () => {
  it("places appearance selections inside character_1 appearance section", () => {
    const result = buildGenerationPromptInput(BASE_CONFIG);
    expect(result.customPromptXml).toContain("<appearance>");
    expect(result.customPromptXml).toContain("slim");
    expect(result.customPromptXml).toContain("blue hair");
  });

  it("places clothing selection inside character_1 clothing section", () => {
    const result = buildGenerationPromptInput(BASE_CONFIG);
    expect(result.customPromptXml).toContain("<clothing>");
    expect(result.customPromptXml).toContain("casual");
  });

  it("always includes character_1, gender, count, style, quality, and other", () => {
    const result = buildGenerationPromptInput({ ...BASE_CONFIG, selections: {} });
    expect(result.customPromptXml).toContain("<character_1>");
    expect(result.customPromptXml).toContain("<gender>");
    expect(result.customPromptXml).toContain("<general_tags>");
    expect(result.customPromptXml).toContain("<count>");
    expect(result.customPromptXml).toContain("<style>");
    expect(result.customPromptXml).toContain("<quality>");
    expect(result.customPromptXml).toContain("<other>");
  });

  it("omits appearance, body_type, and clothing when nothing is selected", () => {
    const result = buildGenerationPromptInput({ ...BASE_CONFIG, selections: {} });
    expect(result.customPromptXml).not.toContain("<appearance>");
    expect(result.customPromptXml).not.toContain("<body_type>");
    expect(result.customPromptXml).not.toContain("<clothing>");
  });
});

describe("buildGenerationPromptInput — quality tags", () => {
  it("merges additionalTags into qualityTags after model defaults", () => {
    const result = buildGenerationPromptInput(BASE_CONFIG);
    expect(result.qualityTags).toContain("cinematic lighting");
  });

  it("deduplicates tags that appear in both model defaults and additionalTags", () => {
    // "highres" is in illustrious-xl promptDefaults.positive
    const result = buildGenerationPromptInput({
      ...BASE_CONFIG,
      additionalTags: ["highres", "cinematic lighting"],
    });
    const tags = result.qualityTags.split(", ");
    expect(tags.filter((t) => t === "highres").length).toBe(1);
  });
});

describe("buildGenerationPromptInput — caption", () => {
  it("passes additionalPrompt through trimmed as caption", () => {
    const result = buildGenerationPromptInput({
      ...BASE_CONFIG,
      additionalPrompt: "  dynamic pose  ",
    });
    expect(result.caption).toBe("dynamic pose");
  });

  it("produces empty string caption when additionalPrompt is empty", () => {
    const result = buildGenerationPromptInput({ ...BASE_CONFIG, additionalPrompt: "" });
    expect(result.caption).toBe("");
  });
});

describe("buildXml — section assembly", () => {
  it("skips character sections with no content but keeps the character_1 wrapper", () => {
    const xml = buildXml(
      [{ group: "character", tag: "empty_section", alwaysOn: [], categoryIds: [] }],
      {},
      []
    );
    expect(xml).toContain("<character_1>");
    expect(xml).not.toContain("<empty_section>");
  });

  it("includes character section when it has alwaysOn tags", () => {
    const xml = buildXml(
      [{ group: "character", tag: "gender", alwaysOn: ["1 adult woman"], categoryIds: [] }],
      {},
      []
    );
    expect(xml).toContain("<gender>\n1 adult woman\n</gender>");
  });

  it("wraps general sections inside general_tags block", () => {
    const xml = buildXml(
      [{ group: "general", tag: "count", alwaysOn: ["1girl"], categoryIds: [] }],
      {},
      []
    );
    expect(xml).toContain("<general_tags>");
    expect(xml).toContain("<count>\n1girl\n</count>");
  });

  it("omits general_tags block when all general sections are empty", () => {
    const xml = buildXml(
      [{ group: "general", tag: "background", alwaysOn: [], categoryIds: [] }],
      {},
      []
    );
    expect(xml).not.toContain("<general_tags>");
    expect(xml).not.toContain("<background>");
  });
});
