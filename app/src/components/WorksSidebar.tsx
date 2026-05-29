import type { Work } from "../types";

interface WorksSidebarProps {
  activeWork: Work | undefined;
  isCollapsed: boolean;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  onLogout: () => void;
  onAddWork: () => void;
  onSelectWork: (workId: string) => void;
  onToggleCollapse: () => void;
  username: string;
  works: Work[];
  worksError: string;
}

export const WorksSidebar = ({
  activeWork,
  isCollapsed,
  isDirty,
  isLoading,
  isSaving,
  onLogout,
  onAddWork,
  onSelectWork,
  onToggleCollapse,
  username,
  works,
  worksError,
}: WorksSidebarProps) => {
  return (
    <aside className={`works-sidebar ${isCollapsed ? "works-sidebar--collapsed" : ""}`}>
      <div className="sidebar-header">
        {isCollapsed ? null : <h2>Works</h2>}
        <div className="sidebar-actions">
          {isCollapsed ? null : (
            <button type="button" disabled={isLoading} onClick={onAddWork}>
              New
            </button>
          )}
          <button
            aria-label={isCollapsed ? "Expand works sidebar" : "Collapse works sidebar"}
            className="sidebar-collapse-button"
            type="button"
            onClick={onToggleCollapse}
          >
            {isCollapsed ? ">" : "<"}
          </button>
        </div>
      </div>

      <div className="work-list">
        {isLoading && !works.length ? (
          <div className="work-list-message">Loading works</div>
        ) : null}
        {worksError && !isCollapsed ? (
          <div className="work-list-error">{worksError}</div>
        ) : null}
        {works.map((work) => (
          <button
            className={`work-item ${work.id === activeWork?.id ? "work-item--active" : ""}`}
            key={work.id}
            type="button"
            onClick={() => onSelectWork(work.id)}
            title={work.name}
          >
            {isCollapsed ? (
              <span>{work.name.slice(0, 1)}</span>
            ) : (
              <>
                <span>{work.name}</span>
                <small>{work.images.length} images</small>
              </>
            )}
          </button>
        ))}
      </div>

      <div className="sidebar-account">
        {isCollapsed ? (
          <button
            aria-label={`Logout ${username}`}
            className="logout-button logout-button--collapsed"
            type="button"
            onClick={onLogout}
          >
            {username.slice(0, 1).toUpperCase()}
          </button>
        ) : (
          <>
            <div className="account-copy">
              <span>{username}</span>
              <small>{isSaving ? "Saving" : isDirty ? "Unsaved" : "Synced"}</small>
            </div>
            <button className="logout-button" type="button" onClick={onLogout}>
              Logout
            </button>
          </>
        )}
      </div>
    </aside>
  );
};
