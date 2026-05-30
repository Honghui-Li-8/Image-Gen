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
  it("places appearance selections in the appearance_tags section", () => {
    const result = buildGenerationPromptInput(BASE_CONFIG);
    expect(result.customPromptXml).toContain("<appearance_tags>");
    expect(result.customPromptXml).toContain("slim");
    expect(result.customPromptXml).toContain("blue hair");
  });

  it("places clothing selection in the outfit_tags section", () => {
    const result = buildGenerationPromptInput(BASE_CONFIG);
    expect(result.customPromptXml).toContain("<outfit_tags>");
    expect(result.customPromptXml).toContain("casual");
  });

  it("always includes ordered_custom_tags and composition_tags", () => {
    const result = buildGenerationPromptInput({ ...BASE_CONFIG, selections: {} });
    expect(result.customPromptXml).toContain("<ordered_custom_tags>");
    expect(result.customPromptXml).toContain("<composition_tags>");
  });

  it("omits appearance_tags and outfit_tags when nothing is selected", () => {
    const result = buildGenerationPromptInput({ ...BASE_CONFIG, selections: {} });
    expect(result.customPromptXml).not.toContain("<appearance_tags>");
    expect(result.customPromptXml).not.toContain("<outfit_tags>");
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
  it("skips sections where both alwaysOn and resolved tags are empty", () => {
    const xml = buildXml(
      [{ tag: "empty_section", alwaysOn: [], categoryIds: [] }],
      {},
      []
    );
    expect(xml).toBe("");
  });

  it("includes a section when it has alwaysOn tags even with no selections", () => {
    const xml = buildXml(
      [{ tag: "static_section", alwaysOn: ["tag_a", "tag_b"], categoryIds: [] }],
      {},
      []
    );
    expect(xml).toBe("<static_section>\ntag_a, tag_b\n</static_section>");
  });

  it("joins multiple sections with a blank line", () => {
    const xml = buildXml(
      [
        { tag: "section_a", alwaysOn: ["a"], categoryIds: [] },
        { tag: "section_b", alwaysOn: ["b"], categoryIds: [] },
      ],
      {},
      []
    );
    expect(xml).toBe(
      "<section_a>\na\n</section_a>\n\n<section_b>\nb\n</section_b>"
    );
  });
});
