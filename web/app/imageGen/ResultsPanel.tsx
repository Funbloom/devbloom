"use client";

import type { GeneratedImage } from "./types";

type Props = {
  images: GeneratedImage[];
  imagesPerRow: number;
  onImagesPerRowChange: (value: string) => void;
  onImagesPerRowStep: (delta: number) => void;
  onDeleteImage: (id: string) => void;
  emptyMessage?: string;
};

export function ResultsPanel({
  images,
  imagesPerRow,
  onImagesPerRowChange,
  onImagesPerRowStep,
  onDeleteImage,
  emptyMessage = "No images yet. Enter a prompt and click Generate.",
  onToggleLocation,
}: Props & { onToggleLocation: (id: string) => void }) {
  return (
    <div className="imagegen-right">
      <div className="imagegen-panel">
        <div className="imagegen-results-header">
          <h2 className="imagegen-panel-title">Results</h2>
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
                <button
                  type="button"
                  className="imagegen-delete-button"
                  onClick={() => onDeleteImage(img.id)}
                >
                  Delete
                </button>
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
    </div>
  );
}
