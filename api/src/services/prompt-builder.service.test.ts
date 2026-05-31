import { describe, expect, it } from "vitest";
import { buildGenerationPromptInput, buildXml } from "./prompt-builder.service.js";
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
    expect(() => buildGenerationPromptInput({ ...BASE_CONFIG, modelId: "unknown-model" })).toThrow(
      "Unknown modelId: unknown-model"
    );
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
    expect(buildGenerationPromptInput({ ...BASE_CONFIG, modelId: "pony-v6" }).workflowFile).toBe(
      "workflow_pony_v6.json"
    );
    expect(
      buildGenerationPromptInput({ ...BASE_CONFIG, modelId: "animagine-xl-v3" }).workflowFile
    ).toBe("workflow_animagine_xl.json");
  });

  it("computes baseWidth and baseHeight from model basePixels and preset ratio", () => {
    // illustrious-xl basePixels=1024×1536=1,572,864; portrait-2-3 ratio=2:3 → 1024×1536
    const illustrious = buildGenerationPromptInput({
      ...BASE_CONFIG,
      selectedPreset: "portrait-2-3",
    });
    expect(illustrious.baseWidth).toBe(1024);
    expect(illustrious.baseHeight).toBe(1536);
    // pony-v6 basePixels=832×1216=1,011,712; same ratio → 832×1216
    const pony = buildGenerationPromptInput({
      ...BASE_CONFIG,
      modelId: "pony-v6",
      selectedPreset: "portrait-2-3",
    });
    expect(pony.baseWidth).toBe(832);
    expect(pony.baseHeight).toBe(1216);
  });
});

describe("buildGenerationPromptInput — XML prompt", () => {
  it("places appearance selections inside character_1 appearance section", () => {
    const result = buildGenerationPromptInput(BASE_CONFIG);
    expect(result.positivePrompt).toContain("<appearance>");
    expect(result.positivePrompt).toContain("slim");
    expect(result.positivePrompt).toContain("blue hair");
  });

  it("places clothing selection inside character_1 clothing section", () => {
    const result = buildGenerationPromptInput(BASE_CONFIG);
    expect(result.positivePrompt).toContain("<clothing>");
    expect(result.positivePrompt).toContain("casual");
  });

  it("always includes character_1, count, quality, and other", () => {
    const result = buildGenerationPromptInput({ ...BASE_CONFIG, selections: {} });
    expect(result.positivePrompt).toContain("<character_1>");
    expect(result.positivePrompt).toContain("<general_tags>");
    expect(result.positivePrompt).toContain("<count>");
    expect(result.positivePrompt).toContain("<quality>");
    expect(result.positivePrompt).toContain("<other>");
  });

  it("omits appearance, body_type, and clothing when nothing is selected", () => {
    const result = buildGenerationPromptInput({ ...BASE_CONFIG, selections: {} });
    expect(result.positivePrompt).not.toContain("<appearance>");
    expect(result.positivePrompt).not.toContain("<body_type>");
    expect(result.positivePrompt).not.toContain("<clothing>");
  });
});

describe("buildGenerationPromptInput — quality tags", () => {
  it("merges additionalTags into the rendered positive prompt after backend model prompt preset tags", () => {
    const result = buildGenerationPromptInput(BASE_CONFIG);
    expect(result.positivePrompt).toContain("finished color artwork");
    expect(result.positivePrompt).toContain("cinematic lighting");
  });

  it("deduplicates tags that appear in both model defaults and additionalTags", () => {
    // "highres" is in the illustrious-xl backend prompt preset.
    const result = buildGenerationPromptInput({
      ...BASE_CONFIG,
      additionalTags: ["highres", "cinematic lighting"],
    });
    const qualityLine = result.positivePrompt.match(/"quality_tags": "([^"]+)"/)?.[1] ?? "";
    const tags = qualityLine.split(", ");
    expect(tags.filter((t) => t === "highres").length).toBe(1);
  });
});

