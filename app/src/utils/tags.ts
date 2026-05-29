import type { GenerationCategory, Work } from "../types";

export const getSelectedTags = (
  categories: GenerationCategory[],
  selections: Record<string, string>,
): string[] => {
  return categories.flatMap((category) => {
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
