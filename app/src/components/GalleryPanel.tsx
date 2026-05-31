import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { BatchGenerationItem, GeneratedImage, Work } from "../types";

interface GalleryPanelProps {
  activeImage: GeneratedImage | undefined;
  activeWork: Work | undefined;
  batchItems: BatchGenerationItem[];
  onDeleteImage: (generationId: string) => void;
  onMoveImage: (offset: number) => void;
  onSelectDraft: () => void;
  onSelectImage: (index: number) => void;
}

interface ContextMenu {
  x: number;
  y: number;
  generationId: string;
}

export const GalleryPanel = ({
  activeImage,
  activeWork,
  batchItems,
  onDeleteImage,
  onMoveImage,
  onSelectDraft,
  onSelectImage,
}: GalleryPanelProps) => {
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const isViewingDraft = activeWork?.viewingConfig === null;
  const images = activeWork?.images ?? [];

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [contextMenu]);

  const handleThumbnailContextMenu = (e: React.MouseEvent, index: number, generationId: string) => {
    e.preventDefault();
    onSelectImage(index);
    setContextMenu({ x: e.clientX, y: e.clientY, generationId });
  };

  const requestDelete = (generationId: string) => {
    setContextMenu(null);
    setPendingDelete(generationId);
  };

  const confirmDelete = () => {
    if (pendingDelete) {
      onDeleteImage(pendingDelete);
      setPendingDelete(null);
    }
  };

  return (
    <section className="gallery-stage">
      <div className="image-viewer">
        <button
          className="gallery-nav gallery-nav--left"
          type="button"
          disabled={!images.length || activeWork?.activeImageIndex === 0}
          onClick={() => onMoveImage(-1)}
          aria-label="Previous image"
        >
          {"<"}
        </button>

        <div className="image-frame">
          {activeImage ? (
            <>
              <img src={activeImage.url} alt={activeImage.alt || "Generated anime character"} />
              {activeImage.id && (
                <button
                  className="image-delete-button"
                  type="button"
                  aria-label="Delete image"
                  onClick={() => requestDelete(activeImage.id!)}
                >
                  ✕
                </button>
              )}
            </>
          ) : (
            <div className="empty-gallery">
              <h2>No images generated</h2>
              <p>Generated images for this work will appear here.</p>
            </div>
          )}
        </div>

        <button
          className="gallery-nav gallery-nav--right"
          type="button"
          disabled={!images.length || (activeWork?.activeImageIndex ?? 0) >= images.length - 1}
          onClick={() => onMoveImage(1)}
          aria-label="Next image"
        >
          {">"}
        </button>
      </div>

      <div className="preview-section">
        <div className="thumbnail-strip">
          {images.length ? (
            <>
              {images.map((image, index) => (
                <button
                  className={`thumbnail ${!isViewingDraft && index === activeWork?.activeImageIndex ? "thumbnail--active" : ""}`}
                  key={image.id || image.url}
                  type="button"
                  onClick={() => onSelectImage(index)}
                  onContextMenu={(e) => image.id && handleThumbnailContextMenu(e, index, image.id)}
                >
                  <img src={image.url} alt="" />
                </button>
              ))}
              {batchItems
                .filter((item) => item.status !== "completed")
                .map((item, index) => (
                  <div
                    className={`thumbnail thumbnail--batch thumbnail--batch-${item.status}`}
                    key={item.id}
                    title={item.error ?? `${item.status} ${item.progress}%`}
                  >
                    <div
                      className="thumbnail-progress-ring"
                      style={{ "--progress": `${item.progress}%` } as CSSProperties}
                    >
                      <span>{item.status === "pending" ? index + 1 : `${item.progress}%`}</span>
                    </div>
                  </div>
                ))}
              <button
                className={`thumbnail thumbnail--draft ${isViewingDraft ? "thumbnail--active" : ""}`}
                type="button"
                onClick={onSelectDraft}
                title="Current config (draft)"
              >
                ✦
              </button>
            </>
          ) : (
            <div className="thumbnail-empty">No previews yet</div>
          )}
        </div>
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          ref={contextMenuRef}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="context-menu-item context-menu-item--danger"
            type="button"
            onClick={() => requestDelete(contextMenu.generationId)}
          >
            Delete image
          </button>
        </div>
      )}

      {pendingDelete && (
        <div className="modal-overlay" onClick={() => setPendingDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p>Delete this image? This cannot be undone.</p>
            <div className="modal-actions">
              <button
                className="modal-button modal-button--danger"
                type="button"
                onClick={confirmDelete}
              >
                Delete
              </button>
              <button className="modal-button" type="button" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
