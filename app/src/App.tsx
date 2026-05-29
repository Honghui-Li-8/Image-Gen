import { useState } from "react";
import { ConfigSidebar } from "./components/ConfigSidebar";
import { ConfirmModal } from "./components/ConfirmModal";
import { GalleryPanel } from "./components/GalleryPanel";
import { TopBar } from "./components/TopBar";
import { WorksSidebar } from "./components/WorksSidebar";
import { useApiHealth } from "./hooks/useApiHealth";
import { useGenerationOptions } from "./hooks/useGenerationOptions";
import { useTheme } from "./hooks/useTheme";
import { useWorks } from "./hooks/useWorks";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const App = () => {
  const health = useApiHealth(API_URL);
  const { options, optionsStatus } = useGenerationOptions(API_URL);
  const { theme, toggleTheme } = useTheme();
  const worksState = useWorks(options, optionsStatus);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);

  const serverStatus = worksState.isGenerating ? "working" : health.status;

  return (
    <main className="creator-shell">
      <TopBar
        activeWork={worksState.activeWork}
        isGenerating={worksState.isGenerating}
        onGenerationAction={worksState.handleGenerationAction}
        onThemeToggle={toggleTheme}
        options={options}
        serverStatus={serverStatus}
        theme={theme}
      />

      <div
        className={`workspace-layout ${leftSidebarCollapsed ? "workspace-layout--left-collapsed" : ""}`}
      >
        <WorksSidebar
          activeWork={worksState.activeWork}
          isCollapsed={leftSidebarCollapsed}
          isDirty={worksState.isDirty}
          onAddWork={worksState.addWork}
          onToggleCollapse={() =>
            setLeftSidebarCollapsed((isCollapsed) => !isCollapsed)
          }
          onSaveWorks={worksState.saveWorks}
          onSelectWork={worksState.setActiveWorkId}
          works={worksState.works}
        />

        <GalleryPanel
          activeImage={worksState.activeImage}
          activeWork={worksState.activeWork}
          onMoveImage={worksState.moveImage}
          onSelectImage={(activeImageIndex) =>
            worksState.updateActiveWork({ activeImageIndex })
          }
        />

        <ConfigSidebar
          activeWork={worksState.activeWork}
          commitTag={worksState.commitTag}
          customTags={worksState.customTags}
          options={options}
          optionsStatus={optionsStatus}
          removeTag={worksState.removeTag}
          updateActiveWork={worksState.updateActiveWork}
        />
      </div>

      {worksState.showCancelModal ? (
        <ConfirmModal
          onCancel={() => worksState.setShowCancelModal(false)}
          onConfirm={worksState.confirmCancelGeneration}
        />
      ) : null}
    </main>
  );
};

export default App;
