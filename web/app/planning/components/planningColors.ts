import type { CSSProperties } from "react";
import type { MilestoneRisk, MilestoneStatus } from "../types";

export const STATUS_LABELS: Record<MilestoneStatus, string> = {
  todo: "Todo",
  in_progress: "In progress",
  ready: "Ready",
  completed: "Completed",
};

export const RISK_LABELS: Record<MilestoneRisk, string> = {
  on_track: "On track",
  caution: "Caution",
  risk: "Risk",
};

export function statusBarColor(status: MilestoneStatus): string {
  switch (status) {
    case "todo":
      return "#3b82f6";
    case "in_progress":
      return "#eab308";
    case "ready":
      return "#22c55e";
    case "completed":
      return "#166534";
    default:
      return "#64748b";
  }
}

export function riskBarColor(risk: MilestoneRisk): string {
  switch (risk) {
    case "on_track":
      return "#22c55e";
    case "caution":
      return "#eab308";
    case "risk":
      return "#ef4444";
    default:
      return "#64748b";
  }
}

export function riskCellStyle(risk: MilestoneRisk): CSSProperties {
  switch (risk) {
    case "on_track":
      return { background: "rgba(34,197,94,0.18)", color: "#86efac" };
    case "caution":
      return { background: "rgba(234,179,8,0.2)", color: "#fde047" };
    case "risk":
      return { background: "rgba(239,68,68,0.2)", color: "#fca5a5" };
    default:
      return { background: "transparent", color: "inherit" };
  }
}
