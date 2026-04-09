"use client";

import type { GeneratedImage } from "./types";

type Props = {
  images: GeneratedImage[];
  imagesPerRow: number;
  onImagesPerRowChange: (value: string) => void;
  onImagesPerRowStep: (delta: number) => void;
  onDeleteImage: (id: string) => void;
  onRemoveBackground: (id: string) => void;
  onToggleLocation: (id: string) => void;
  onEditImage: (img: GeneratedImage) => void;
  emptyMessage?: string;
  /** When true, omit the outer `imagegen-right` wrapper (parent already provides layout). */
  embedded?: boolean;
  /** Header next to the images-per-row controls (default: Results). */
  panelTitle?: string;
};

export function ResultsPanel({
  images,
  imagesPerRow,
  onImagesPerRowChange,
  onImagesPerRowStep,
  onDeleteImage,
  onRemoveBackground,
  emptyMessage = "No images yet. Enter a prompt and click Generate.",
  onToggleLocation,
  onEditImage,
  embedded = false,
  panelTitle = "Results",
}: Props) {
  const inner = (
    <>
      <div className="imagegen-panel">
        <div className="imagegen-results-header">
          <h2 className="imagegen-panel-title">{panelTitle}</h2>
          <div className="edit-actions imagegen-images-per-row-row" style={{ alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 14 }} htmlFor="imagegen-images-per-row">
              Images per row:
            </label>
            <div className="imagegen-stepper">
              <button
                type="button"
                aria-label="Decrease images per row"
                className="imagegen-stepper-btn"
                onClick={() => onImagesPerRowStep(-1)}
              >
                −
              </button>
              <input
                id="imagegen-images-per-row"
                type="number"
                min={1}
                max={8}
                value={imagesPerRow}
                onChange={(e) => onImagesPerRowChange(e.target.value)}
                style={{ width: 56, padding: "6px 8px" }}
              />
              <button
                type="button"
                aria-label="Increase images per row"
                className="imagegen-stepper-btn"
                onClick={() => onImagesPerRowStep(1)}
              >
                +
              </button>
            </div>
          </div>
        </div>
        <div
          className="imagegen-grid"
          style={{ gridTemplateColumns: `repeat(${imagesPerRow}, minmax(0, 1fr))` }}
        >
          {images.map((img) => (
            <div key={img.id} className="imagegen-card">
              <div className="imagegen-card-image-wrap">
                <img src={img.url} alt={img.prompt} className="imagegen-card-image" />
              </div>
              <div className="imagegen-card-meta">
                {img.styleName && (
                  <div className="imagegen-card-style">Style: {img.styleName}</div>
                )}
                <div className="imagegen-card-location-row">
                  <span className="imagegen-card-location">
                    {img.location === "cloud" ? "Cloud" : "Local"}
                  </span>
                  <button
                    type="button"
                    className="imagegen-delete-button"
                    onClick={() => onToggleLocation(img.id)}
                  >
                    {img.location === "cloud" ? "Use local" : "Save to cloud"}
                  </button>
                </div>
                <div className="imagegen-card-prompt" title={img.prompt}>
                  {img.prompt}
                </div>
                <div className="imagegen-card-actions">
                  <button
                    type="button"
                    className="imagegen-delete-button imagegen-action-button"
                    onClick={() => onEditImage(img)}
                    title="Edit with Nano Banana (reference image)"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="imagegen-delete-button imagegen-action-button"
                    onClick={() => {
                      if (!img.prompt) return;
                      navigator.clipboard?.writeText(img.prompt).catch(() => {});
                    }}
                    disabled={!img.prompt}
                    title={!img.prompt ? "No prompt to copy" : "Copy prompt to clipboard"}
                  >
                    Copy prompt
                  </button>
                  <button
                    type="button"
                    className="imagegen-delete-button imagegen-action-button"
                    onClick={() => onRemoveBackground(img.id)}
                    disabled={!img.filename}
                    title={!img.filename ? "No filename available" : "Remove background"}
                  >
                    Remove Bkg
                  </button>
                  <button
                    type="button"
                    className="imagegen-delete-button"
                    onClick={() => onDeleteImage(img.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
          {images.length === 0 && (
            <div className="status" style={{ gridColumn: "1 / -1" }}>
              {emptyMessage}
            </div>
          )}
        </div>
      </div>
    </>
  );
  if (embedded) return inner;
  return <div className="imagegen-right">{inner}</div>;
}
