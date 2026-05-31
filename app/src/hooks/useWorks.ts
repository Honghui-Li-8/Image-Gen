import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../utils/api";
import { getSelectedTags, normalizeTags } from "../utils/tags";
import { buildWorkConfig } from "../utils/worksApi";
import { getMissingFieldIds } from "../utils/works";
import { useWorksData } from "./useWorksData";
import { useGeneration } from "./useGeneration";
import type {
  GeneratedImage,
  BatchGenerationMode,
  BatchGenerationState,
  GenerationOptions,
  ModelConfig,
  OptionsStatus,
  Work,
  WorkUpdater,
} from "../types";

interface UseWorksState {
  activeImage: GeneratedImage | undefined;
  activeModel: ModelConfig | null;
  activeWork: Work | undefined;
  activeWorkId: string;
  addWork: () => void;
  batchState: BatchGenerationState;
  commitTag: () => void;
  confirmCancelGeneration: () => void;
  customTags: string[];
  deleteImage: (generationId: string) => void;
  handleGenerationAction: () => void;
  startBatchGeneration: (mode: BatchGenerationMode, batchSize?: number) => void;
  isDirty: boolean;
  isGenerating: boolean;
  isLoadingWorks: boolean;
  isSaving: boolean;
  canGenerate: boolean;
  missingFieldIds: string[];
  moveImage: (offset: number) => void;
  removeTag: (tagToRemove: string) => void;
  deleteWork: (workId: string) => void;
  duplicateWork: (workId: string) => void;
  renameWork: (workId: string, name: string) => void;
  restoreViewing: () => void;
  saveWorks: () => void;
  selectDraft: () => void;
  selectImage: (index: number) => void;
  selectedTags: string[];
  setActiveWorkId: (workId: string) => void;
  setShowCancelModal: (show: boolean) => void;
  showCancelModal: boolean;
  showGenerationValidation: boolean;
  singleQueueCount: number;
  singleQueueMax: number;
  updateActiveWork: (updater: WorkUpdater) => void;
  works: Work[];
  workErrors: Record<string, string>;
}