describe("buildGenerationPromptInput — backend prompt presets", () => {
  it("renders positivePrompt and negativePrompt from the backend model preset", () => {
    const result = buildGenerationPromptInput(BASE_CONFIG);
    expect(result.positivePrompt).not.toContain("{quality_prompt}");
    expect(result.positivePrompt).not.toContain("{user_prompt}");
    expect(result.positivePrompt).not.toContain("{caption}");
    expect(result.positivePrompt).toContain("You are a professional anime illustrator");
    expect(result.negativePrompt).toContain("cropped");
    expect(result.negativePrompt).toContain("upper body only");
  });

  it("returns model-specific quality and negative prompt values", () => {
    const pony = buildGenerationPromptInput({ ...BASE_CONFIG, modelId: "pony-v6" });
    const animagine = buildGenerationPromptInput({ ...BASE_CONFIG, modelId: "animagine-xl-v3" });

    expect(pony.positivePrompt).toContain("score_9");
    expect(pony.positivePrompt).toContain("anime girl");
    expect(pony.positivePrompt).toContain("normal human body");
    expect(pony.positivePrompt).toContain("modest outfit");
    expect(pony.positivePrompt).toContain("non-revealing clothing");
    expect(pony.positivePrompt).toContain("fully clothed outfit");
    expect(pony.positivePrompt).not.toContain("realistic human proportions");
    expect(pony.positivePrompt).toContain("source_anime");
    expect(pony.negativePrompt).toContain("pony");
    expect(pony.negativePrompt).toContain("bikini");
    expect(pony.negativePrompt).toContain("revealing clothes");
    expect(animagine.positivePrompt).toContain("high score");
    expect(animagine.negativePrompt).toContain("bad score");
  });

  it("keeps bodysuit wardrobe options covered with non-revealing outerwear tags", () => {
    const pony = buildGenerationPromptInput({
      ...BASE_CONFIG,
      modelId: "pony-v6",
      selections: {
        ...BASE_CONFIG.selections,
        clothingStyle: "sci-fi",
      },
    });

    expect(pony.positivePrompt).toContain("bodysuit");
    expect(pony.positivePrompt).toContain("jacket");
    expect(pony.positivePrompt).toContain("covered outfit");
  });

  it("adds Pony-specific neutral hip tags for medium hip selection", () => {
    const pony = buildGenerationPromptInput({
      ...BASE_CONFIG,
      modelId: "pony-v6",
      selections: {
        ...BASE_CONFIG.selections,
        hipSize: "medium",
      },
    });
    const illustrious = buildGenerationPromptInput({
      ...BASE_CONFIG,
      selections: {
        ...BASE_CONFIG.selections,
        hipSize: "medium",
      },
    });

    expect(pony.positivePrompt).toContain("average hips");
    expect(pony.positivePrompt).toContain("proportional hips");
    expect(pony.negativePrompt).toContain("wide hips");
    expect(pony.negativePrompt).toContain("thick thighs");
    expect(pony.negativePrompt).toContain("huge hips");
    expect(pony.negativePrompt).toContain("pear-shaped body");
    expect(illustrious.positivePrompt).not.toContain("average hips");
    expect(illustrious.positivePrompt).not.toContain("proportional hips");
    expect(illustrious.negativePrompt).toContain("wide hips");
    expect(illustrious.negativePrompt).not.toContain("huge hips");
    expect(illustrious.negativePrompt).not.toContain("pear-shaped body");
  });

  it("adds Pony-specific small-bust regulators for subtle and small breast selections", () => {
    const subtle = buildGenerationPromptInput({
      ...BASE_CONFIG,
      modelId: "pony-v6",
      selections: {
        ...BASE_CONFIG.selections,
        breastSize: "subtle",
      },
    });
    const small = buildGenerationPromptInput({
      ...BASE_CONFIG,
      modelId: "pony-v6",
      selections: {
        ...BASE_CONFIG.selections,
        breastSize: "small",
      },
    });

    expect(subtle.positivePrompt).toContain("petite chest");
    expect(subtle.negativePrompt).toContain("medium breasts");
    expect(subtle.negativePrompt).toContain("large breasts");
    expect(subtle.negativePrompt).toContain("busty");
    expect(small.positivePrompt).toContain("modest breasts");
    expect(small.negativePrompt).toContain("large breasts");
    expect(small.negativePrompt).toContain("huge breasts");
  });

  it("adds simple form selection negative overrides for non-Pony models", () => {
    const result = buildGenerationPromptInput({
      ...BASE_CONFIG,
      modelId: "animagine-xl-v3",
      selections: {
        bodyType: "slender",
        breastSize: "medium",
        hipSize: "small",
      },
    });

    expect(result.negativePrompt).toContain("chubby");
    expect(result.negativePrompt).toContain("huge breasts");
    expect(result.negativePrompt).toContain("wide hips");
    expect(result.negativePrompt).not.toContain("oversized hips");
  });
});

describe("buildGenerationPromptInput — caption", () => {
  it("appends additionalPrompt to the backend full-body caption", () => {
    const result = buildGenerationPromptInput({
      ...BASE_CONFIG,
      additionalPrompt: "  dynamic pose  ",
    });
    expect(result.positivePrompt).toContain("full-body illustration");
    expect(result.positivePrompt).toContain("both feet visible");
    expect(result.positivePrompt).toContain("dynamic pose");
  });

  it("uses the backend full-body caption when additionalPrompt is empty", () => {
    const result = buildGenerationPromptInput({ ...BASE_CONFIG, additionalPrompt: "" });
    expect(result.positivePrompt).toContain("full-body illustration");
    expect(result.positivePrompt).toContain("head to toe");
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
