import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelConfig, WorkConfig } from "../types";
import {
  buildConfigSelectionBatchConfigs,
  buildModelBatchConfigs,
  buildSeedBatchConfigs,
  randomizeCategorySelections,
} from "./batchGeneration";

const makeModel = (
  id: string,
  overrides: Partial<ModelConfig> = {}
): ModelConfig => ({
  id,
  label: `Model ${id}`,
  tags: [],
  additionalTagSuggestions: [],
  categories: [
    {
      id: "hair",
      label: "Hair",
      group: "Appearance",
      control: "select",
      options: [
        { value: "long", label: "Long", tags: [] },
        { value: "short", label: "Short", tags: [] },
      ],
    },
    {
      id: "eyes",
      label: "Eyes",
      group: "Appearance",
      control: "select",
      options: [{ value: "blue", label: "Blue", tags: [] }],
    },
  ],
  outputPresets: [{ id: "portrait", label: "Portrait", width: 768, height: 1344 }],
  ...overrides,
});

const baseConfig: WorkConfig = {
  selectedModel: "model-a",
  selections: { hair: "long", eyes: "blue" },
  selectedPreset: "portrait",
  seed: "123",
  additionalTags: ["cinematic"],
  additionalPrompt: "standing",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("randomizeCategorySelections", () => {
  it("selects one option for each model category", () => {
    const model = makeModel("model-a");

    const selections = randomizeCategorySelections(model);

    expect(Object.keys(selections).sort()).toEqual(["eyes", "hair"]);
    expect(["long", "short"]).toContain(selections.hair);
    expect(selections.eyes).toBe("blue");
  });
});

describe("buildModelBatchConfigs", () => {
  it("changes only the selected model for compatible models", () => {
    const plan = buildModelBatchConfigs(baseConfig, {
      "model-a": makeModel("model-a"),
      "model-b": makeModel("model-b"),
    });

    expect(plan.skippedModels).toEqual([]);
    expect(plan.items.map((item) => item.config.selectedModel)).toEqual(["model-a", "model-b"]);
    for (const item of plan.items) {
      expect(item.config).toMatchObject({
        selections: baseConfig.selections,
        selectedPreset: baseConfig.selectedPreset,
        seed: baseConfig.seed,
        additionalTags: baseConfig.additionalTags,
        additionalPrompt: baseConfig.additionalPrompt,
      });
    }
  });

  it("skips incompatible target models and reports incompatible fields", () => {
    const incompatible = makeModel("model-b", {
      categories: [
        {
          id: "hair",
          label: "Hair",
          group: "Appearance",
          control: "select",
          options: [{ value: "short", label: "Short", tags: [] }],
        },
      ],
      outputPresets: [{ id: "square", label: "Square", width: 1024, height: 1024 }],
    });

    const plan = buildModelBatchConfigs(baseConfig, {
      "model-a": makeModel("model-a"),
      "model-b": incompatible,
    });

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].config.selectedModel).toBe("model-a");
    expect(plan.skippedModels).toEqual([
      {
        modelId: "model-b",
        modelLabel: "Model model-b",
        incompatibleFields: ["Hair", "eyes", "Output Size"],
      },
    ]);
  });

  it("warns when model mode receives more than eight models", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const models = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => {
        const id = `model-${index}`;
        return [id, makeModel(id)];
      })
    );

    buildModelBatchConfigs(baseConfig, models);

    expect(warn).toHaveBeenCalledWith(
      "Model batch generation was not planned for more than 8 models; switch to explicit model selection."
    );
  });
});

describe("buildSeedBatchConfigs", () => {
  it("changes only seed for each batch item", () => {
    const seeds = ["10", "20", "30"];
    const plan = buildSeedBatchConfigs(baseConfig, 3, () => seeds.shift() ?? "0");

    expect(plan.map((item) => item.config.seed)).toEqual(["10", "20", "30"]);
    for (const item of plan) {
      expect(item.config).toMatchObject({
        selectedModel: baseConfig.selectedModel,
        selections: baseConfig.selections,
        selectedPreset: baseConfig.selectedPreset,
        additionalTags: baseConfig.additionalTags,
        additionalPrompt: baseConfig.additionalPrompt,
      });
    }
  });
});

describe("buildConfigSelectionBatchConfigs", () => {
  it("changes only category selections for each batch item", () => {
    const model = makeModel("model-a");
    const plan = buildConfigSelectionBatchConfigs(baseConfig, model, 2);

    expect(plan).toHaveLength(2);
    for (const item of plan) {
      expect(item.config.selectedModel).toBe(baseConfig.selectedModel);
      expect(item.config.selectedPreset).toBe(baseConfig.selectedPreset);
      expect(item.config.seed).toBe(baseConfig.seed);
      expect(item.config.additionalTags).toEqual(baseConfig.additionalTags);
      expect(item.config.additionalPrompt).toBe(baseConfig.additionalPrompt);
      expect(Object.keys(item.config.selections).sort()).toEqual(["eyes", "hair"]);
    }
  });
});
