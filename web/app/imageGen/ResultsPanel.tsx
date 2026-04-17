"use client";

import type { KeyboardEvent, MouseEvent } from "react";
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
  /** UI Builder: open Breakdown tab for this image. */
  onBreakdown?: (img: GeneratedImage) => void;
  emptyMessage?: string;
  /** When true, omit the outer `imagegen-right` wrapper (parent already provides layout). */
  embedded?: boolean;
  /** Header next to the images-per-row controls (default: Results). */
  panelTitle?: string;
  /** UI Builder: multi-select sketches for batch polish (click sketch image to toggle). */
  showSketchCheckboxes?: boolean;
  selectedSketchIds?: readonly string[];
  onSketchSelectionChange?: (id: string, selected: boolean) => void;
  /** While true, sketch image click-selection is disabled (batch generation running). */
  sketchSelectionDisabled?: boolean;
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
  onBreakdown,
  embedded = false,
  panelTitle = "Results",
  showSketchCheckboxes = false,
  selectedSketchIds = [],
  onSketchSelectionChange,
  sketchSelectionDisabled = false,
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
          {images.map((img) => {
            const sketchSelectable =
              showSketchCheckboxes && img.fromSketch && Boolean(img.filename?.trim());
            const sketchSelected = selectedSketchIds.includes(img.id);
            const selectionDisabled = sketchSelectionDisabled || !img.filename?.trim();
            const toggleSketch = () => {
              if (!sketchSelectable || selectionDisabled) return;
              onSketchSelectionChange?.(img.id, !sketchSelected);
            };
            return (
            <div
              key={img.id}
              className={
                sketchSelectable && sketchSelected
                  ? "imagegen-card imagegen-card-sketch-selected"
                  : "imagegen-card"
              }
            >
              <div
                className={
                  sketchSelectable
                    ? "imagegen-card-image-wrap imagegen-card-image-wrap-sketch"
                    : "imagegen-card-image-wrap"
                }
                {...(sketchSelectable
                  ? {
                      role: "button" as const,
                      tabIndex: selectionDisabled ? -1 : 0,
                      "aria-pressed": sketchSelected,
                      "aria-label": sketchSelected
                        ? "Deselect drawing for polished UI"
                        : "Select drawing for polished UI",
                      onClick: (e: MouseEvent<HTMLDivElement>) => {
                        e.preventDefault();
                        toggleSketch();
                      },
                      onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleSketch();
                        }
                      },
                      style: {
                        cursor: selectionDisabled ? "not-allowed" : "pointer",
                        outline: "none",
                      },
                    }
                  : {})}
              >
                <img
                  src={img.url}
                  alt={img.prompt}
                  className={
                    sketchSelectable
                      ? "imagegen-card-image imagegen-card-image-sketch"
                      : "imagegen-card-image"
                  }
                  draggable={false}
                />
              </div>
              <div className="imagegen-card-meta">
                {showSketchCheckboxes && img.fromSketch && (
                  <div
                    style={{
                      fontSize: 11,
                      color: img.filename ? "var(--muted, #94a3b8)" : "var(--muted, #64748b)",
                      marginBottom: 4,
                    }}
                  >
                    {img.filename?.trim()
                      ? "Click image to select for polish (multi-select)."
                      : "Save sketch first to select."}
                  </div>
                )}
                {img.fromSketch && (
                  <div className="imagegen-card-style" style={{ color: "#86efac" }}>
                    Sketch (drawn)
                  </div>
                )}
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
                    title={
                      img.fromSketch
                        ? "Open in Draw tab to keep editing the sketch"
                        : "Edit with Nano Banana (reference image)"
                    }
                  >
                    Edit
                  </button>
                  {onBreakdown && !img.fromSketch && (
                    <button
                      type="button"
                      className="imagegen-delete-button imagegen-action-button"
                      disabled={!img.filename}
                      onClick={() => onBreakdown(img)}
                      title={!img.filename ? "Save image to project first" : "Detect UI regions and export layers"}
                    >
                      Breakdown
                    </button>
                  )}
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
            );
          })}
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
