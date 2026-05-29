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
  return {
    id: `work_${Date.now()}_${index}`,
    name: `Work ${index}`,
    status: "idle",
    progress: 0,
    selections: buildInitialSelections(options?.categories),
    selectedPreset: options?.outputPresets?.[0]?.id || "",
    seed: "",
    additionalTags: [],
    tagDraft: "",
    additionalPrompt: "",
    images: [],
    activeImageIndex: 0,
    savedAt: null,
  };
};
