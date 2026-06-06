import { RISK_LABELS, STATUS_LABELS } from "./components/planningColors";
import { splitOwners } from "./milestoneDetail";
import type { ImportedMilestone } from "./planningImportTypes";
import type { MilestoneRisk, MilestoneStatus } from "./types";

export function formatImportStatus(status: MilestoneStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function formatImportRisk(risk: MilestoneRisk): string {
  return RISK_LABELS[risk] ?? risk;
}

export function formatImportDate(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function milestoneDeliverableSummary(milestone: ImportedMilestone): string {
  if (milestone.deliverables.length === 0) {
    return "—";
  }
  return milestone.deliverables
    .map((d) => {
      const parts = [d.title];
      const owners = splitOwners(d.owner);
      if (owners.length > 0) {
        parts.push(`(${owners.join(", ")})`);
      }
      if (d.due_date) {
        parts.push(`due ${formatImportDate(d.due_date)}`);
      }
      return parts.join(" ");
    })
    .join("; ");
}

export function milestoneGoalsSummary(goals: string[]): string {
  if (goals.length === 0) {
    return "—";
  }
  return goals.join(" · ");
}

export function formatImportWarnings(warnings: string[]): string[] {
  return warnings.map((w) => w.trim()).filter((w) => w.length > 0);
}
