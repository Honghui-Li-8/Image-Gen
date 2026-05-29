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

export interface GenerationOptions {
  model: {
    id: string;
    label: string;
    tags: string[];
  };
  promptDefaults: {
    positive: string[];
    negative: string[];
  };
  categories: Category[];
  additionalTagSuggestions: string[];
  outputPresets: OutputPreset[];
}

export const generationOptions: GenerationOptions = {
  model: {
    id: "anime-xl",
    label: "Anime XL",
    tags: ["anime style", "high quality illustration"]
  },
  promptDefaults: {
    positive: [
      "masterpiece",
      "best quality",
      "anime style",
      "full body",
      "full-length portrait",
      "standing",
      "head to toe",
      "feet visible",
      "solo",
      "centered composition"
    ],
    negative: [
      "cropped",
      "close-up",
      "portrait",
      "upper body",
      "half body",
      "out of frame",
      "missing feet",
      "missing legs",
      "bad anatomy",
      "extra limbs"
    ]
  },
  categories: [
    {
      id: "bodyType",
      label: "Body Type",
      group: "Form",
      control: "single-select",
      options: [
        { value: "slender", label: "Slender", tags: ["slender body", "slim figure"] },
        { value: "athletic", label: "Athletic", tags: ["athletic body", "toned body"] },
        { value: "average", label: "Average", tags: ["average body"] },
        { value: "plump", label: "Plump", tags: ["plump body", "soft body"] }
      ]
    },
    {
      id: "breastSize",
      label: "Breast Size",
      group: "Form",
      control: "single-select",
      options: [
        { value: "subtle", label: "Subtle", tags: ["subtle bust"] },
        { value: "small", label: "Small", tags: ["small breasts"] },
        { value: "medium", label: "Medium", tags: ["medium breasts"] },
        { value: "large", label: "Large", tags: ["large breasts"] },
        { value: "prominent", label: "Prominent", tags: ["prominent breasts"] }
      ]
    },
    {
      id: "hipSize",
      label: "Hip Size",
      group: "Form",
      control: "single-select",
      options: [
        { value: "subtle", label: "Subtle", tags: ["narrow hips"] },
        { value: "small", label: "Small", tags: ["small hips"] },
        { value: "medium", label: "Medium", tags: ["medium hips"] },
        { value: "large", label: "Large", tags: ["wide hips"] },
        { value: "prominent", label: "Prominent", tags: ["prominent hips"] }
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
        { value: "academy-uniform", label: "Academy Uniform", tags: ["academy uniform", "pleated skirt"] },
        { value: "cyberpunk", label: "Cyberpunk", tags: ["cyberpunk outfit", "neon accents", "techwear"] },
        { value: "fantasy-armor", label: "Fantasy Armor", tags: ["fantasy armor", "ornate armor"] },
        { value: "casual", label: "Casual", tags: ["casual outfit"] },
        { value: "sci-fi", label: "Sci-Fi", tags: ["sci-fi outfit", "futuristic clothing"] }
      ]
    }
  ],
  additionalTagSuggestions: [
    "cinematic lighting",
    "detailed background",
    "depth of field",
    "dramatic shadows",
    "vibrant colors"
  ],
  outputPresets: [
    { id: "portrait-2-3", label: "2:3 Portrait", width: 832, height: 1216 },
    { id: "portrait-3-4", label: "3:4 Portrait", width: 896, height: 1152 },
    { id: "vertical-9-16", label: "9:16 Vertical", width: 768, height: 1344 }
  ]
};
