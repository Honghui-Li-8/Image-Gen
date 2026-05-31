export interface CategoryOption {
  value: string;
  label: string;
  tags: string[];
  negativeTags?: string[];
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
  basePixels: number;
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
      { value: "plump", label: "Plump", tags: ["chubby"] },
    ],
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
      { value: "prominent", label: "Prominent", tags: ["huge breasts"] },
    ],
  },
  {
    id: "hipSize",
    label: "Hip Size",
    group: "Form",
    control: "single-select",
    options: [
      { value: "small", label: "Small", tags: ["narrow hips", "slender thighs"] },
      { value: "medium", label: "Medium", tags: [] },
      { value: "large", label: "Large", tags: ["wide hips"] },
      { value: "prominent", label: "Prominent", tags: ["wide hips", "thick thighs"] },
    ],
  },
  {
    id: "hairStyle",
    label: "Hair Style",
    group: "Appearance",
    control: "single-select",
    options: [
      {
        value: "long-hair",
        label: "Long Hair",
        tags: ["long hair"],
        negativeTags: ["ponytail", "twintails"],
      },
      {
        value: "short-hair",
        label: "Short Hair",
        tags: ["short hair"],
        negativeTags: ["ponytail", "twintails"],
      },
      { value: "twintails", label: "Twintails", tags: ["twintails"] },
      { value: "ponytail", label: "Ponytail", tags: ["ponytail"] },
      { value: "bob-cut", label: "Bob Cut", tags: ["bob cut"] },
    ],
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
      { value: "white", label: "White", tags: ["white hair"] },
    ],
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
      { value: "purple", label: "Purple", tags: ["purple eyes"] },
    ],
  },
  {
    id: "clothingStyle",
    label: "Clothing Style",
    group: "Wardrobe",
    control: "single-select",
    options: [
      {
        value: "academy-uniform",
        label: "Academy Uniform",
        tags: ["school uniform", "pleated skirt", "modest clothing"],
      },
      {
        value: "jk-uniform",
        label: "JK Uniform",
        tags: ["seifuku", "sailor collar", "pleated skirt", "knee-highs", "loafers", "hair ribbon"],
        negativeTags: [
          "micro skirt",
          "suggestive",
          "pantyshot",
          "revealing clothes",
          "mask",
          "face mask",
          "covered face",
        ],
      },
      {
        value: "cyberpunk",
        label: "Cyberpunk",
        tags: ["cyberpunk", "neon lights", "bodysuit", "jacket", "open jacket", "exposed midriff"],
        negativeTags: ["mask", "face mask", "covered face", "visor", "gas mask"],
      },
      {
        value: "fantasy-armor",
        label: "Fantasy Armor",
        tags: ["armor", "breastplate", "pauldrons", "greaves"],
        negativeTags: [
          "helmet",
          "closed helmet",
          "full helmet",
          "face mask",
          "covered face",
          "gauntlets",
          "armored gloves",
        ],
      },
      {
        value: "casual",
        label: "Casual",
        tags: ["casual outfit", "t-shirt", "jacket", "long pants", "sneakers", "modest clothing"],
      },
      {
        value: "sci-fi",
        label: "Sci-Fi",
        tags: ["science fiction", "futuristic outfit", "bodysuit", "long coat"],
        negativeTags: ["mask", "face mask", "covered face", "visor", "gas mask", "space suit"],
      },
    ],
  },
];

const BASE_OUTPUT_PRESETS: OutputPreset[] = [
  { id: "portrait-2-3", label: "2:3 Portrait", width: 832, height: 1216 },
  { id: "portrait-3-4", label: "3:4 Portrait", width: 896, height: 1152 },
  { id: "vertical-9-16", label: "9:16 Vertical", width: 768, height: 1344 },
];

const BASE_ADDITIONAL_TAG_GROUPS: Record<string, string[]> = {
  Lighting: [
    "golden hour",
    "sunlight",
    "backlighting",
    "rim lighting",
    "soft lighting",
    "dappled light",
    "light rays",
    "moonlight",
    "candlelight",
    "neon lighting",
    "glowing",
    "lens flare",
    "cinematic lighting",
    "dramatic shadows",
  ],
  Atmosphere: ["dreamy", "ethereal", "atmospheric", "mysterious", "serene", "cozy"],
  Background: [
    "cherry blossoms",
    "sakura petals",
    "flower field",
    "starry sky",
    "night sky",
    "sunset",
    "rain",
    "snow",
    "forest background",
    "cityscape",
    "rooftop",
    "garden",
    "classroom",
    "street",
    "beach",
  ],
  "Particles & Effects": [
    "sparkles",
    "fireflies",
    "falling leaves",
    "snowflakes",
    "petals falling",
    "magic particles",
    "bokeh",
    "depth of field",
    "blurry background",
  ],
  Composition: ["detailed background", "lush scenery"],
  "Color Palette": ["pastel colors", "vivid colors", "warm color palette", "cool color palette"],
  Accessories: [
    "earrings",
    "necklace",
    "choker",
    "hair bow",
    "hair flower",
    "hair clip",
    "hair ornament",
    "bracelet",
    "ribbon",
    "scrunchie",
  ],
  Eyewear: ["glasses", "sunglasses"],
  "Clothing Details": ["scarf", "belt", "open jacket", "hoodie", "thighhighs", "stockings"],
  "Season & Time": ["spring", "summer", "autumn", "winter", "dawn", "dusk", "midnight"],
  Weather: ["cloudy sky", "clear sky", "foggy", "windy"],
};

const BASE_ADDITIONAL_TAGS = Object.values(BASE_ADDITIONAL_TAG_GROUPS).flat();

export const generationOptions: GenerationOptions = {
  defaultModelId: "animagine-xl-v3",
  models: {
    "animagine-xl-v3": {
      id: "animagine-xl-v3",
      label: "Animagine XL v3",
      tags: ["anime style", "animagine"],
      categories: baseCategories,
      additionalTagSuggestions: BASE_ADDITIONAL_TAGS,
      outputPresets: BASE_OUTPUT_PRESETS,
      basePixels: 1024 * 1536,
    },
    "illustrious-xl": {
      id: "illustrious-xl",
      label: "Amanatsu Illustrious v2",
      tags: ["anime style", "amanatsu illustrious", "high quality illustration"],
      categories: baseCategories,
      additionalTagSuggestions: BASE_ADDITIONAL_TAGS,
      outputPresets: BASE_OUTPUT_PRESETS,
      basePixels: 1024 * 1536,
    },
    "pony-v6": {
      id: "pony-v6",
      label: "Pony Diffusion V6",
      tags: ["anime style", "pony diffusion"],
      categories: baseCategories,
      additionalTagSuggestions: BASE_ADDITIONAL_TAGS,
      outputPresets: BASE_OUTPUT_PRESETS,
      basePixels: 832 * 1216,
    },
  },
};
