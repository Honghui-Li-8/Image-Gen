import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiFetch } from "../utils/api";
import { getSelectedTags, normalizeTags } from "../utils/tags";
import type {
  GeneratedImage,
  GenerationOptions,
  ModelConfig,
  Work,
  WorkStatus,
  WorkUpdater,
} from "../types";

type OptionsStatus = "loading" | "ready" | "failed";

interface BackendWorkConfig {
  selectedModel: string;
  selections: Record<string, string>;
  selectedPreset: string;
  seed: string;
  additionalTags: string[];
  additionalPrompt: string;
}

interface BackendGeneration {
  id: string;
  status: Exclude<WorkStatus, "idle">;
  imageUrl: string | null;
}

interface BackendWork {
  id: string;
  name: string;
  config: BackendWorkConfig;
  activeGenerationId: string | null;
  updatedAt: string;
  generations?: BackendGeneration[];
}

interface UseWorksState {
  activeImage: GeneratedImage | undefined;
  activeModel: ModelConfig | null;
  activeWork: Work | undefined;
  activeWorkId: string;
  addWork: () => void;
  commitTag: () => void;
  confirmCancelGeneration: () => void;
  customTags: string[];
  handleGenerationAction: () => void;
  isDirty: boolean;
  isGenerating: boolean;
  isLoadingWorks: boolean;
  isSaving: boolean;
  canGenerate: boolean;
  moveImage: (offset: number) => void;
  removeTag: (tagToRemove: string) => void;
  saveWorks: () => void;
  selectedTags: string[];
  setActiveWorkId: (workId: string) => void;
  setShowCancelModal: (show: boolean) => void;
  showCancelModal: boolean;
  updateActiveWork: (updater: WorkUpdater) => void;
  works: Work[];
  worksError: string;
}

const generationToImage = (generation: BackendGeneration): GeneratedImage | null => {
  if (!generation.imageUrl) return null;

  return {
    id: generation.id,
    url: generation.imageUrl,
    alt: "Generated anime character",
  };
};

const mapBackendWork = (backendWork: BackendWork): Work => {
  const generations = backendWork.generations ?? [];
  const activeGeneration = generations.find(
    (generation) => generation.id === backendWork.activeGenerationId,
  );
  const images = generations
    .map(generationToImage)
    .filter((image): image is GeneratedImage => image !== null);

  return {
    id: backendWork.id,
    name: backendWork.name,
    status: activeGeneration?.status ?? "idle",
    progress: activeGeneration?.status === "completed" ? 100 : 0,
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
  };
};

const buildWorkConfig = (work: Work): BackendWorkConfig => ({
  selectedModel: work.selectedModel,
  selections: work.selections,
  selectedPreset: work.selectedPreset,
  seed: work.seed,
  additionalTags: normalizeTags(work.additionalTags),
  additionalPrompt: work.additionalPrompt,
});

