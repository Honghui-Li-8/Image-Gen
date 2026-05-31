import { useState } from "react";
import { ConfigSidebar } from "./components/ConfigSidebar";
import { ConfirmModal } from "./components/ConfirmModal";
import { GalleryPanel } from "./components/GalleryPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoginGate } from "./components/LoginGate";
import { Notification } from "./components/Notification";
import { TopBar } from "./components/TopBar";
import { WorksSidebar } from "./components/WorksSidebar";
import { useApiHealth } from "./hooks/useApiHealth";
import { useAuth } from "./hooks/useAuth";
import { useComfyHealth } from "./hooks/useComfyHealth";
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
  const { reachable: comfyReachable, recheckNow } = useComfyHealth(API_URL);
  const { options, optionsStatus, refetchOptions } = useGenerationOptions(
    API_URL,
    session.token,
    onUnauthorized
  );
  const { theme, toggleTheme } = useTheme();
  const worksState = useWorks(
    API_URL,
    session.token,
    options,
    optionsStatus,
    onUnauthorized,
    recheckNow
  );
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);

  const serverStatus = worksState.isGenerating ? "working" : health.status;
  const skippedModelMessage = worksState.batchState.skippedModels.length
    ? `Skipped incompatible model${worksState.batchState.skippedModels.length === 1 ? "" : "s"}: ${worksState.batchState.skippedModels
        .map((model) => `${model.modelLabel} (${model.incompatibleFields.join(", ")})`)
        .join("; ")}`
    : null;

  return (
    <main className="creator-shell">
      <TopBar
        activeWork={worksState.activeWork}
        batchState={worksState.batchState}
        comfyReachable={comfyReachable}
        isGenerating={worksState.isGenerating}
        isLoadingWorks={worksState.isLoadingWorks}
        isSaving={worksState.isSaving}
        onBatchGeneration={worksState.startBatchGeneration}
        onCancelGeneration={() => worksState.setShowCancelModal(true)}
        onGenerationAction={worksState.handleGenerationAction}
        onThemeToggle={toggleTheme}
        options={options}
        serverStatus={serverStatus}
        singleQueueCount={worksState.singleQueueCount}
        singleQueueMax={worksState.singleQueueMax}
        theme={theme}
      />

      <div
        className={`workspace-layout ${leftSidebarCollapsed ? "workspace-layout--left-collapsed" : ""}`}
      >
        <WorksSidebar
          activeWork={worksState.activeWork}
          isCollapsed={leftSidebarCollapsed}
          isDirty={worksState.isDirty}
          isLoading={worksState.isLoadingWorks}
          isSaving={worksState.isSaving}
          onAddWork={worksState.addWork}
          onDeleteWork={worksState.deleteWork}
          onDuplicateWork={worksState.duplicateWork}
          onLogout={onUnauthorized}
          onRenameWork={worksState.renameWork}
          onToggleCollapse={() => setLeftSidebarCollapsed((isCollapsed) => !isCollapsed)}
          onSelectWork={worksState.setActiveWorkId}
          username={session.name}
          works={worksState.works}
          workErrors={worksState.workErrors}
        />

        <GalleryPanel
          activeImage={worksState.activeImage}
          activeWork={worksState.activeWork}
          batchItems={worksState.batchState.items}
          onDeleteImage={worksState.deleteImage}
          onMoveImage={worksState.moveImage}
          onSelectDraft={worksState.selectDraft}
          onSelectImage={worksState.selectImage}
        />

        <ConfigSidebar
          activeModel={worksState.activeModel}
          activeWork={worksState.activeWork}
          commitTag={worksState.commitTag}
          customTags={worksState.customTags}
          isDirty={worksState.isDirty}
          isGenerationLocked={worksState.batchState.active}
          isSaving={worksState.isSaving}
          missingFieldIds={worksState.missingFieldIds}
          models={options?.models ?? {}}
          onRestoreViewing={worksState.restoreViewing}
          onRetryOptions={refetchOptions}
          onSaveWork={worksState.saveWorks}
          optionsStatus={optionsStatus}
          removeTag={worksState.removeTag}
          showGenerationValidation={worksState.showGenerationValidation}
          updateActiveWork={worksState.updateActiveWork}
        />
      </div>

      {worksState.showCancelModal ? (
        <ConfirmModal
          onCancel={() => worksState.setShowCancelModal(false)}
          onConfirm={worksState.confirmCancelGeneration}
        />
      ) : null}
      <Notification message={skippedModelMessage} />
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
      <LoginGate isLoggingIn={auth.isLoggingIn} loginError={auth.loginError} onLogin={auth.login} />
    );
  }

  return (
    <ErrorBoundary>
      <Dashboard onUnauthorized={auth.clearAuth} session={auth.session} />
    </ErrorBoundary>
  );
};

export default App;
