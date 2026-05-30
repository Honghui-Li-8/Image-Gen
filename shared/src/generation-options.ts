export interface CategoryOption {
  value: string;
  label: string;
  tags: string[];
}

export interface Category {
  id: string;
  label: string;
  group: string;
  control: "single-select" | "multi-select";
  options: CategoryOption[];
}

export interface OutputPreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export interface ModelConfig {
  id: string;
  label: string;
  tags: string[];
  categories: Category[];
  additionalTagSuggestions: string[];
  outputPresets: OutputPreset[];
}

export interface GenerationOptions {
  models: Record<string, ModelConfig>;
  defaultModelId: string;
}

export const baseCategories: Category[] = [
  {
    id: "bodyType",
    label: "Body Type",
    group: "Form",
    control: "single-select",
    options: [
      { value: "slender", label: "Slender", tags: ["slim"] },
      { value: "athletic", label: "Athletic", tags: ["toned"] },
      { value: "average", label: "Average", tags: [] },
      { value: "plump", label: "Plump", tags: ["chubby"] }
    ]
  },
  {
    id: "breastSize",
    label: "Breast Size",
    group: "Form",
    control: "single-select",
    options: [
      { value: "subtle", label: "Subtle", tags: ["flat chest"] },
      { value: "small", label: "Small", tags: ["small breasts"] },
      { value: "medium", label: "Medium", tags: ["medium breasts"] },
      { value: "large", label: "Large", tags: ["large breasts"] },
      { value: "prominent", label: "Prominent", tags: ["huge breasts"] }
    ]
  },
  {
    id: "hipSize",
    label: "Hip Size",
    group: "Form",
    control: "single-select",
    options: [
      { value: "small", label: "Small", tags: ["narrow hips"] },
      { value: "medium", label: "Medium", tags: [] },
      { value: "large", label: "Large", tags: ["wide hips"] },
      { value: "prominent", label: "Prominent", tags: ["wide hips", "thick thighs"] }
    ]
  },
  {
    id: "hairStyle",
    label: "Hair Style",
    group: "Appearance",
    control: "single-select",
    options: [
      { value: "long-hair", label: "Long Hair", tags: ["long hair"] },
      { value: "short-hair", label: "Short Hair", tags: ["short hair"] },
      { value: "twintails", label: "Twintails", tags: ["twintails"] },
      { value: "ponytail", label: "Ponytail", tags: ["ponytail"] },
      { value: "bob-cut", label: "Bob Cut", tags: ["bob cut"] }
    ]
  },
  {
    id: "hairColor",
    label: "Hair Color",
    group: "Appearance",
    control: "single-select",
    options: [
      { value: "black", label: "Black", tags: ["black hair"] },
      { value: "blonde", label: "Blonde", tags: ["blonde hair"] },
      { value: "brown", label: "Brown", tags: ["brown hair"] },
      { value: "pink", label: "Pink", tags: ["pink hair"] },
      { value: "blue", label: "Blue", tags: ["blue hair"] },
      { value: "white", label: "White", tags: ["white hair"] }
    ]
  },
  {
    id: "eyeColor",
    label: "Eye Color",
    group: "Appearance",
    control: "single-select",
    options: [
      { value: "brown", label: "Brown", tags: ["brown eyes"] },
      { value: "blue", label: "Blue", tags: ["blue eyes"] },
      { value: "green", label: "Green", tags: ["green eyes"] },
      { value: "red", label: "Red", tags: ["red eyes"] },
      { value: "purple", label: "Purple", tags: ["purple eyes"] }
    ]
  },
  {
    id: "clothingStyle",
    label: "Clothing Style",
    group: "Wardrobe",
    control: "single-select",
    options: [
      { value: "academy-uniform", label: "Academy Uniform", tags: ["school uniform", "pleated skirt", "modest clothing"] },
      { value: "cyberpunk", label: "Cyberpunk", tags: ["cyberpunk", "neon lights", "bodysuit", "jacket", "covered outfit"] },
      { value: "fantasy-armor", label: "Fantasy Armor", tags: ["armor", "full armor", "pauldrons"] },
      { value: "casual", label: "Casual", tags: ["casual outfit", "t-shirt", "jacket", "long pants", "sneakers", "modest clothing"] },
      { value: "sci-fi", label: "Sci-Fi", tags: ["science fiction", "futuristic", "bodysuit", "jacket", "covered outfit"] }
    ]
  }
];

const BASE_OUTPUT_PRESETS: OutputPreset[] = [
  { id: "portrait-2-3", label: "2:3 Portrait", width: 832, height: 1216 },
  { id: "portrait-3-4", label: "3:4 Portrait", width: 896, height: 1152 },
  { id: "vertical-9-16", label: "9:16 Vertical", width: 768, height: 1344 }
];

const BASE_ADDITIONAL_TAGS = [
  "cinematic lighting",
  "detailed background",
  "depth of field",
  "dramatic shadows",
  "vibrant colors"
];

export const generationOptions: GenerationOptions = {
  defaultModelId: "illustrious-xl",
  models: {
    "illustrious-xl": {
      id: "illustrious-xl",
      label: "Illustrious XL",
      tags: ["anime style", "high quality illustration"],
      categories: baseCategories,
      additionalTagSuggestions: BASE_ADDITIONAL_TAGS,
      outputPresets: BASE_OUTPUT_PRESETS
    },
    "pony-v6": {
      id: "pony-v6",
      label: "Pony Diffusion V6",
      tags: ["anime style", "pony diffusion"],
      categories: baseCategories,
      additionalTagSuggestions: BASE_ADDITIONAL_TAGS,
      outputPresets: BASE_OUTPUT_PRESETS
    },
    "animagine-xl-v3": {
      id: "animagine-xl-v3",
      label: "Animagine XL v3",
      tags: ["anime style", "animagine"],
      categories: baseCategories,
      additionalTagSuggestions: BASE_ADDITIONAL_TAGS,
      outputPresets: BASE_OUTPUT_PRESETS
    }
  }
};
