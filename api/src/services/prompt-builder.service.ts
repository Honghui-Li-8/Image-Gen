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
  group: "character" | "general";
  tag: string;
  alwaysOn: string[];
  categoryIds: string[];
}

const XML_SECTIONS: XmlSectionConfig[] = [
  // character_1 block — per-character attributes
  {
    group: "character",
    tag: "gender",
    alwaysOn: ["1 adult woman"],
    categoryIds: [],
  },
  {
    group: "character",
    tag: "appearance",
    alwaysOn: [],
    categoryIds: ["hairStyle", "hairColor", "eyeColor"],
  },
  {
    group: "character",
    tag: "body_type",
    alwaysOn: [],
    categoryIds: ["bodyType", "breastSize", "hipSize"],
  },
  {
    group: "character",
    tag: "clothing",
    alwaysOn: [],
    categoryIds: ["clothingStyle"],
  },
  { group: "character", tag: "expression", alwaysOn: [], categoryIds: [] },
  { group: "character", tag: "action",     alwaysOn: [], categoryIds: [] },
  { group: "character", tag: "position",   alwaysOn: [], categoryIds: [] },

  // general_tags block — shared always-on descriptors
  {
    group: "general",
    tag: "count",
    alwaysOn: ["1girl", "solo", "adult woman"],
    categoryIds: [],
  },
  {
    group: "general",
    tag: "style",
    alwaysOn: [
      "polished shading",
    ],
    categoryIds: [],
  },
  { group: "general", tag: "inspirations", alwaysOn: [], categoryIds: [] },
  { group: "general", tag: "background",   alwaysOn: [], categoryIds: [] },
  { group: "general", tag: "environment",  alwaysOn: [], categoryIds: [] },
  { group: "general", tag: "perspective",  alwaysOn: [], categoryIds: [] },
  { group: "general", tag: "atmosphere",   alwaysOn: [], categoryIds: [] },
  { group: "general", tag: "lighting",     alwaysOn: [], categoryIds: [] },
  {
    group: "general",
    tag: "quality",
    alwaysOn: [
      "masterpiece",
      "best quality",
      "absurdres",
      "highres",
    ],
    categoryIds: [],
  },
  { group: "general", tag: "pixiv_tags", alwaysOn: [], categoryIds: [] },
  {
    group: "general",
    tag: "other",
    alwaysOn: [
      "detailed eyes",
      "detailed hands",
      "detailed fingers",
      "detailed feet",
      "detailed legs",
      "detailed thighs",
      "correct anatomy",
      "clean silhouette",
      "polished rendering",
      "character-centric composition",
      "full body",
      "head to toe",
      "both feet visible",
      "full-length shot",
      "shoes",
      "no extra limbs",
      "no distorted feet",
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

const renderSection = (
  section: XmlSectionConfig,
  selections: Record<string, string>,
  categories: Category[]
): string | null => {
  const tags = [
    ...section.alwaysOn,
    ...resolveSelectionTags(selections, categories, section.categoryIds),
  ];
  if (tags.length === 0) return null;
  return `<${section.tag}>\n${tags.join(", ")}\n</${section.tag}>`;
};

export const buildXml = (
  sections: XmlSectionConfig[],
  selections: Record<string, string>,
  categories: Category[]
): string => {
  // character_1 block — always present (always has <n> anchor)
  const characterSections = sections
    .filter((s) => s.group === "character")
    .map((s) => renderSection(s, selections, categories))
    .filter((s): s is string => s !== null);

  const characterBlock = [
    "<character_1>",
    "<n>$character_1$</n>",
    ...characterSections,
    "</character_1>",
  ].join("\n\n");

  // general_tags block — omitted when all sections are empty
  const generalSections = sections
    .filter((s) => s.group === "general")
    .map((s) => renderSection(s, selections, categories))
    .filter((s): s is string => s !== null);

  if (generalSections.length === 0) return characterBlock;

  const generalBlock = [
    "<general_tags>",
    ...generalSections,
    "</general_tags>",
  ].join("\n\n");

  return `${characterBlock}\n\n${generalBlock}`;
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