export const useWorks = (
  apiUrl: string,
  token: string,
  options: GenerationOptions | null,
  optionsStatus: OptionsStatus,
  onUnauthorized: () => void,
  onGenerationFailed?: () => void
): UseWorksState => {
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const {
    works,
    setWorks,
    activeWorkId,
    setActiveWorkId,
    isLoadingWorks,
    workErrors,
    setWorkErrors,
    handleApiError,
    addWork,
    renameWork,
    duplicateWork,
    deleteWork,
  } = useWorksData(apiUrl, token, optionsStatus, onUnauthorized);

  // --- Derived state ---

  const activeWork = useMemo(
    () => works.find((w) => w.id === activeWorkId) ?? works[0],
    [works, activeWorkId]
  );

  const activeModel = useMemo((): ModelConfig | null => {
    if (!options) return null;
    const viewingModelId = activeWork?.viewingConfig?.selectedModel;
    const modelId =
      viewingModelId && options.models[viewingModelId]
        ? viewingModelId
        : activeWork?.selectedModel || options.defaultModelId;
    return options.models[modelId] ?? null;
  }, [options, activeWork?.selectedModel, activeWork?.viewingConfig?.selectedModel]);

  const selectedTags = useMemo(
    () => getSelectedTags(activeModel?.categories ?? [], activeWork?.selections || {}),
    [activeModel?.categories, activeWork?.selections]
  );

  const customTags = useMemo(
    () => normalizeTags(activeWork?.additionalTags),
    [activeWork?.additionalTags]
  );

  const activeImage = activeWork?.images?.[activeWork.activeImageIndex];
  const isGenerating = activeWork?.status === "queued" || activeWork?.status === "running";

  const missingFieldIds = useMemo(
    () => (activeWork && activeModel ? getMissingFieldIds(activeWork, activeModel) : []),
    [activeWork, activeModel]
  );

  const canGenerate = Boolean(activeWork && activeModel && missingFieldIds.length === 0);

  // --- Shared state mutators ---

  const updateActiveWork = useCallback(
    (updater: WorkUpdater) => {
      setWorks((currentWorks) =>
        currentWorks.map((work) => {
          if (work.id !== activeWork?.id) return work;
          return typeof updater === "function" ? updater(work) : { ...work, ...updater };
        })
      );
      setIsDirty(true);
    },
    [activeWork?.id, setWorks]
  );

  const updateWorkById = useCallback(
    (workId: string, patch: Partial<Work>) => {
      setWorks((currentWorks) =>
        currentWorks.map((work) => (work.id === workId ? { ...work, ...patch } : work))
      );
    },
    [setWorks]
  );

  const patchWork = useCallback(
    async (work: Work) => {
      try {
        await apiFetch(`${apiUrl}/works/${work.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: work.name, config: buildWorkConfig(work) }),
          token,
        });
        setIsDirty(false);
      } catch (error) {
        handleApiError("save", error, "Could not save work");
      }
    },
    [apiUrl, handleApiError, token]
  );

  // --- Generation sub-hook ---

  const generation = useGeneration({
    apiUrl,
    token,
    activeModel,
    activeWork,
    canGenerate,
    isGenerating,
    options,
    setWorks,
    updateWorkById,
    updateActiveWork,
    patchWork,
    setWorkErrors,
    handleApiError,
    onGenerationFailed,
  });

  // --- Save ---

  const saveWorks = useCallback(() => {
    if (!activeWork || isSaving) return;
    setIsSaving(true);
    setWorkErrors((prev) => ({ ...prev, save: "" }));
    void patchWork(activeWork).finally(() => setIsSaving(false));
  }, [activeWork, isSaving, patchWork, setWorkErrors]);

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

  // --- Image operations ---

  const selectImage = useCallback(
    (index: number) => {
      updateActiveWork((work) => {
        const clamped = Math.min(work.images.length - 1, Math.max(0, index));
        return {
          ...work,
          activeImageIndex: clamped,
          viewingConfig: work.images[clamped]?.config ?? null,
        };
      });
    },
    [updateActiveWork]
  );

  const selectDraft = useCallback(() => {
    updateActiveWork((work) => ({ ...work, viewingConfig: null }));
  }, [updateActiveWork]);

  const restoreViewing = useCallback(() => {
    if (!activeWork?.viewingConfig) return;
    const vc = activeWork.viewingConfig;
    const restored: Work = {
      ...activeWork,
      selectedModel: vc.selectedModel,
      selections: vc.selections,
      selectedPreset: vc.selectedPreset,
      seed: vc.seed,
      additionalTags: vc.additionalTags,
      additionalPrompt: vc.additionalPrompt,
      viewingConfig: null,
    };
    setWorks((currentWorks) =>
      currentWorks.map((work) => (work.id === activeWork.id ? restored : work))
    );
    setIsDirty(false);
    void patchWork(restored);
  }, [activeWork, patchWork, setWorks]);

  const deleteImage = useCallback(
    (generationId: string) => {
      if (!activeWork) return;
      const workId = activeWork.id;

      void (async () => {
        try {
          await apiFetch(`${apiUrl}/generations/${generationId}`, {
            method: "DELETE",
            token,
          });
          setWorks((currentWorks) =>
            currentWorks.map((work) => {
              if (work.id !== workId) return work;
              const nextImages = work.images.filter((img) => img.id !== generationId);
              const nextIndex = Math.min(work.activeImageIndex, Math.max(0, nextImages.length - 1));
              const wasViewing =
                work.viewingConfig && work.images[work.activeImageIndex]?.id === generationId;
              return {
                ...work,
                images: nextImages,
                activeImageIndex: nextIndex,
                viewingConfig: wasViewing ? null : work.viewingConfig,
              };
            })
          );
        } catch (error) {
          handleApiError("deleteImage", error, "Could not delete image");
        }
      })();
    },
    [activeWork, apiUrl, handleApiError, setWorks, token]
  );

  const moveImage = useCallback(
    (offset: number) => {
      if (!activeWork?.images?.length) return;
      updateActiveWork((work) => {
        const nextIndex = Math.min(
          work.images.length - 1,
          Math.max(0, work.activeImageIndex + offset)
        );
        return {
          ...work,
          activeImageIndex: nextIndex,
          viewingConfig: work.images[nextIndex]?.config ?? null,
        };
      });
    },
    [activeWork?.images?.length, updateActiveWork]
  );

  // --- Tag operations ---

  const commitTag = useCallback(() => {
    const tag = (activeWork?.tagDraft || "").trim();
    if (!tag) return;
    updateActiveWork((work) => {
      const currentTags = normalizeTags(work.additionalTags);
      if (currentTags.includes(tag)) return { ...work, tagDraft: "" };
      return { ...work, additionalTags: [...currentTags, tag], tagDraft: "" };
    });
  }, [activeWork?.tagDraft, updateActiveWork]);

  const removeTag = useCallback(
    (tagToRemove: string) => {
      updateActiveWork((work) => ({
        ...work,
        additionalTags: normalizeTags(work.additionalTags).filter((tag) => tag !== tagToRemove),
      }));
    },
    [updateActiveWork]
  );

  return {
    activeImage,
    activeModel,
    activeWork,
    activeWorkId,
    addWork,
    batchState: generation.batchState,
    commitTag,
    confirmCancelGeneration: generation.confirmCancelGeneration,
    customTags,
    deleteImage,
    deleteWork,
    duplicateWork,
    handleGenerationAction: generation.handleGenerationAction,
    startBatchGeneration: generation.startBatchGeneration,
    isDirty,
    isGenerating,
    isLoadingWorks,
    isSaving,
    canGenerate,
    missingFieldIds,
    moveImage,
    removeTag,
    renameWork,
    restoreViewing,
    saveWorks,
    selectDraft,
    selectImage,
    selectedTags,
    setActiveWorkId,
    setShowCancelModal: generation.setShowCancelModal,
    showCancelModal: generation.showCancelModal,
    showGenerationValidation: generation.showGenerationValidation,
    singleQueueCount: generation.singleQueueCount,
    singleQueueMax: generation.singleQueueMax,
    updateActiveWork,
    works,
    workErrors,
  };
};
