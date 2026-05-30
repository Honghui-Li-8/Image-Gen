import type { Category } from "image-gen-shared";
import { generationOptions } from "image-gen-shared";

export interface GenerationRequestConfig {
  modelId: string;
  selections: Record<string, string>;
  selectedPreset: string;
  seed: string;
  additionalTags: string[];
  additionalPrompt: string;
}

export interface GenerationPromptInput {
  seed: number;
  workflowFile: string;
  baseWidth: number;
  baseHeight: number;
  qualityTags: string;
  customPromptXml: string;
  caption: string;
}

const MODEL_WORKFLOW_FILES: Record<string, string> = {
  "pony-v6": "workflow_pony_v6.json",
  "animagine-xl-v3": "workflow_animagine_xl.json",
  "illustrious-xl": "workflow_illustrious_xl_v2.json",
};

interface XmlSectionConfig {
  tag: string;
  alwaysOn: string[];
  categoryIds: string[];
}

const XML_SECTIONS: XmlSectionConfig[] = [
  {
    tag: "ordered_custom_tags",
    alwaysOn: [
      "1girl",
      "original character",
      "safe",
      "solo",
      "looking at viewer",
      "full body",
      "standing",
    ],
    categoryIds: [],
  },
  {
    tag: "appearance_tags",
    alwaysOn: [],
    categoryIds: ["bodyType", "breastSize", "hipSize", "hairStyle", "hairColor", "eyeColor"],
  },
  {
    tag: "outfit_tags",
    alwaysOn: [],
    categoryIds: ["clothingStyle"],
  },
  {
    tag: "composition_tags",
    alwaysOn: [
      "one person only",
      "one outfit only",
      "front-facing full body",
      "head to toe",
      "entire body visible",
      "both feet visible",
      "centered composition",
    ],
    categoryIds: [],
  },
];

const parseSeed = (seedStr: string): number => {
  if (!seedStr) throw new Error("Seed is required");
  const seed = Number(seedStr);
  if (!Number.isInteger(seed) || seed < 0 || !Number.isSafeInteger(seed)) {
    throw new Error("Seed must be a non-negative safe integer");
  }
  return seed;
};

const resolveSelectionTags = (
  selections: Record<string, string>,
  categories: Category[],
  categoryIds: string[]
): string[] => {
  const tags: string[] = [];
  for (const catId of categoryIds) {
    const category = categories.find((c) => c.id === catId);
    if (!category) continue;
    const selectedValue = selections[catId];
    if (!selectedValue) continue;
    const option = category.options.find((o) => o.value === selectedValue);
    if (!option) continue;
    tags.push(...option.tags);
  }
  return tags;
};

export const buildXml = (
  sections: XmlSectionConfig[],
  selections: Record<string, string>,
  categories: Category[]
): string => {
  const parts: string[] = [];
  for (const section of sections) {
    const tags = [
      ...section.alwaysOn,
      ...resolveSelectionTags(selections, categories, section.categoryIds),
    ];
    if (tags.length === 0) continue;
    parts.push(`<${section.tag}>\n${tags.join(", ")}\n</${section.tag}>`);
  }
  return parts.join("\n\n");
};

export const buildGenerationPromptInput = (
  config: GenerationRequestConfig
): GenerationPromptInput => {
  const seed = parseSeed(config.seed);

  const workflowFile = MODEL_WORKFLOW_FILES[config.modelId];
  if (!workflowFile) throw new Error(`Unknown modelId: ${config.modelId}`);

  const model = generationOptions.models[config.modelId];
  if (!model) throw new Error(`Unknown modelId: ${config.modelId}`);

  const preset = model.outputPresets.find((p) => p.id === config.selectedPreset);
  if (!preset) throw new Error(`Unknown preset: ${config.selectedPreset}`);

  for (const [catId, selectedValue] of Object.entries(config.selections)) {
    const category = model.categories.find((c) => c.id === catId);
    if (!category) throw new Error(`Unknown category: ${catId}`);
    const option = category.options.find((o) => o.value === selectedValue);
    if (!option) throw new Error(`Unknown option '${selectedValue}' for category '${catId}'`);
  }

  const seen = new Set<string>();
  const qualityTagList: string[] = [];
  for (const tag of [...model.promptDefaults.positive, ...config.additionalTags]) {
    if (!seen.has(tag)) {
      seen.add(tag);
      qualityTagList.push(tag);
    }
  }

  return {
    seed,
    workflowFile,
    baseWidth: preset.width,
    baseHeight: preset.height,
    qualityTags: qualityTagList.join(", "),
    customPromptXml: buildXml(XML_SECTIONS, config.selections, model.categories),
    caption: config.additionalPrompt.trim(),
  };
};
