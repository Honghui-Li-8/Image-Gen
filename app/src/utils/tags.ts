import type { GenerationOptions, Work } from "../types";

export const getSelectedTags = (
  options: GenerationOptions | null,
  selections: Record<string, string>,
): string[] => {
  if (!options) return [];

  return options.categories.flatMap((category) => {
    const selectedOption = category.options.find(
      (option) => option.value === selections[category.id],
    );
    return selectedOption?.tags || [];
  });
};

export const normalizeTags = (tags: Work["additionalTags"]): string[] => {
  if (Array.isArray(tags)) return tags;

  return String(tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
};
