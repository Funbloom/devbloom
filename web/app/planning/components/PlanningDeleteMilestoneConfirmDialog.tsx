"use client";

import { useEffect } from "react";
import type { ReactElement } from "react";

import { DismissButton } from "../../components/DismissButton";

type Props = {
  milestoneName: string;
  deliverableCount: number;
  eventCount: number;
  saving: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function PlanningDeleteMilestoneConfirmDialog({
  milestoneName,
  deliverableCount,
  eventCount,
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
      aria-labelledby="planning-delete-milestone-title"
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
        <div className="app-modal-header app-modal-header--center">
          <h2 id="planning-delete-milestone-title" style={{ margin: 0, fontSize: 18, flex: 1 }}>
            Delete milestone?
          </h2>
          <DismissButton disabled={saving} onClick={onCancel} />
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>
          This permanently removes{" "}
          <strong style={{ color: "#e2e8f0" }}>{milestoneName}</strong>, including{" "}
          {deliverableCount} deliverable{deliverableCount === 1 ? "" : "s"} and {eventCount} event
          {eventCount === 1 ? "" : "s"}. This cannot be undone.
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
            {saving ? "Deleting…" : "Delete milestone"}
          </button>
        </div>
      </div>
    </div>
  );
}
