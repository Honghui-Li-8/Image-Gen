export type HealthStatus = "checking" | "healthy" | "unhealthy" | "offline";
export type OptionsStatus = "loading" | "ready" | "failed";
export type ServerStatus = HealthStatus | "working";
export type WorkStatus = "idle" | "queued" | "running" | "completed" | "failed";
export type Theme = "dark" | "light";

export interface GenerationProgressDetail {
  stage?: "queued" | "executing" | "sampling" | "finalizing" | "completed" | "failed";
  nodeId?: string;
  nodeLabel?: string;
  step?: number;
  totalSteps?: number;
  message?: string;
}

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

export interface ModelConfig {
  id: string;
  label: string;
  tags: string[];
  categories: GenerationCategory[];
  additionalTagSuggestions: string[];
  outputPresets: OutputPreset[];
}

export interface GenerationOptions {
  models: Record<string, ModelConfig>;
  defaultModelId: string;
}

export interface WorkConfig {
  selectedModel: string;
  selections: Record<string, string>;
  selectedPreset: string;
  seed: string;
  additionalTags: string[];
  additionalPrompt: string;
}

export interface GeneratedImage {
  id?: string;
  url: string;
  alt?: string;
  config?: WorkConfig;
}

export type BatchGenerationMode = "model" | "seed" | "config";
export type BatchGenerationItemStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export interface BatchGenerationItem {
  id: string;
  config: WorkConfig;
  status: BatchGenerationItemStatus;
  progress: number;
  imageUrl?: string | null;
  error?: string | null;
}

export interface BatchGenerationState {
  active: boolean;
  workId: string | null;
  mode: BatchGenerationMode | null;
  items: BatchGenerationItem[];
  currentIndex: number;
  total: number;
  progress: number;
  skippedModels: Array<{
    modelId: string;
    modelLabel: string;
    incompatibleFields: string[];
  }>;
}

export interface Work {
  id: string;
  name: string;
  status: WorkStatus;
  progress: number;
  generationDetail?: GenerationProgressDetail | null;
  selectedModel: string;
  selections: Record<string, string>;
  selectedPreset: string;
  seed: string;
  additionalTags: string[] | string;
  tagDraft: string;
  additionalPrompt: string;
  images: GeneratedImage[];
  activeImageIndex: number;
  savedAt: string | null;
  viewingConfig: WorkConfig | null;
}

export type WorkUpdater = Partial<Work> | ((work: Work) => Work);
