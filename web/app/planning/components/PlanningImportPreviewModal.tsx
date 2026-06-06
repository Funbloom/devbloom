"use client";

import { useEffect } from "react";
import type { CSSProperties, ReactElement } from "react";
import {
  formatImportDate,
  formatImportRisk,
  formatImportStatus,
  formatImportWarnings,
  milestoneDeliverableSummary,
  milestoneGoalsSummary,
} from "../planningImportMapper";
import type { ImportedPlanningData } from "../planningImportTypes";

type Props = {
  data: ImportedPlanningData;
  warnings: string[];
  activeProjectName: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 600,
  color: "#94a3b8",
  borderBottom: "1px solid #334155",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "8px 10px",
  fontSize: 13,
  borderBottom: "1px solid #1e293b",
  verticalAlign: "top",
};

export function PlanningImportPreviewModal({
  data,
  warnings,
  activeProjectName,
  saving,
  error,
  onClose,
  onConfirm,
}: Props): ReactElement {
  const formattedWarnings = formatImportWarnings(warnings);
  const importedName = (data.project_name || "").trim();
  const nameMismatch =
    importedName.length > 0 &&
    activeProjectName.trim().length > 0 &&
    importedName.toLowerCase() !== activeProjectName.trim().toLowerCase();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, saving]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="planning-import-preview-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        padding: 16,
      }}
      onClick={saving ? undefined : onClose}
    >
      <div
        style={{
          width: "min(960px, 100%)",
          maxHeight: "min(92vh, 900px)",
          overflow: "auto",
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: 12,
          padding: 16,
          display: "grid",
          gap: 14,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 id="planning-import-preview-title" style={{ margin: 0, fontSize: 18 }}>
              Import preview
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#94a3b8" }}>
              Review milestones before writing to{" "}
              <strong style={{ color: "#e2e8f0" }}>{activeProjectName || "active project"}</strong>.
            </p>
          </div>
          <button type="button" className="imagegen-button-secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
        </div>

        {importedName ? (
          <p style={{ margin: 0, fontSize: 13 }}>
            Imported game: <strong>{importedName}</strong>
          </p>
        ) : null}

        {nameMismatch ? (
          <p
            role="status"
            style={{
              margin: 0,
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(234,179,8,0.12)",
              color: "#fde047",
              fontSize: 13,
            }}
          >
            Game name in file ({importedName}) differs from active project ({activeProjectName}). Import
            will still apply to the active project.
          </p>
        ) : null}

        {data.project_start_date ? (
          <p style={{ margin: 0, fontSize: 13, color: "#cbd5e1" }}>
            Project start date: {formatImportDate(data.project_start_date)}
          </p>
        ) : null}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                <th style={thStyle}>Milestone</th>
                <th style={thStyle}>Duration</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Risk</th>
                <th style={thStyle}>Deliverables</th>
                <th style={thStyle}>Goals</th>
              </tr>
            </thead>
            <tbody>
              {data.milestones.map((milestone, index) => (
                <tr key={`${milestone.name}-${index}`}>
                  <td style={tdStyle}>{milestone.name}</td>
                  <td style={tdStyle}>{milestone.duration_weeks} wk</td>
                  <td style={tdStyle}>{formatImportStatus(milestone.status)}</td>
                  <td style={tdStyle}>{formatImportRisk(milestone.risk)}</td>
                  <td style={{ ...tdStyle, maxWidth: 280 }}>{milestoneDeliverableSummary(milestone)}</td>
                  <td style={{ ...tdStyle, maxWidth: 220 }}>{milestoneGoalsSummary(milestone.goals)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {formattedWarnings.length > 0 ? (
          <div>
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Warnings</h3>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#fde047" }}>
              {formattedWarnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <p role="alert" style={{ margin: 0, color: "#fca5a5", fontSize: 13 }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="imagegen-button-secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="imagegen-button" disabled={saving} onClick={onConfirm}>
            {saving ? "Importing…" : "Confirm import"}
          </button>
        </div>
      </div>
    </div>
  );
}
