import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ApiError, apiFetch } from "../utils/api";
import {
  buildConfigSelectionBatchConfigs,
  buildModelBatchConfigs,
  buildSeedBatchConfigs,
} from "../utils/batchGeneration";
import { buildWorkConfig } from "../utils/worksApi";
import type {
  GenerationCancelResponse,
  GenerationCreateResponse,
  GenerationPreflightResponse,
  GenerationStatusEvent,
} from "../utils/worksApi";
import type {
  BatchGenerationItem,
  BatchGenerationMode,
  BatchGenerationState,
  GenerationOptions,
  ModelConfig,
  Work,
  WorkConfig,
  WorkUpdater,
} from "../types";

interface UseGenerationParams {
  apiUrl: string;
  token: string;
  activeModel: ModelConfig | null;
  activeWork: Work | undefined;
  canGenerate: boolean;
  isGenerating: boolean;
  options: GenerationOptions | null;
  setWorks: Dispatch<SetStateAction<Work[]>>;
  updateWorkById: (workId: string, patch: Partial<Work>) => void;
  updateActiveWork: (updater: WorkUpdater) => void;
  patchWork: (work: Work) => Promise<void>;
  setWorkErrors: Dispatch<SetStateAction<Record<string, string>>>;
  handleApiError: (key: string, error: unknown, fallbackMessage: string) => void;
  onGenerationFailed?: () => void;
}

export interface UseGenerationState {
  batchState: BatchGenerationState;
  singleQueueCount: number;
  singleQueueMax: number;
  showCancelModal: boolean;
  setShowCancelModal: Dispatch<SetStateAction<boolean>>;
  showGenerationValidation: boolean;
  handleGenerationAction: () => void;
  startBatchGeneration: (mode: BatchGenerationMode, batchSize?: number) => void;
  confirmCancelGeneration: () => void;
}

const emptyBatchState = (): BatchGenerationState => ({
  active: false,
  mode: null,
  items: [],
  currentIndex: 0,
  total: 0,
  progress: 0,
  skippedModels: [],
});

const formatGenerationFailure = (error: string | null | undefined): string => {
  if (!error) return "Generation failed";
  const firstLine = error.split("\n")[0]?.trim() ?? "";
  if (!firstLine) return "Generation failed";
  const snippet = firstLine.length > 30 ? `${firstLine.slice(0, 30)}...` : firstLine;
  return `Generation failed: ${snippet}`;
};

const serializeGenerationRequest = (config: WorkConfig) => ({
  modelId: config.selectedModel,
  selections: config.selections,
  selectedPreset: config.selectedPreset,
  seed: config.seed,
  additionalTags: config.additionalTags,
  additionalPrompt: config.additionalPrompt,
});

const makeBatchItemId = (index: number): string => `batch_${Date.now()}_${index}`;
const SINGLE_QUEUE_MAX = 5;

const computeAggregateProgress = (items: BatchGenerationItem[]): number => {
  if (items.length === 0) return 0;
  const total = items.reduce((sum, item) => sum + item.progress, 0);
  return Math.round(total / items.length);
};

