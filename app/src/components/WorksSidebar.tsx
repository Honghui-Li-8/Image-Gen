import type { Work } from "../types";

interface WorksSidebarProps {
  activeWork: Work | undefined;
  isCollapsed: boolean;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  onAddWork: () => void;
  onSaveWorks: () => void;
  onSelectWork: (workId: string) => void;
  onToggleCollapse: () => void;
  works: Work[];
  worksError: string;
}

export const WorksSidebar = ({
  activeWork,
  isCollapsed,
  isDirty,
  isLoading,
  isSaving,
  onAddWork,
  onSaveWorks,
  onSelectWork,
  onToggleCollapse,
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

      <button
        className="save-button"
        type="button"
        disabled={isLoading || isSaving || !isDirty}
        onClick={onSaveWorks}
      >
        {isSaving ? "Saving" : isDirty ? "Save Changes" : "Saved"}
      </button>
    </aside>
  );
};