export const useWorks = (
  apiUrl: string,
  token: string,
  options: GenerationOptions | null,
  optionsStatus: OptionsStatus,
  onUnauthorized: () => void,
): UseWorksState => {
  const [works, setWorks] = useState<Work[]>([]);
  const [activeWorkId, setActiveWorkId] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [isLoadingWorks, setIsLoadingWorks] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [worksError, setWorksError] = useState("");

  const activeWork = works.find((work) => work.id === activeWorkId) || works[0];
  const activeModel = useMemo((): ModelConfig | null => {
    if (!options) return null;
    const modelId = activeWork?.selectedModel || options.defaultModelId;
    return options.models[modelId] ?? null;
  }, [options, activeWork?.selectedModel]);
  const selectedTags = useMemo(
    () => getSelectedTags(activeModel?.categories ?? [], activeWork?.selections || {}),
    [activeModel?.categories, activeWork?.selections],
  );
  const customTags = useMemo(
    () => normalizeTags(activeWork?.additionalTags),
    [activeWork?.additionalTags],
  );
  const activeImage = activeWork?.images?.[activeWork.activeImageIndex];
  const isGenerating =
    activeWork?.status === "queued" || activeWork?.status === "running";
  const canGenerate = Boolean(
    activeWork &&
      activeModel &&
      activeWork.selectedPreset &&
      activeModel.categories.every((category) => activeWork.selections[category.id]),
  );

  const handleApiError = useCallback(
    (error: unknown, fallbackMessage: string) => {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
        return;
      }

      setWorksError(error instanceof Error ? error.message : fallbackMessage);
    },
    [onUnauthorized],
  );

  const loadWorkDetails = useCallback(
    async (workList: BackendWork[]) => {
      const detailedWorks = await Promise.all(
        workList.map(async (work) => {
          const response = await apiFetch(`${apiUrl}/works/${work.id}`, { token });
          return (await response.json()) as BackendWork;
        }),
      );

      return detailedWorks.map(mapBackendWork);
    },
    [apiUrl, token],
  );

  useEffect(() => {
    if (optionsStatus === "loading") return undefined;

    let ignore = false;

    const loadWorks = async () => {
      setIsLoadingWorks(true);
      setWorksError("");

      try {
        const response = await apiFetch(`${apiUrl}/works`, { token });
        const backendWorks = (await response.json()) as BackendWork[];

        const sourceWorks =
          backendWorks.length > 0
            ? backendWorks
            : [
                (await (
                  await apiFetch(`${apiUrl}/works`, {
                    method: "POST",
                    body: JSON.stringify({}),
                    token,
                  })
                ).json()) as BackendWork,
              ];

        const mappedWorks = await loadWorkDetails(sourceWorks);

        if (!ignore) {
          setWorks(mappedWorks);
          setActiveWorkId(mappedWorks[0]?.id || "");
          setIsDirty(false);
        }
      } catch (error) {
        if (!ignore) {
          handleApiError(error, "Could not load works");
        }
      } finally {
        if (!ignore) {
          setIsLoadingWorks(false);
        }
      }
    };

    void loadWorks();

    return () => {
      ignore = true;
    };
  }, [apiUrl, handleApiError, loadWorkDetails, optionsStatus, token]);

  const updateActiveWork = useCallback(
    (updater: WorkUpdater) => {
      setWorks((currentWorks) =>
        currentWorks.map((work) => {
          if (work.id !== activeWork?.id) return work;
          return typeof updater === "function"
            ? updater(work)
            : { ...work, ...updater };
        }),
      );
      setIsDirty(true);
    },
    [activeWork?.id],
  );

  const saveWorks = useCallback(() => {
    if (!activeWork || isSaving) return;

    const saveActiveWork = async () => {
      setIsSaving(true);
      setWorksError("");

      try {
        const response = await apiFetch(`${apiUrl}/works/${activeWork.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: activeWork.name,
            config: buildWorkConfig(activeWork),
          }),
          token,
        });
        const savedWork = mapBackendWork((await response.json()) as BackendWork);

        setWorks((currentWorks) =>
          currentWorks.map((work) =>
            work.id === savedWork.id
              ? {
                  ...savedWork,
                  status: work.status,
                  progress: work.progress,
                  images: work.images,
                  activeImageIndex: work.activeImageIndex,
                }
              : work,
          ),
        );
        setIsDirty(false);
      } catch (error) {
        handleApiError(error, "Could not save work");
      } finally {
        setIsSaving(false);
      }
    };

    void saveActiveWork();
  }, [activeWork, apiUrl, handleApiError, isSaving, token]);

  const addWork = useCallback(() => {
    const createBackendWork = async () => {
      setWorksError("");

      try {
        const response = await apiFetch(`${apiUrl}/works`, {
          method: "POST",
          body: JSON.stringify({}),
          token,
        });
        const backendWork = (await response.json()) as BackendWork;
        const [nextWork] = await loadWorkDetails([backendWork]);

        setWorks((currentWorks) => [...currentWorks, nextWork]);
        setActiveWorkId(nextWork.id);
        setIsDirty(false);
      } catch (error) {
        handleApiError(error, "Could not create work");
      }
    };

    void createBackendWork();
  }, [apiUrl, handleApiError, loadWorkDetails, token]);

  const moveImage = useCallback(
    (offset: number) => {
      if (!activeWork?.images?.length) return;

      updateActiveWork((work) => {
        const maxIndex = work.images.length - 1;
        const nextIndex = Math.min(
          maxIndex,
          Math.max(0, work.activeImageIndex + offset),
        );
        return { ...work, activeImageIndex: nextIndex };
      });
    },
    [activeWork?.images?.length, updateActiveWork],
  );

  const commitTag = useCallback(() => {
    const tag = (activeWork?.tagDraft || "").trim();
    if (!tag) return;

    updateActiveWork((work) => {
      const currentTags = normalizeTags(work.additionalTags);
      if (currentTags.includes(tag)) {
        return { ...work, tagDraft: "" };
      }

      return {
        ...work,
        additionalTags: [...currentTags, tag],
        tagDraft: "",
      };
    });
  }, [activeWork?.tagDraft, updateActiveWork]);

  const removeTag = useCallback(
    (tagToRemove: string) => {
      updateActiveWork((work) => ({
        ...work,
        additionalTags: normalizeTags(work.additionalTags).filter(
          (tag) => tag !== tagToRemove,
        ),
      }));
    },
    [updateActiveWork],
  );

  const handleGenerationAction = useCallback(() => {
    if (isGenerating) {
      setShowCancelModal(true);
      return;
    }

    if (!canGenerate) return;
  }, [canGenerate, isGenerating]);

  const confirmCancelGeneration = useCallback(() => {
    updateActiveWork({
      status: "idle",
      progress: 0,
    });
    setShowCancelModal(false);
  }, [updateActiveWork]);

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveWorks();
      }
    };

    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [saveWorks]);

  return {
    activeImage,
    activeModel,
    activeWork,
    activeWorkId,
    addWork,
    commitTag,
    confirmCancelGeneration,
    customTags,
    handleGenerationAction,
    isDirty,
    isGenerating,
    isLoadingWorks,
    isSaving,
    canGenerate,
    moveImage,
    removeTag,
    saveWorks,
    selectedTags,
    setActiveWorkId,
    setShowCancelModal,
    showCancelModal,
    updateActiveWork,
    works,
    worksError,
  };
};