export const useGeneration = ({
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
}: UseGenerationParams): UseGenerationState => {
  const [batchState, setBatchState] = useState<BatchGenerationState>(() => emptyBatchState());
  const [singleQueueCount, setSingleQueueCount] = useState(0);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showGenerationValidation, setShowGenerationValidation] = useState(false);
  const activeGenerationIdRef = useRef<string | null>(null);
  const batchCanceledRef = useRef(false);
  const generationSourceRef = useRef<EventSource | null>(null);
  const singleQueueRef = useRef<WorkConfig[]>([]);

  const setSingleQueue = useCallback((items: WorkConfig[]) => {
    singleQueueRef.current = items;
    setSingleQueueCount(items.length);
  }, []);

  const closeGenerationStream = useCallback(() => {
    generationSourceRef.current?.close();
    generationSourceRef.current = null;
  }, []);

  const updateBatchItem = useCallback(
    (itemId: string, patch: Partial<BatchGenerationItem>) => {
      setBatchState((current) => {
        const nextItems = current.items.map((item) =>
          item.id === itemId ? { ...item, ...patch } : item
        );
        return {
          ...current,
          items: nextItems,
          progress: computeAggregateProgress(nextItems),
        };
      });
    },
    []
  );

  const runGenerationConfig = useCallback(
    async (workId: string, generationConfig: WorkConfig, itemId?: string): Promise<void> => {
      const response = await apiFetch(`${apiUrl}/works/${workId}/generations`, {
        method: "POST",
        body: JSON.stringify(serializeGenerationRequest(generationConfig)),
        token,
      });
      const result = (await response.json()) as GenerationCreateResponse;
      activeGenerationIdRef.current = result.generationId;

      updateWorkById(workId, { status: result.status, progress: 0, generationDetail: null });
      if (itemId) {
        updateBatchItem(itemId, { status: result.status, progress: 0 });
      }

      await new Promise<void>((resolve) => {
        const source = new EventSource(
          `${apiUrl}/generations/${result.generationId}/status?token=${encodeURIComponent(token)}`
        );
        generationSourceRef.current = source;

        source.addEventListener("status", (event) => {
          const payload = JSON.parse(event.data) as GenerationStatusEvent;
          const nextProgress =
            payload.progress ??
            (payload.status === "completed" || payload.status === "failed" ? 100 : 0);

          if (itemId) {
            updateBatchItem(itemId, {
              status: payload.status,
              progress: nextProgress,
              imageUrl: payload.imageUrl,
              error: payload.error,
            });
          }

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
                generationDetail:
                  payload.status === "completed" ? null : (payload.detail ?? work.generationDetail),
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
            activeGenerationIdRef.current = null;
            if (payload.status === "failed") {
              if (import.meta.env.DEV && payload.error) {
                console.error("Generation failed", payload.error);
              }
              setWorkErrors((prev) => ({
                ...prev,
                generation: formatGenerationFailure(payload.error),
              }));
            }
            resolve();
          }
        });

        source.onerror = () => {
          source.close();
          if (generationSourceRef.current === source) {
            generationSourceRef.current = null;
          }
          activeGenerationIdRef.current = null;
          updateWorkById(workId, {
            status: "failed",
            progress: 100,
            generationDetail: { stage: "failed", message: "Status stream disconnected" },
          });
          if (itemId) {
            updateBatchItem(itemId, {
              status: "failed",
              progress: 100,
              error: "Generation status stream disconnected",
            });
          }
          setWorkErrors((prev) => ({
            ...prev,
            generation: "Generation status stream disconnected",
          }));
          resolve();
        };
      });
    },
    [apiUrl, setWorks, setWorkErrors, token, updateBatchItem, updateWorkById]
  );

  const startGeneration = useCallback(() => {
    if (!activeWork || !canGenerate) return;

    const workId = activeWork.id;
    const generationConfig = buildWorkConfig(activeWork);

    void (async () => {
      closeGenerationStream();
      setShowGenerationValidation(false);
      setWorkErrors((prev) => ({ ...prev, generation: "" }));
      updateWorkById(workId, { status: "queued", progress: 0, generationDetail: null });
      void patchWork(activeWork);

      try {
        await runGenerationConfig(workId, generationConfig);
        while (singleQueueRef.current.length > 0 && !batchCanceledRef.current) {
          const [nextConfig, ...remaining] = singleQueueRef.current;
          setSingleQueue(remaining);
          await runGenerationConfig(workId, nextConfig);
        }
      } catch (error) {
        activeGenerationIdRef.current = null;
        updateWorkById(workId, {
          status: "failed",
          progress: 100,
          generationDetail: { stage: "failed", message: "Could not start generation" },
        });
        handleApiError("generation", error, "Could not start generation");
        onGenerationFailed?.();
      }
    })();
  }, [
    activeWork,
    canGenerate,
    closeGenerationStream,
    handleApiError,
    onGenerationFailed,
    patchWork,
    runGenerationConfig,
    setSingleQueue,
    setWorkErrors,
    updateWorkById,
  ]);

  const enqueueSingleGeneration = useCallback(() => {
    if (!activeWork || !canGenerate || singleQueueRef.current.length >= SINGLE_QUEUE_MAX) {
      if (!canGenerate) setShowGenerationValidation(true);
      return;
    }
    setSingleQueue([...singleQueueRef.current, buildWorkConfig(activeWork)]);
  }, [activeWork, canGenerate, setSingleQueue]);

  const startBatchGeneration = useCallback(
    (mode: BatchGenerationMode, batchSize = 1) => {
      if (!activeWork || !activeModel || !canGenerate || !options) {
        if (!canGenerate) setShowGenerationValidation(true);
        return;
      }

      const workId = activeWork.id;
      const baseConfig = buildWorkConfig(activeWork);
      const modelPlan = mode === "model" ? buildModelBatchConfigs(baseConfig, options.models) : null;
      const planItems =
        mode === "model"
          ? (modelPlan?.items ?? [])
          : mode === "seed"
            ? buildSeedBatchConfigs(baseConfig, batchSize)
            : buildConfigSelectionBatchConfigs(baseConfig, activeModel, batchSize);
      const items: BatchGenerationItem[] = planItems.map((item, index) => ({
        id: makeBatchItemId(index),
        config: item.config,
        status: "pending",
        progress: 0,
      }));
      const skippedModels = modelPlan?.skippedModels ?? [];

      if (items.length === 0) {
        setBatchState({
          active: false,
          mode,
          items,
          currentIndex: 0,
          total: 0,
          progress: 0,
          skippedModels,
        });
        return;
      }

      void (async () => {
        closeGenerationStream();
        batchCanceledRef.current = false;
        setShowGenerationValidation(false);
        setWorkErrors((prev) => ({ ...prev, generation: "" }));

        try {
          const preflight = await apiFetch(`${apiUrl}/works/${workId}/generations/preflight`, {
            method: "POST",
            body: JSON.stringify({ batchSize: items.length, mode }),
            token,
          });
          const preflightResult = (await preflight.json()) as GenerationPreflightResponse;
          if (!preflightResult.canSchedule) {
            setWorkErrors((prev) => ({
              ...prev,
              generation: preflightResult.reason ?? "Could not start batch",
            }));
            return;
          }

          setBatchState({
            active: true,
            mode,
            items,
            currentIndex: 0,
            total: items.length,
            progress: 0,
            skippedModels,
          });
          updateWorkById(workId, { status: "queued", progress: 0, generationDetail: null });
          void patchWork(activeWork);

          for (const [index, item] of items.entries()) {
            if (batchCanceledRef.current) break;
            setBatchState((current) => ({ ...current, currentIndex: index }));
            updateBatchItem(item.id, { status: "queued", progress: 0, error: null });
            try {
              await runGenerationConfig(workId, item.config, item.id);
            } catch (error) {
              updateBatchItem(item.id, {
                status: "failed",
                progress: 100,
                error: error instanceof Error ? error.message : "Generation failed",
              });
              if (error instanceof ApiError && error.status === 429) {
                setWorkErrors((prev) => ({
                  ...prev,
                  generation: "GPU busy, try again shortly",
                }));
                break;
              }
            }
          }
        } catch (error) {
          handleApiError("generation", error, "Could not start batch");
        } finally {
          activeGenerationIdRef.current = null;
          setBatchState((current) => ({
            ...current,
            active: false,
            progress: computeAggregateProgress(current.items),
          }));
        }
      })();
    },
    [
      activeModel,
      activeWork,
      apiUrl,
      canGenerate,
      closeGenerationStream,
      handleApiError,
      options,
      patchWork,
      runGenerationConfig,
      setWorkErrors,
      token,
      updateBatchItem,
      updateWorkById,
    ]
  );

  const handleGenerationAction = useCallback(() => {
    if (isGenerating) {
      enqueueSingleGeneration();
      return;
    }
    if (batchState.active) {
      return;
    }
    if (!canGenerate) {
      setShowGenerationValidation(true);
      return;
    }
    startGeneration();
  }, [batchState.active, canGenerate, enqueueSingleGeneration, isGenerating, startGeneration]);

  const confirmCancelGeneration = useCallback(() => {
    const generationId = activeGenerationIdRef.current;
    batchCanceledRef.current = true;
    setSingleQueue([]);
    if (generationId) {
      void apiFetch(`${apiUrl}/generations/${generationId}/cancel`, {
        method: "POST",
        token,
      })
        .then((response) => response.json() as Promise<GenerationCancelResponse>)
        .catch((error) => {
          handleApiError("generation", error, "Could not cancel generation");
        });
    }
    closeGenerationStream();
    activeGenerationIdRef.current = null;
    setBatchState((current) => ({
      ...current,
      active: false,
      items: current.items.map((item) =>
        item.status === "pending" || item.status === "queued" || item.status === "running"
          ? { ...item, status: "canceled", progress: 100, error: "Generation canceled by user" }
          : item
      ),
    }));
    updateActiveWork({ status: "idle", progress: 0, generationDetail: null });
    setShowCancelModal(false);
  }, [apiUrl, closeGenerationStream, handleApiError, token, updateActiveWork]);

  useEffect(() => {
    return () => closeGenerationStream();
  }, [closeGenerationStream]);

  return {
    batchState,
    singleQueueCount,
    singleQueueMax: SINGLE_QUEUE_MAX,
    showCancelModal,
    setShowCancelModal,
    showGenerationValidation,
    handleGenerationAction,
    startBatchGeneration,
    confirmCancelGeneration,
  };
};
