import { useCallback, useEffect, useMemo, useState } from "react";
import { createWork } from "../utils/works";
import { getSelectedTags, normalizeTags } from "../utils/tags";
import type {
  GeneratedImage,
  GenerationOptions,
  Work,
  WorkUpdater,
} from "../types";

const WORKS_STORAGE_KEY = "image-gen-works";

type OptionsStatus = "loading" | "ready" | "failed";

interface UseWorksState {
  activeImage: GeneratedImage | undefined;
  activeWork: Work | undefined;
  activeWorkId: string;
  addWork: () => void;
  commitTag: () => void;
  confirmCancelGeneration: () => void;
  customTags: string[];
  handleGenerationAction: () => void;
  isDirty: boolean;
  isGenerating: boolean;
  moveImage: (offset: number) => void;
  removeTag: (tagToRemove: string) => void;
  saveWorks: () => void;
  selectedTags: string[];
  setActiveWorkId: (workId: string) => void;
  setShowCancelModal: (show: boolean) => void;
  showCancelModal: boolean;
  updateActiveWork: (updater: WorkUpdater) => void;
  works: Work[];
}

export const useWorks = (
  options: GenerationOptions | null,
  optionsStatus: OptionsStatus,
): UseWorksState => {
  const [works, setWorks] = useState<Work[]>([]);
  const [activeWorkId, setActiveWorkId] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  const activeWork = works.find((work) => work.id === activeWorkId) || works[0];
  const selectedTags = useMemo(
    () => getSelectedTags(options, activeWork?.selections || {}),
    [options, activeWork?.selections],
  );
  const customTags = useMemo(
    () => normalizeTags(activeWork?.additionalTags),
    [activeWork?.additionalTags],
  );
  const activeImage = activeWork?.images?.[activeWork.activeImageIndex];
  const isGenerating =
    activeWork?.status === "queued" || activeWork?.status === "running";

  useEffect(() => {
    if (hasInitialized || optionsStatus === "loading") return;

    const savedWorks = JSON.parse(
      window.localStorage.getItem(WORKS_STORAGE_KEY) || "[]",
    ) as Work[];
    const initialWorks =
      savedWorks.length > 0 ? savedWorks : [createWork(options)];

    setWorks(initialWorks);
    setActiveWorkId(initialWorks[0]?.id || "");
    setHasInitialized(true);
  }, [hasInitialized, options, optionsStatus]);

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
    const savedAt = new Date().toISOString();
    const nextWorks = works.map((work) =>
      work.id === activeWork?.id ? { ...work, savedAt } : work,
    );

    window.localStorage.setItem(WORKS_STORAGE_KEY, JSON.stringify(nextWorks));
    setWorks(nextWorks);
    setIsDirty(false);
  }, [activeWork?.id, works]);

  const addWork = useCallback(() => {
    const nextWork = createWork(options, works.length + 1);
    setWorks((currentWorks) => [...currentWorks, nextWork]);
    setActiveWorkId(nextWork.id);
    setIsDirty(true);
  }, [options, works.length]);

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

  const startGeneration = useCallback(() => {
    if (!activeWork || !options) return;

    updateActiveWork({
      status: "queued",
      progress: 8,
    });
  }, [activeWork, options, updateActiveWork]);

  const handleGenerationAction = useCallback(() => {
    if (isGenerating) {
      setShowCancelModal(true);
      return;
    }

    startGeneration();
  }, [isGenerating, startGeneration]);

  const confirmCancelGeneration = useCallback(() => {
    updateActiveWork({
      status: "idle",
      progress: 0,
    });
    setShowCancelModal(false);
  }, [updateActiveWork]);

  useEffect(() => {
    if (!isGenerating) return undefined;

    const timer = window.setInterval(() => {
      updateActiveWork((work) => {
        if (work.status !== "queued" && work.status !== "running") return work;

        return {
          ...work,
          status: "running",
          progress: Math.min(94, work.progress + 4),
        };
      });
    }, 1200);

    return () => window.clearInterval(timer);
  }, [isGenerating, activeWork?.id, updateActiveWork]);

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
    activeWork,
    activeWorkId,
    addWork,
    commitTag,
    confirmCancelGeneration,
    customTags,
    handleGenerationAction,
    isDirty,
    isGenerating,
    moveImage,
    removeTag,
    saveWorks,
    selectedTags,
    setActiveWorkId,
    setShowCancelModal,
    showCancelModal,
    updateActiveWork,
    works,
  };
};
