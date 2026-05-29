import { useState } from "react";
import { ConfigSidebar } from "./components/ConfigSidebar";
import { ConfirmModal } from "./components/ConfirmModal";
import { GalleryPanel } from "./components/GalleryPanel";
import { LoginGate } from "./components/LoginGate";
import { TopBar } from "./components/TopBar";
import { WorksSidebar } from "./components/WorksSidebar";
import { useApiHealth } from "./hooks/useApiHealth";
import { useAuth } from "./hooks/useAuth";
import { useGenerationOptions } from "./hooks/useGenerationOptions";
import { useTheme } from "./hooks/useTheme";
import { useWorks } from "./hooks/useWorks";
import type { AuthSession } from "./hooks/useAuth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface DashboardProps {
  onUnauthorized: () => void;
  session: AuthSession;
}

const Dashboard = ({ onUnauthorized, session }: DashboardProps) => {
  const health = useApiHealth(API_URL);
  const { options, optionsStatus } = useGenerationOptions(
    API_URL,
    session.token,
    onUnauthorized,
  );
  const { theme, toggleTheme } = useTheme();
  const worksState = useWorks(
    API_URL,
    session.token,
    options,
    optionsStatus,
    onUnauthorized,
  );
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);

  const serverStatus = worksState.isGenerating ? "working" : health.status;

  return (
    <main className="creator-shell">
      <TopBar
        activeWork={worksState.activeWork}
        canGenerate={worksState.canGenerate}
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
          activeModel={worksState.activeModel}
          activeWork={worksState.activeWork}
          commitTag={worksState.commitTag}
          customTags={worksState.customTags}
          models={options?.models ?? {}}
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

const App = () => {
  const auth = useAuth(API_URL);

  if (!auth.isAuthReady) {
    return <main className="login-shell" />;
  }

  if (!auth.session) {
    return (
      <LoginGate
        isLoggingIn={auth.isLoggingIn}
        loginError={auth.loginError}
        onLogin={auth.login}
      />
    );
  }

  return <Dashboard onUnauthorized={auth.clearAuth} session={auth.session} />;
};

export default App;
