"use client";

import type { ReactElement } from "react";
import { PlanningImportButton } from "./PlanningImportButton";

type Props = {
  startDate: string;
  saving: boolean;
  importDisabled?: boolean;
  deleteAllDisabled?: boolean;
  onStartDateChange: (value: string) => void;
  onImportFileSelected: (file: File) => void;
  onDeleteAllClick: () => void;
};

export function PlanningLeftPanel({
  startDate,
  saving,
  importDisabled,
  deleteAllDisabled,
  onStartDateChange,
  onImportFileSelected,
  onDeleteAllClick,
}: Props): ReactElement {
  return (
    <div className="imagegen-panel">
      <h2 className="imagegen-panel-title">Planning</h2>
      <div className="imagegen-panel-body" style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted, #94a3b8)", lineHeight: 1.45 }}>
          Plan milestones for the active project. The timeline on the right updates as you edit start
          date, milestones, deliverables, and events.
        </p>
        <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
          <span>Project start date</span>
          <input
            type="date"
            value={startDate}
            disabled={saving}
            onChange={(e) => onStartDateChange(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #334155",
              background: "#0f172a",
              color: "#f1f5f9",
            }}
          />
        </label>
        <PlanningImportButton
          disabled={saving || importDisabled}
          onFileSelected={onImportFileSelected}
        />
        <button
          type="button"
          className="imagegen-delete-button"
          disabled={saving || deleteAllDisabled}
          onClick={onDeleteAllClick}
        >
          Delete all
        </button>
        <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
          <div>Status bar colors: blue todo, yellow in progress, green ready, dark green completed.</div>
          <div style={{ marginTop: 6 }}>Risk column: green on track, amber caution, red risk.</div>
        </div>
      </div>
    </div>
  );
}
