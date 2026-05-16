"use client";

import type { CSSProperties, ReactNode } from "react";

import type { StudioActivity } from "./types";

type Props = {
  title?: string;
  activity: StudioActivity;
  working: boolean;
  /** Shown when `activity === null` (idle copy). */
  idleMessage: string;
  /** Extra content below the progress bar area (optional). */
  children?: ReactNode;
  wrapperStyle?: CSSProperties;
};

/**
 * Shared “Activity” region: status text + optional indeterminate progress while `working`.
 * Same markup/styles as Image Gen generate activity and UI Builder Breakdown progress.
 */
export function StudioActivityBox({
  title = "Activity",
  activity,
  working,
  idleMessage,
  children,
  wrapperStyle,
}: Props) {
  return (
    <div
      style={{
        flexShrink: 0,
        marginBottom: "0.75rem",
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid #2a2f3a",
        background: "#0f1115",
        ...wrapperStyle,
      }}
      aria-live="polite"
      aria-busy={working}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#94a3b8",
          }}
        >
          {title}
        </div>
        {working ? (
          <span style={{ fontSize: 11, color: "#22d3ee", fontWeight: 600 }}>Working…</span>
        ) : null}
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.45,
          color: activity?.isError
            ? "#f87171"
            : activity
              ? "var(--foreground, #e2e8f0)"
              : "#94a3b8",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {activity === null ? idleMessage : activity.message}
      </div>
      {working ? (
        <div
          className="breakdown-progress-track"
          role="progressbar"
          aria-valuetext="In progress"
          style={{ marginTop: 10 }}
        >
          <div className="breakdown-progress-bar" />
        </div>
      ) : null}
      {children}
    </div>
  );
}
