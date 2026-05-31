import type { GeneratedImage, GenerationProgressDetail, Work, WorkStatus } from "../types";
import { normalizeTags } from "./tags";

export interface BackendWorkConfig {
  selectedModel: string;
  selections: Record<string, string>;
  selectedPreset: string;
  seed: string;
  additionalTags: string[];
  additionalPrompt: string;
}

// Generation config uses "modelId" (matches the POST body field name stored in the DB)
export interface BackendGenerationConfig {
  modelId: string;
  selections: Record<string, string>;
  selectedPreset: string;
  seed: string;
  additionalTags: string[];
  additionalPrompt: string;
}

export interface BackendGeneration {
  id: string;
  status: Exclude<WorkStatus, "idle">;
  imageUrl: string | null;
  config?: BackendGenerationConfig;
}

export interface BackendWork {
  id: string;
  name: string;
  config: BackendWorkConfig;
  activeGenerationId: string | null;
  updatedAt: string;
  generations?: BackendGeneration[];
}

export interface GenerationCreateResponse {
  generationId: string;
  status: Exclude<WorkStatus, "idle">;
}

export interface GenerationStatusEvent {
  generationId: string;
  status: Exclude<WorkStatus, "idle">;
  progress?: number;
  imageUrl?: string | null;
  error?: string | null;
  detail?: GenerationProgressDetail;
}

export const generationToImage = (generation: BackendGeneration): GeneratedImage | null => {
  if (!generation.imageUrl) return null;

  return {
    id: generation.id,
    url: generation.imageUrl,
    alt: "Generated anime character",
    config: generation.config
      ? {
          selectedModel: generation.config.modelId,
          selections: generation.config.selections,
          selectedPreset: generation.config.selectedPreset,
          seed: generation.config.seed,
          additionalTags: generation.config.additionalTags,
          additionalPrompt: generation.config.additionalPrompt,
        }
      : undefined,
  };
};

export const mapBackendWork = (backendWork: BackendWork): Work => {
  const generations = backendWork.generations ?? [];
  const activeGeneration = generations.find(
    (generation) => generation.id === backendWork.activeGenerationId
  );
  const images = generations
    .map(generationToImage)
    .filter((image): image is GeneratedImage => image !== null);

  return {
    id: backendWork.id,
    name: backendWork.name,
    status: activeGeneration?.status ?? "idle",
    progress: activeGeneration?.status === "completed" ? 100 : 0,
    generationDetail: null,
    selectedModel: backendWork.config.selectedModel,
    selections: backendWork.config.selections,
    selectedPreset: backendWork.config.selectedPreset,
    seed: backendWork.config.seed,
    additionalTags: backendWork.config.additionalTags,
    tagDraft: "",
    additionalPrompt: backendWork.config.additionalPrompt,
    images,
    activeImageIndex: Math.max(0, images.length - 1),
    savedAt: backendWork.updatedAt,
    viewingConfig: null,
  };
};

export const buildWorkConfig = (work: Work): BackendWorkConfig => ({
  selectedModel: work.selectedModel,
  selections: work.selections,
  selectedPreset: work.selectedPreset,
  seed: work.seed,
  additionalTags: normalizeTags(work.additionalTags),
  additionalPrompt: work.additionalPrompt,
});
