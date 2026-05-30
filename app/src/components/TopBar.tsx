import { getHealthLabel } from "../utils/health";
import type { GenerationOptions, ServerStatus, Theme, Work } from "../types";

interface TopBarProps {
  activeWork: Work | undefined;
  comfyReachable: boolean | null;
  isGenerating: boolean;
  isLoadingWorks: boolean;
  isSaving: boolean;
  onGenerationAction: () => void;
  onThemeToggle: () => void;
  options: GenerationOptions | null;
  serverStatus: ServerStatus;
  theme: Theme;
}

export const TopBar = ({
  activeWork,
  comfyReachable,
  isGenerating,
  isLoadingWorks,
  isSaving,
  onGenerationAction,
  onThemeToggle,
  options,
  serverStatus,
  theme,
}: TopBarProps) => {
  return (
    <header className="top-status-bar">
      <div className="brand-block">
        <span className="product-name">Image Gen</span>
        <span className="workspace-name">{activeWork?.name || "Loading work"}</span>
      </div>

      <div className="work-status">
        <div className="work-status-copy">
          <span>Work status</span>
          <strong>{activeWork?.status || "loading"}</strong>
        </div>
        <div className="progress-track" aria-label="Work progress">
          <div className="progress-fill" style={{ width: `${activeWork?.progress || 0}%` }} />
        </div>
        <span className="progress-value">{activeWork?.progress || 0}%</span>
        {comfyReachable === false && <span className="gpu-offline-label">GPU offline</span>}
        <button
          className={`generate-button ${isGenerating ? "generate-button--cancel" : ""}`}
          type="button"
          disabled={isLoadingWorks || isSaving || !options || comfyReachable === false}
          title={comfyReachable === false ? "ComfyUI is not reachable" : undefined}
          onClick={onGenerationAction}
        >
          {isGenerating ? "Cancel" : "Generate"}
        </button>
      </div>

      <div className="top-actions">
        <button className="theme-toggle" type="button" onClick={onThemeToggle}>
          {theme === "dark" ? "Light" : "Dark"}
        </button>
        <div className={`server-pill server-pill--${serverStatus}`}>
          <span className="server-dot" aria-hidden="true" />
          <span>{getHealthLabel(serverStatus)}</span>
        </div>
      </div>
    </header>
  );
};
