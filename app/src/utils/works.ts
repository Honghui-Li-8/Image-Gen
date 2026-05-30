import type { GenerationCategory, GenerationOptions, ModelConfig, Work } from "../types";

export const buildInitialSelections = (
  _categories: GenerationCategory[] = [],
): Record<string, string> => {
  return {};
};

export const getMissingFieldIds = (work: Work, model: ModelConfig): string[] => {
  const invalidCategoryIds = model.categories
    .filter((category) => {
      const selectedValue = work.selections[category.id];
      return (
        !selectedValue ||
        !category.options.some((option) => option.value === selectedValue)
      );
    })
    .map((category) => category.id);

  const isPresetValid = model.outputPresets.some(
    (preset) => preset.id === work.selectedPreset,
  );

  return [
    ...invalidCategoryIds,
    ...(isPresetValid ? [] : ["selectedPreset"]),
    ...(work.seed.trim() ? [] : ["seed"]),
  ];
};

export const createWork = (
  options: GenerationOptions | null,
  index = 1,
): Work => {
  const modelId = options?.defaultModelId || "";
  const model = modelId ? options?.models[modelId] : null;

  return {
    id: `work_${Date.now()}_${index}`,
    name: `Work ${index}`,
    status: "idle",
    progress: 0,
    selectedModel: modelId,
    selections: buildInitialSelections(model?.categories),
    selectedPreset: model?.outputPresets?.[0]?.id || "",
    seed: "",
    additionalTags: [],
    tagDraft: "",
    additionalPrompt: "",
    images: [],
    activeImageIndex: 0,
    savedAt: null,
    viewingConfig: null,
  };
};
