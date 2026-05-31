import { useState } from "react";
import { getHealthLabel } from "../utils/health";
import type {
  BatchGenerationMode,
  BatchGenerationState,
  GenerationOptions,
  ServerStatus,
  Theme,
  Work,
} from "../types";

interface TopBarProps {
  activeWork: Work | undefined;
  batchState: BatchGenerationState;
  comfyReachable: boolean | null;
  isGenerating: boolean;
  isLoadingWorks: boolean;
  isSaving: boolean;
  onBatchGeneration: (mode: BatchGenerationMode, batchSize?: number) => void;
  onCancelGeneration: () => void;
  onGenerationAction: () => void;
  onThemeToggle: () => void;
  options: GenerationOptions | null;
  serverStatus: ServerStatus;
  singleQueueCount: number;
  singleQueueMax: number;
  theme: Theme;
}

const truncateReason = (message: string): string =>
  message.length > 30 ? `${message.slice(0, 30)}...` : message;

const getGenerationDetailLabel = (work: Work | undefined): string | null => {
  if (
    !work ||
    (work.status !== "queued" && work.status !== "running" && work.status !== "failed")
  ) {
    return null;
  }

  const detail = work.generationDetail;
  if (work.status === "failed") {
    return detail?.message
      ? `Generation failed: ${truncateReason(detail.message)}`
      : "Generation failed";
  }
  if (!detail) return work.status === "queued" ? "Queued" : null;
  if (detail.stage === "sampling" && detail.step !== undefined && detail.totalSteps !== undefined) {
    return `Sampling ${detail.step}/${detail.totalSteps}`;
  }
  if (detail.stage === "finalizing") return "Finalizing";
  if (detail.stage === "queued") return detail.message ?? "Queued";
  if (detail.stage === "executing") {
    return detail.nodeLabel
      ? `Running ${detail.nodeLabel}`
      : detail.nodeId
        ? `Running node ${detail.nodeId}`
        : "Running";
  }
  return detail.message ?? null;
};

const BATCH_HINTS: Record<BatchGenerationMode, string> = {
  model: "* Runs one generation per compatible model.\n* Same input.",
  seed: "* Randomizes only the seed for each item.\n* Same model and rest input.",
  config: "* Randomizes only config selections.\n* Same model and rest input.",
};

export const TopBar = ({
  activeWork,
  batchState,
  comfyReachable,
  isGenerating,
  isLoadingWorks,
  isSaving,
  onBatchGeneration,
  onCancelGeneration,
  onGenerationAction,
  onThemeToggle,
  options,
  serverStatus,
  singleQueueCount,
  singleQueueMax,
  theme,
}: TopBarProps) => {
  const [batchMenuOpen, setBatchMenuOpen] = useState(false);
  const [batchMode, setBatchMode] = useState<BatchGenerationMode>("config");
  const [batchSize, setBatchSize] = useState(5);
  const generationDetailLabel = getGenerationDetailLabel(activeWork);
  const isQueueFull = isGenerating && singleQueueCount >= singleQueueMax;
  const isGenerationDisabled =
    isLoadingWorks ||
    isSaving ||
    !options ||
    comfyReachable === false ||
    batchState.active ||
    isQueueFull;
  const isBatchDisabled = isGenerationDisabled || isGenerating || batchState.active;
  const displayedProgress = batchState.active ? batchState.progress : activeWork?.progress || 0;
  const displayedStatus = batchState.active ? "batch running" : activeWork?.status || "loading";
  const batchProgressLabel = batchState.active
    ? `Generating ${Math.min(batchState.currentIndex + 1, batchState.total)}/${batchState.total}`
    : null;

  const startBatch = () => {
    onBatchGeneration(batchMode, batchMode === "model" ? undefined : batchSize);
    setBatchMenuOpen(false);
  };

  return (
    <header className="top-status-bar">
      <div className="brand-block">
        <span className="product-name">Image Gen</span>
        <span className="workspace-name">{activeWork?.name || "Loading work"}</span>
      </div>

      <div className="work-status">
        <div className="work-status-copy">
          <span>Work status</span>
          <strong>{displayedStatus}</strong>
        </div>
        <div className="progress-track" aria-label="Work progress">
          <div className="progress-fill" style={{ width: `${displayedProgress}%` }} />
        </div>
        <span className="progress-value">{displayedProgress}%</span>
        {generationDetailLabel && (
          <span className="generation-detail-label" title={generationDetailLabel}>
            {generationDetailLabel}
          </span>
        )}
        {batchProgressLabel && (
          <span className="generation-detail-label" title={batchProgressLabel}>
            {batchProgressLabel}
          </span>
        )}
        {comfyReachable === false && <span className="gpu-offline-label">GPU offline</span>}
      </div>

      <div className="top-actions">
        <div className="generate-control">
          <button
            className="generate-button"
            type="button"
            disabled={isGenerationDisabled}
            title={
              comfyReachable === false
                ? "ComfyUI is not reachable"
                : isQueueFull
                  ? "Generation queue is full"
                  : undefined
            }
            onClick={onGenerationAction}
          >
            {isGenerating ? "Queue" : "Generate"}
          </button>
          <button
            aria-label="Open batch generation options"
            className="generate-menu-button"
            type="button"
            disabled={isBatchDisabled}
            onClick={() => setBatchMenuOpen((open) => !open)}
          >
            ▾
          </button>
          {batchMenuOpen && (
            <div className="generate-menu">
              <div className="generate-menu-heading">
                <strong>Batch-gen</strong>
              </div>
              <label>
                <span>Batch-gen mode</span>
                <select
                  value={batchMode}
                  onChange={(event) => setBatchMode(event.target.value as BatchGenerationMode)}
                >
                  <option value="config">Random config selections</option>
                  <option value="seed">Random seed</option>
                  <option value="model">Per model</option>
                </select>
              </label>
              {batchMode !== "model" && (
                <label>
                  <span>Batch size</span>
                  <select
                    value={batchSize}
                    onChange={(event) => setBatchSize(Number(event.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="generate-menu-hint">{BATCH_HINTS[batchMode]}</p>
              <button className="generate-menu-start" type="button" onClick={startBatch}>
                Start batch
              </button>
            </div>
          )}
        </div>
        {singleQueueCount > 0 && (
          <span className="queue-count">
            Queued {singleQueueCount}/{singleQueueMax}
          </span>
        )}
        {(isGenerating || batchState.active) && (
          <button className="cancel-inline-button" type="button" onClick={onCancelGeneration}>
            Cancel
          </button>
        )}
        <button
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="theme-toggle"
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          type="button"
          onClick={onThemeToggle}
        >
          {theme === "dark" ? (
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="m4.93 4.93 1.41 1.41" />
              <path d="m17.66 17.66 1.41 1.41" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="m6.34 17.66-1.41 1.41" />
              <path d="m19.07 4.93-1.41 1.41" />
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 3a6.8 6.8 0 0 0 8.8 8.8 8 8 0 1 1-8.8-8.8Z" />
            </svg>
          )}
        </button>
        <div className={`server-pill server-pill--${serverStatus}`}>
          <span className="server-dot" aria-hidden="true" />
          <span>{getHealthLabel(serverStatus)}</span>
        </div>
      </div>
    </header>
  );
};
