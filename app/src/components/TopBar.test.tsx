import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopBar } from "./TopBar";
import type { BatchGenerationState, GenerationOptions, Work } from "../types";

const OPTIONS: GenerationOptions = {
  defaultModelId: "model-a",
  models: {},
};

const BATCH_STATE: BatchGenerationState = {
  active: false,
  mode: null,
  items: [],
  currentIndex: 0,
  total: 0,
  progress: 0,
  skippedModels: [],
};

const makeWork = (patch: Partial<Work> = {}): Work => ({
  id: "work-1",
  name: "Work 1",
  status: "running",
  progress: 50,
  selectedModel: "model-a",
  selections: {},
  selectedPreset: "portrait",
  seed: "123",
  additionalTags: [],
  tagDraft: "",
  additionalPrompt: "",
  images: [],
  activeImageIndex: 0,
  savedAt: null,
  viewingConfig: null,
  generationDetail: null,
  ...patch,
});

const renderTopBar = (activeWork: Work) =>
  render(
    <TopBar
      activeWork={activeWork}
      batchState={BATCH_STATE}
      comfyReachable
      isGenerating
      isLoadingWorks={false}
      isSaving={false}
      onBatchGeneration={vi.fn()}
      onGenerationAction={vi.fn()}
      onThemeToggle={vi.fn()}
      options={OPTIONS}
      serverStatus="healthy"
      theme="dark"
    />
  );

describe("TopBar generation detail", () => {
  it("renders sampling progress detail", () => {
    renderTopBar(
      makeWork({
        generationDetail: { stage: "sampling", step: 12, totalSteps: 28 },
      })
    );

    expect(screen.getByText("Sampling 12/28")).toBeDefined();
  });

  it("renders failed detail with a short reason", () => {
    renderTopBar(
      makeWork({
        status: "failed",
        progress: 100,
        generationDetail: {
          stage: "failed",
          message: "CUDA out of memory while allocating a very large tensor",
        },
      })
    );

    expect(screen.getByText("Generation failed: CUDA out of memory while alloc...")).toBeDefined();
  });
});
