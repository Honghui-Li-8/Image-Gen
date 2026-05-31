import type { ModelConfig, WorkConfig } from "../types";
import { generateSeed } from "./seeds";

export type BatchGenerationMode = "model" | "seed" | "config";

export interface BatchGenerationPlanItem {
  config: WorkConfig;
}

export interface SkippedModel {
  modelId: string;
  modelLabel: string;
  incompatibleFields: string[];
}

export interface ModelBatchPlan {
  items: BatchGenerationPlanItem[];
  skippedModels: SkippedModel[];
}

const MODEL_COUNT_WARNING_THRESHOLD = 8;

const pickRandom = <T>(items: T[]): T | undefined => {
  return items[Math.floor(Math.random() * items.length)];
};

export const randomizeCategorySelections = (model: ModelConfig): Record<string, string> => {
  return model.categories.reduce(
    (nextSelections, category) => {
      const option = pickRandom(category.options);
      if (option) {
        nextSelections[category.id] = option.value;
      }
      return nextSelections;
    },
    {} as Record<string, string>
  );
};

const getIncompatibleFields = (config: WorkConfig, model: ModelConfig): string[] => {
  const incompatibleFields: string[] = [];

  for (const [categoryId, selectedValue] of Object.entries(config.selections)) {
    const category = model.categories.find((candidate) => candidate.id === categoryId);
    if (!category) {
      incompatibleFields.push(categoryId);
      continue;
    }
    if (!category.options.some((option) => option.value === selectedValue)) {
      incompatibleFields.push(category.label);
    }
  }

  if (!model.outputPresets.some((preset) => preset.id === config.selectedPreset)) {
    incompatibleFields.push("Output Size");
  }

  return incompatibleFields;
};

export const buildModelBatchConfigs = (
  baseConfig: WorkConfig,
  models: Record<string, ModelConfig>
): ModelBatchPlan => {
  const modelEntries = Object.values(models);
  if (modelEntries.length > MODEL_COUNT_WARNING_THRESHOLD) {
    console.warn(
      "Model batch generation was not planned for more than 8 models; switch to explicit model selection."
    );
  }

  return modelEntries.reduce<ModelBatchPlan>(
    (plan, model) => {
      const incompatibleFields = getIncompatibleFields(baseConfig, model);
      if (incompatibleFields.length > 0) {
        plan.skippedModels.push({
          modelId: model.id,
          modelLabel: model.label,
          incompatibleFields,
        });
        return plan;
      }

      plan.items.push({
        config: {
          ...baseConfig,
          selectedModel: model.id,
          selections: { ...baseConfig.selections },
          additionalTags: [...baseConfig.additionalTags],
        },
      });
      return plan;
    },
    { items: [], skippedModels: [] }
  );
};

export const buildSeedBatchConfigs = (
  baseConfig: WorkConfig,
  batchSize: number,
  seedFactory = generateSeed
): BatchGenerationPlanItem[] => {
  return Array.from({ length: batchSize }, () => ({
    config: {
      ...baseConfig,
      seed: seedFactory(),
      selections: { ...baseConfig.selections },
      additionalTags: [...baseConfig.additionalTags],
    },
  }));
};

export const buildConfigSelectionBatchConfigs = (
  baseConfig: WorkConfig,
  model: ModelConfig,
  batchSize: number
): BatchGenerationPlanItem[] => {
  return Array.from({ length: batchSize }, () => ({
    config: {
      ...baseConfig,
      selections: randomizeCategorySelections(model),
      additionalTags: [...baseConfig.additionalTags],
    },
  }));
};
