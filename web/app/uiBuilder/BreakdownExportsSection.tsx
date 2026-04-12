"use client";

import type { GeneratedImage } from "../imageGen/types";
import { normalizeImageUrl } from "../imageGen/client";
import { isLocalAgentContext } from "../lib/localAgentClient";

type FolderReveal = { fullPath: string; projectRoot: string; relativePath: string };

type Props = {
  images: GeneratedImage[];
  /** Full disk path for Gen/Images/UI/&lt;export&gt;/ when local project path is known (or after Process). */
  exportFolderReveal: FolderReveal | null;
  /** Project-relative path only when full path is unavailable (e.g. no Admin folder set). */
  exportRelativeHint: string | null;
  onRevealExportFolder: () => void;
  onRemoveBackground: (img: GeneratedImage) => void;
  onEditImage: (img: GeneratedImage) => void;
  onDeleteImage: (img: GeneratedImage) => void;
  /** When true, "Delete all" removes Gen/Images/UI/&lt;folder&gt;/ on disk. */
  canDeleteAllExportFolder: boolean;
  deleteAllBusy?: boolean;
  onDeleteAllExportFolder: () => void;
};

/**
 * Tiles for images under Gen/Images/UI/&lt;subfolder&gt;/ (breakdown exports). Reuses Image Gen card styling.
 */
export function BreakdownExportsSection({
  images,
  exportFolderReveal,
  exportRelativeHint,
  onRevealExportFolder,
  onRemoveBackground,
  onEditImage,
  onDeleteImage,
  canDeleteAllExportFolder,
  deleteAllBusy = false,
  onDeleteAllExportFolder,
}: Props) {
  return (
    <div
      style={{
        flexShrink: 0,
        marginTop: "1rem",
        paddingTop: "1rem",
        borderTop: "1px solid #2a2f3a",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        minHeight: 0,
        maxHeight: "min(62vh, 880px)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
        }}
      >
        <h3 className="imagegen-panel-title" style={{ margin: 0, fontSize: 15 }}>
          Breakdown exports
        </h3>
        <button
          type="button"
          className="imagegen-delete-button"
          disabled={!canDeleteAllExportFolder || deleteAllBusy}
          title="Delete the entire Gen/Images/UI export folder and all files inside"
          onClick={() => onDeleteAllExportFolder()}
          style={{
            fontSize: 12,
            padding: "6px 10px",
            opacity: canDeleteAllExportFolder && !deleteAllBusy ? 1 : 0.5,
          }}
        >
          {deleteAllBusy ? "Deleting…" : "Delete all"}
        </button>
      </div>
      <div style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>
        {exportFolderReveal ? (
          isLocalAgentContext() ? (
            <>
              <button
                type="button"
                onClick={() => void onRevealExportFolder()}
                title="Open in File Explorer (local agent)"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  color: "#38bdf8",
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "ui-monospace, monospace",
                  wordBreak: "break-all",
                  lineHeight: 1.45,
                }}
              >
                {exportFolderReveal.fullPath}
              </button>
              <span style={{ fontSize: 11, color: "#64748b", display: "block", marginTop: 4 }}>
                Click path to open folder (requires local agent)
              </span>
            </>
          ) : (
            <code
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--foreground, #e2e8f0)",
                wordBreak: "break-all",
                lineHeight: 1.45,
              }}
            >
              {exportFolderReveal.fullPath}
            </code>
          )
        ) : exportRelativeHint ? (
          <code style={{ fontSize: 11, color: "var(--foreground, #e2e8f0)", wordBreak: "break-all" }}>
            {exportRelativeHint}
          </code>
        ) : (
          <span>
            Exports from Process (widgets + background) under{" "}
            <code style={{ fontSize: 11 }}>Gen/Images/UI/&lt;folder&gt;/</code>. Set a local project folder in Admin for
            the full disk path and a clickable link.
          </span>
        )}
      </div>
      <div
        className="breakdown-exports-grid"
        style={{
          overflow: "auto",
          flex: 1,
          minHeight: 0,
        }}
      >
        {images.map((img) => (
          <div key={img.id} className="breakdown-exports-tile">
            <div className="breakdown-exports-tile-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={normalizeImageUrl(img.url)} alt={img.prompt} />
            </div>
            <div className="breakdown-exports-tile-meta">
              <div className="imagegen-card-prompt" title={img.prompt}>
                {img.prompt}
              </div>
              <div className="imagegen-card-actions">
                <button
                  type="button"
                  className="imagegen-delete-button imagegen-action-button"
                  onClick={() => onRemoveBackground(img)}
                  title="Remove background"
                >
                  Remove Bkg
                </button>
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
                  className="imagegen-delete-button breakdown-exports-delete-row"
                  onClick={() => onDeleteImage(img)}
                  title="Delete this file from disk"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {images.length === 0 && (
          <div className="status" style={{ gridColumn: "1 / -1", fontSize: 12 }}>
            No breakdown exports yet. Run Process to create a folder under Gen/Images/UI.
          </div>
        )}
      </div>
    </div>
  );
}
