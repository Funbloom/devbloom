"use client";

import { useEffect } from "react";
import type { ReactElement } from "react";

type Props = {
  projectName: string;
  milestoneCount: number;
  saving: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function PlanningDeleteAllConfirmDialog({
  projectName,
  milestoneCount,
  saving,
  error,
  onConfirm,
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
      aria-labelledby="planning-delete-all-title"
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
        <h2 id="planning-delete-all-title" style={{ margin: 0, fontSize: 18 }}>
          Delete all planning data?
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>
          This permanently removes all planning for{" "}
          <strong style={{ color: "#e2e8f0" }}>{projectName}</strong>: the project plan,{" "}
          {milestoneCount} milestone{milestoneCount === 1 ? "" : "s"}, and all deliverables and
          events. This cannot be undone.
        </p>
        {error ? (
          <p role="alert" style={{ margin: 0, color: "#fca5a5", fontSize: 13 }}>
            {error}
          </p>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            className="imagegen-button-secondary"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="imagegen-delete-button"
            disabled={saving}
            onClick={onConfirm}
          >
            {saving ? "Deleting…" : "Delete all"}
          </button>
        </div>
      </div>
    </div>
  );
}
