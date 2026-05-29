export type HealthStatus = "checking" | "healthy" | "unhealthy" | "offline";
export type ServerStatus = HealthStatus | "working";
export type WorkStatus = "idle" | "queued" | "running" | "completed" | "failed";
export type Theme = "dark" | "light";

export interface ApiHealth {
  status: HealthStatus;
  message: string;
  checkedAt?: string;
  detail?: string;
}

export interface GenerationOption {
  value: string;
  label: string;
  tags: string[];
}

export interface GenerationCategory {
  id: string;
  label: string;
  group: string;
  control: string;
  options: GenerationOption[];
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
  categories: GenerationCategory[];
  additionalTagSuggestions: string[];
  outputPresets: OutputPreset[];
}

export interface GeneratedImage {
  id?: string;
  url: string;
  alt?: string;
}

export interface Work {
  id: string;
  name: string;
  status: WorkStatus;
  progress: number;
  selections: Record<string, string>;
  selectedPreset: string;
  seed: string;
  additionalTags: string[] | string;
  tagDraft: string;
  additionalPrompt: string;
  images: GeneratedImage[];
  activeImageIndex: number;
  savedAt: string | null;
}

export type WorkUpdater = Partial<Work> | ((work: Work) => Work);
