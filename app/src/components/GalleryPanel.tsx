import type { GeneratedImage, Work } from "../types";

interface GalleryPanelProps {
  activeImage: GeneratedImage | undefined;
  activeWork: Work | undefined;
  onMoveImage: (offset: number) => void;
  onSelectImage: (index: number) => void;
}

export const GalleryPanel = ({
  activeImage,
  activeWork,
  onMoveImage,
  onSelectImage,
}: GalleryPanelProps) => {
  return (
    <section className="gallery-stage">
      <div className="image-viewer">
        <button
          className="gallery-nav gallery-nav--left"
          type="button"
          disabled={!activeWork?.images?.length || activeWork.activeImageIndex === 0}
          onClick={() => onMoveImage(-1)}
          aria-label="Previous image"
        >
          {"<"}
        </button>

        <div className="image-frame">
          {activeImage ? (
            <img
              src={activeImage.url}
              alt={activeImage.alt || "Generated anime character"}
            />
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
          disabled={
            !activeWork?.images?.length ||
            activeWork.activeImageIndex >= activeWork.images.length - 1
          }
          onClick={() => onMoveImage(1)}
          aria-label="Next image"
        >
          {">"}
        </button>
      </div>

      <div className="preview-section">
        <div className="thumbnail-strip">
          {activeWork?.images?.length ? (
            activeWork.images.map((image, index) => (
              <button
                className={`thumbnail ${index === activeWork.activeImageIndex ? "thumbnail--active" : ""}`}
                key={image.id || image.url}
                type="button"
                onClick={() => onSelectImage(index)}
              >
                <img src={image.url} alt="" />
              </button>
            ))
          ) : (
            <div className="thumbnail-empty">No previews yet</div>
          )}
        </div>
      </div>
    </section>
  );
};
