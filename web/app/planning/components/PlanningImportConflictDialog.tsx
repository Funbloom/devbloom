"use client";

import { useEffect } from "react";
import type { ReactElement } from "react";
import type { ImportApplyMode } from "../planningImportTypes";

type Props = {
  existingMilestoneCount: number;
  saving: boolean;
  onChoose: (mode: ImportApplyMode) => void;
  onCancel: () => void;
};

export function PlanningImportConflictDialog({
  existingMilestoneCount,
  saving,
  onChoose,
  onCancel,
}: Props): ReactElement {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onCancel, saving]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="planning-import-conflict-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.65)",
        padding: 16,
      }}
      onClick={saving ? undefined : onCancel}
    >
      <div
        style={{
          width: "min(480px, 100%)",
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: 12,
          padding: 16,
          display: "grid",
          gap: 14,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="planning-import-conflict-title" style={{ margin: 0, fontSize: 18 }}>
          Existing plan found
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>
          This project already has {existingMilestoneCount} milestone
          {existingMilestoneCount === 1 ? "" : "s"}. Choose how to apply the import.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          <button
            type="button"
            className="imagegen-button"
            disabled={saving}
            onClick={() => onChoose("append")}
          >
            Append — keep existing milestones
          </button>
          <button
            type="button"
            className="imagegen-button-secondary"
            disabled={saving}
            onClick={() => onChoose("replace")}
          >
            Replace — remove existing milestones first
          </button>
          <button type="button" className="imagegen-button-secondary" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
