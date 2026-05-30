import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { apiFetch } from "../utils/api";
import { buildWorkConfig } from "../utils/worksApi";
import type { GenerationCreateResponse, GenerationStatusEvent } from "../utils/worksApi";
import type { Work, WorkUpdater } from "../types";

interface UseGenerationParams {
  apiUrl: string;
  token: string;
  activeWork: Work | undefined;
  canGenerate: boolean;
  isGenerating: boolean;
  setWorks: Dispatch<SetStateAction<Work[]>>;
  updateWorkById: (workId: string, patch: Partial<Work>) => void;
  updateActiveWork: (updater: WorkUpdater) => void;
  patchWork: (work: Work) => Promise<void>;
  setWorkErrors: Dispatch<SetStateAction<Record<string, string>>>;
  handleApiError: (key: string, error: unknown, fallbackMessage: string) => void;
  onGenerationFailed?: () => void;
}

export interface UseGenerationState {
  showCancelModal: boolean;
  setShowCancelModal: Dispatch<SetStateAction<boolean>>;
  showGenerationValidation: boolean;
  handleGenerationAction: () => void;
  confirmCancelGeneration: () => void;
}

export const useGeneration = ({
  apiUrl,
  token,
  activeWork,
  canGenerate,
  isGenerating,
  setWorks,
  updateWorkById,
  updateActiveWork,
  patchWork,
  setWorkErrors,
  handleApiError,
  onGenerationFailed,
}: UseGenerationParams): UseGenerationState => {
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showGenerationValidation, setShowGenerationValidation] = useState(false);
  const generationSourceRef = useRef<EventSource | null>(null);

  const closeGenerationStream = useCallback(() => {
    generationSourceRef.current?.close();
    generationSourceRef.current = null;
  }, []);

  const startGeneration = useCallback(() => {
    if (!activeWork || !canGenerate) return;

    const workId = activeWork.id;
    const generationConfig = buildWorkConfig(activeWork);

    void (async () => {
      closeGenerationStream();
      setShowGenerationValidation(false);
      setWorkErrors((prev) => ({ ...prev, generation: "" }));
      updateWorkById(workId, { status: "queued", progress: 0 });
      void patchWork(activeWork);

      try {
        const response = await apiFetch(`${apiUrl}/works/${workId}/generations`, {
          method: "POST",
          body: JSON.stringify({
            modelId: generationConfig.selectedModel,
            selections: generationConfig.selections,
            selectedPreset: generationConfig.selectedPreset,
            seed: generationConfig.seed,
            additionalTags: generationConfig.additionalTags,
            additionalPrompt: generationConfig.additionalPrompt,
          }),
          token,
        });
        const result = (await response.json()) as GenerationCreateResponse;

        updateWorkById(workId, { status: result.status, progress: 0 });

        // Token passed in URL — EventSource does not support custom headers.
        const source = new EventSource(
          `${apiUrl}/generations/${result.generationId}/status?token=${encodeURIComponent(token)}`
        );
        generationSourceRef.current = source;

        source.addEventListener("status", (event) => {
          const payload = JSON.parse(event.data) as GenerationStatusEvent;
          const nextProgress =
            payload.progress ??
            (payload.status === "completed" || payload.status === "failed" ? 100 : 0);

          setWorks((currentWorks) =>
            currentWorks.map((work) => {
              if (work.id !== workId) return work;

              const isNewImage =
                payload.imageUrl && !work.images.some((image) => image.id === payload.generationId);

              const nextImages = isNewImage
                ? [
                    ...work.images,
                    {
                      id: payload.generationId,
                      url: payload.imageUrl!,
                      alt: "Generated anime character",
                      config: generationConfig,
                    },
                  ]
                : work.images;
              const shouldAutoSelect = Boolean(isNewImage);

              return {
                ...work,
                status: payload.status,
                progress: nextProgress,
                images: nextImages,
                activeImageIndex: shouldAutoSelect ? nextImages.length - 1 : work.activeImageIndex,
                viewingConfig: shouldAutoSelect ? generationConfig : work.viewingConfig,
              };
            })
          );

          if (payload.status === "completed" || payload.status === "failed") {
            source.close();
            if (generationSourceRef.current === source) {
              generationSourceRef.current = null;
            }
          }
        });

        source.onerror = () => {
          source.close();
          if (generationSourceRef.current === source) {
            generationSourceRef.current = null;
          }
          updateWorkById(workId, { status: "failed", progress: 100 });
          setWorkErrors((prev) => ({
            ...prev,
            generation: "Generation status stream disconnected",
          }));
        };
      } catch (error) {
        updateWorkById(workId, { status: "failed", progress: 100 });
        handleApiError("generation", error, "Could not start generation");
        onGenerationFailed?.();
      }
    })();
  }, [
    activeWork,
    apiUrl,
    canGenerate,
    closeGenerationStream,
    handleApiError,
    onGenerationFailed,
    patchWork,
    setWorks,
    setWorkErrors,
    token,
    updateWorkById,
  ]);

  const handleGenerationAction = useCallback(() => {
    if (isGenerating) {
      setShowCancelModal(true);
      return;
    }
    if (!canGenerate) {
      setShowGenerationValidation(true);
      return;
    }
    startGeneration();
  }, [canGenerate, isGenerating, startGeneration]);

  const confirmCancelGeneration = useCallback(() => {
    closeGenerationStream();
    updateActiveWork({ status: "idle", progress: 0 });
    setShowCancelModal(false);
  }, [closeGenerationStream, updateActiveWork]);

  useEffect(() => {
    return () => closeGenerationStream();
  }, [closeGenerationStream]);

  return {
    showCancelModal,
    setShowCancelModal,
    showGenerationValidation,
    handleGenerationAction,
    confirmCancelGeneration,
  };
};
