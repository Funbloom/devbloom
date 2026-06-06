import type { CSSProperties } from "react";
import type { MilestoneRisk, MilestoneStatus } from "./types";

export type ObjectiveDeliverableParts = {
  objective: string;
  deliverable: string;
};

export function joinObjectiveDeliverable(objective: string, deliverable: string): string {
  const objectiveText = objective.trim();
  const deliverableText = deliverable.trim();
  if (objectiveText && deliverableText) {
    return `${objectiveText}: ${deliverableText}`;
  }
  return objectiveText || deliverableText || "Untitled";
}

export function splitOwners(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function normalizeOwners(raw: string | null | undefined): string {
  return splitOwners(raw).join(", ");
}

export function splitObjectiveDeliverable(title: string): ObjectiveDeliverableParts {
  const cleaned = title.trim();
  const separator = cleaned.indexOf(": ");
  if (separator === -1) {
    return { objective: cleaned, deliverable: "" };
  }
  return {
    objective: cleaned.slice(0, separator).trim(),
    deliverable: cleaned.slice(separator + 2).trim(),
  };
}

export function formatPlanningDateLong(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatPlanningDateDots(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const year = parsed.getFullYear();
  return `${month}.${day}.${year}`;
}

export function statusPillStyle(status: MilestoneStatus): CSSProperties {
  switch (status) {
    case "completed":
      return { background: "rgba(34,197,94,0.35)", color: "#bbf7d0", border: "1px solid rgba(34,197,94,0.5)" };
    case "ready":
      return { background: "rgba(34,197,94,0.22)", color: "#86efac", border: "1px solid rgba(34,197,94,0.35)" };
    case "in_progress":
      return { background: "rgba(234,179,8,0.25)", color: "#fde047", border: "1px solid rgba(234,179,8,0.4)" };
    case "todo":
    default:
      return { background: "rgba(59,130,246,0.22)", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)" };
  }
}

export function riskPillStyle(risk: MilestoneRisk): CSSProperties {
  switch (risk) {
    case "on_track":
      return { background: "rgba(22,101,52,0.85)", color: "#dcfce7", border: "1px solid rgba(34,197,94,0.6)" };
    case "caution":
      return { background: "rgba(161,98,7,0.75)", color: "#fef9c3", border: "1px solid rgba(234,179,8,0.5)" };
    case "risk":
      return { background: "rgba(153,27,27,0.8)", color: "#fecaca", border: "1px solid rgba(239,68,68,0.5)" };
    default:
      return { background: "#334155", color: "#e2e8f0", border: "1px solid #475569" };
  }
}
