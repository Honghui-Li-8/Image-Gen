import type { Work } from "../types";

interface WorksSidebarProps {
  activeWork: Work | undefined;
  isCollapsed: boolean;
  isDirty: boolean;
  onAddWork: () => void;
  onSaveWorks: () => void;
  onSelectWork: (workId: string) => void;
  onToggleCollapse: () => void;
  works: Work[];
}

export const WorksSidebar = ({
  activeWork,
  isCollapsed,
  isDirty,
  onAddWork,
  onSaveWorks,
  onSelectWork,
  onToggleCollapse,
  works,
}: WorksSidebarProps) => {
  return (
    <aside className={`works-sidebar ${isCollapsed ? "works-sidebar--collapsed" : ""}`}>
      <div className="sidebar-header">
        {isCollapsed ? null : <h2>Works</h2>}
        <div className="sidebar-actions">
          {isCollapsed ? null : (
            <button type="button" onClick={onAddWork}>
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

      <button className="save-button" type="button" onClick={onSaveWorks}>
        {isDirty ? "Save Changes" : "Saved"}
      </button>
    </aside>
  );
};
