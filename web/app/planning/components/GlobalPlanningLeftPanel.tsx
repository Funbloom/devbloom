"use client";

import type { ReactElement } from "react";
import type { GlobalPlanningProject } from "../types";
import { projectHasPlanningData } from "../globalPlanningView";

type Props = {
  projects: GlobalPlanningProject[];
  enabledKeys: Set<string>;
  loading: boolean;
  onToggleProject: (projectKey: string, enabled: boolean) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
};

export function GlobalPlanningLeftPanel({
  projects,
  enabledKeys,
  loading,
  onToggleProject,
  onSelectAll,
  onClearAll,
}: Props): ReactElement {
  return (
    <div className="imagegen-panel">
      <h2 className="imagegen-panel-title">All projects</h2>
      <div className="imagegen-panel-body" style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted, #94a3b8)", lineHeight: 1.45 }}>
          Toggle which projects appear on the timeline. Milestone bars are colored by risk and show
          due dates.
        </p>
        <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)", display: "grid", gap: 4 }}>
          <div>
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                background: "#22c55e",
                borderRadius: 2,
                marginRight: 6,
                verticalAlign: "middle",
              }}
            />
            Green — on track
          </div>
          <div>
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                background: "#eab308",
                borderRadius: 2,
                marginRight: 6,
                verticalAlign: "middle",
              }}
            />
            Yellow — caution
          </div>
          <div>
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                background: "#ef4444",
                borderRadius: 2,
                marginRight: 6,
                verticalAlign: "middle",
              }}
            />
            Red — at risk
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="admin-btn" onClick={onSelectAll}>
            Select all
          </button>
          <button type="button" className="admin-btn" onClick={onClearAll}>
            Clear all
          </button>
        </div>
        {loading ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted, #94a3b8)" }}>Loading projects…</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {projects.map((project) => {
              const hasData = projectHasPlanningData(project);
              const enabled = enabledKeys.has(project.project_key);
              return (
                <label
                  key={project.project_key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    color: hasData ? "#e2e8f0" : "#64748b",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => onToggleProject(project.project_key, e.target.checked)}
                  />
                  <span style={{ flex: 1 }}>{project.display_name}</span>
                  {!hasData ? (
                    <span style={{ fontSize: 11, color: "#64748b" }}>No plan</span>
                  ) : (
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>
                      {project.milestones.length} milestone
                      {project.milestones.length === 1 ? "" : "s"}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
