import type { GenerationCategory, GenerationOptions, Work } from "../types";

export const buildInitialSelections = (
  categories: GenerationCategory[] = [],
): Record<string, string> => {
  return categories.reduce((selections, category) => {
    selections[category.id] = category.options[0]?.value || "";
    return selections;
  }, {} as Record<string, string>);
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
  };
};
