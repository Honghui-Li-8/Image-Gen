import { useCallback, useEffect, useRef, useState } from "react";
import type { Work } from "../types";

interface WorksSidebarProps {
  activeWork: Work | undefined;
  isCollapsed: boolean;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  onLogout: () => void;
  onAddWork: () => void;
  onDeleteWork: (workId: string) => void;
  onDuplicateWork: (workId: string) => void;
  onRenameWork: (workId: string, name: string) => void;
  onSelectWork: (workId: string) => void;
  onToggleCollapse: () => void;
  username: string;
  works: Work[];
  workErrors: Record<string, string>;
}

export const WorksSidebar = ({
  activeWork,
  isCollapsed,
  isDirty,
  isLoading,
  isSaving,
  onLogout,
  onAddWork,
  onDeleteWork,
  onDuplicateWork,
  onRenameWork,
  onSelectWork,
  onToggleCollapse,
  username,
  works,
  workErrors,
}: WorksSidebarProps) => {
  const worksError = Object.values(workErrors).find(Boolean) ?? "";
  const [openMenuWorkId, setOpenMenuWorkId] = useState<string | null>(null);
  const [renameWork, setRenameWork] = useState<Work | null>(null);
  const [deleteWork, setDeleteWork] = useState<Work | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpenMenuWorkId(null);
      }
    };

    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, []);

  const beginRename = useCallback((work: Work) => {
    setOpenMenuWorkId(null);
    setRenameWork(work);
    setRenameDraft(work.name);
  }, []);

  const confirmRename = useCallback(() => {
    if (!renameWork) return;
    onRenameWork(renameWork.id, renameDraft);
    setRenameWork(null);
    setRenameDraft("");
  }, [renameWork, renameDraft, onRenameWork]);

  const confirmDelete = useCallback(() => {
    if (!deleteWork) return;
    onDeleteWork(deleteWork.id);
    setDeleteWork(null);
  }, [deleteWork, onDeleteWork]);

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
          <div
            className={`work-item-shell ${work.id === activeWork?.id ? "work-item-shell--active" : ""}`}
            key={work.id}
          >
            <button
              className="work-item"
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
            {!isCollapsed ? (
              <div className="work-item-menu-wrap" ref={openMenuWorkId === work.id ? menuRef : null}>
                <button
                  aria-label={`Open actions for ${work.name}`}
                  className="work-item-menu-button"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenMenuWorkId((current) => current === work.id ? null : work.id);
                  }}
                >
                  ...
                </button>
                {openMenuWorkId === work.id ? (
                  <div className="work-item-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => beginRename(work)}>
                      Rename
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpenMenuWorkId(null);
                        onDuplicateWork(work.id);
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      className="work-item-menu-danger"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpenMenuWorkId(null);
                        setDeleteWork(work);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
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

      {renameWork ? (
        <div className="modal-overlay" onClick={() => setRenameWork(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <p>Rename work</p>
            <input
              className="modal-input"
              autoFocus
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") confirmRename();
                if (event.key === "Escape") setRenameWork(null);
              }}
            />
            <div className="modal-actions">
              <button className="modal-button" type="button" onClick={() => setRenameWork(null)}>
                Cancel
              </button>
              <button className="modal-button" type="button" onClick={confirmRename}>
                Rename
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteWork ? (
        <div className="modal-overlay" onClick={() => setDeleteWork(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <p>Delete "{deleteWork.name}"? This cannot be undone.</p>
            <div className="modal-actions">
              <button
                className="modal-button modal-button--danger"
                type="button"
                onClick={confirmDelete}
              >
                Delete
              </button>
              <button className="modal-button" type="button" onClick={() => setDeleteWork(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
};
