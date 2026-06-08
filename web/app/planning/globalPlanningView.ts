import type { MilestoneRisk, MilestoneStatus, GlobalPlanningProject, PlanningMilestone } from "./types";
import {
  addDaysToIso,
  computeMilestoneStartWeeks,
  defaultGlobalRangeEndIso,
  defaultGlobalRangeStartIso,
  formatDueLabel,
  milestoneDeliveryDateIso,
  planStartOrDefault,
  type WeekColumn,
  weekColumnOffsets,
  weekIndexForDate,
  weekRangeWidthPx,
} from "./planningTimeline";

const RISK_RANK: Record<MilestoneRisk, number> = {
  on_track: 0,
  caution: 1,
  risk: 2,
};

export type GlobalMilestoneBar = {
  milestoneId: string;
  label: string;
  leftPx: number;
  widthPx: number;
  risk: MilestoneRisk;
  title: string;
};

export type GlobalProjectRow = {
  projectKey: string;
  displayName: string;
  status: MilestoneStatus;
  risk: MilestoneRisk;
  bars: GlobalMilestoneBar[];
};

export type GlobalPlanningRange = {
  fromIso: string;
  toIso: string;
};

export function milestoneNamePrefix(name: string, orderIndex: number): string {
  const trimmed = name.trim();
  const match = trimmed.match(/^(M\d+)/i);
  if (match) {
    return match[1].toUpperCase();
  }
  return `M${String(orderIndex).padStart(2, "0")}`;
}

export function formatGlobalBarLabel(
  milestoneName: string,
  orderIndex: number,
  deliveryIso: string,
): string {
  const prefix = milestoneNamePrefix(milestoneName, orderIndex);
  return `${prefix}: ${formatDueLabel(deliveryIso)}`;
}

export function aggregateProjectStatus(milestones: PlanningMilestone[]): MilestoneStatus {
  const ordered = [...milestones].sort((a, b) => a.order_index - b.order_index);
  const active = ordered.find((row) => row.status !== "completed");
  if (active) {
    return active.status;
  }
  if (ordered.length > 0) {
    return "completed";
  }
  return "todo";
}

export function aggregateProjectRisk(milestones: PlanningMilestone[]): MilestoneRisk {
  const ordered = [...milestones].sort((a, b) => a.order_index - b.order_index);
  const active = ordered.filter((row) => row.status !== "completed");
  const pool = active.length > 0 ? active : ordered;
  let worst: MilestoneRisk = "on_track";
  for (const row of pool) {
    if (RISK_RANK[row.risk] > RISK_RANK[worst]) {
      worst = row.risk;
    }
  }
  return worst;
}

export function projectHasPlanningData(project: GlobalPlanningProject): boolean {
  return project.plan !== null && project.milestones.length > 0;
}

export function defaultEnabledProjectKeys(projects: GlobalPlanningProject[]): Set<string> {
  const keys = new Set<string>();
  for (const project of projects) {
    if (projectHasPlanningData(project)) {
      keys.add(project.project_key);
    }
  }
  return keys;
}

function parseIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  return new Date(year, month - 1, day);
}

export function resolveGlobalPlanningRange(
  projects: GlobalPlanningProject[],
  enabledKeys: Set<string>,
): GlobalPlanningRange {
  let fromIso = defaultGlobalRangeStartIso();
  let toIso = defaultGlobalRangeEndIso();

  for (const project of projects) {
    if (!enabledKeys.has(project.project_key) || !project.plan) {
      continue;
    }
    const planStart = planStartOrDefault(project.plan);
    const startWeeks = computeMilestoneStartWeeks(project.milestones);
    for (const milestone of project.milestones) {
      const startWeek = startWeeks.get(milestone.id) ?? 0;
      const milestoneStartIso = addDaysToIso(planStart, startWeek * 7);
      const deliveryIso = milestoneDeliveryDateIso(
        planStart,
        startWeek,
        milestone.duration_weeks,
      );
      if (parseIso(milestoneStartIso) < parseIso(fromIso)) {
        fromIso = milestoneStartIso;
      }
      if (parseIso(deliveryIso) > parseIso(toIso)) {
        toIso = deliveryIso;
      }
    }
  }

  return { fromIso, toIso };
}

export function buildGlobalProjectRow(
  project: GlobalPlanningProject,
  columns: WeekColumn[],
): GlobalProjectRow | null {
  if (!project.plan || project.milestones.length === 0) {
    return null;
  }

  const planStart = planStartOrDefault(project.plan);
  const startWeeks = computeMilestoneStartWeeks(project.milestones);
  const offsets = weekColumnOffsets(columns);
  const bars: GlobalMilestoneBar[] = [];

  for (const milestone of [...project.milestones].sort((a, b) => a.order_index - b.order_index)) {
    const startWeek = startWeeks.get(milestone.id) ?? 0;
    const duration = Math.max(1, milestone.duration_weeks);
    const milestoneStartIso = addDaysToIso(planStart, startWeek * 7);
    const deliveryIso = milestoneDeliveryDateIso(planStart, startWeek, duration);
    const columnIndex = weekIndexForDate(columns, milestoneStartIso);
    if (columnIndex === null) {
      continue;
    }
    const leftPx = (offsets[columnIndex] ?? 0) + 2;
    const widthPx = Math.max(8, weekRangeWidthPx(columns, columnIndex, duration) - 4);
    const label = formatGlobalBarLabel(milestone.name, milestone.order_index, deliveryIso);
    bars.push({
      milestoneId: milestone.id,
      label,
      leftPx,
      widthPx,
      risk: milestone.risk,
      title: `${milestone.name} — ${formatDueLabel(deliveryIso)}`,
    });
  }

  return {
    projectKey: project.project_key,
    displayName: project.display_name,
    status: aggregateProjectStatus(project.milestones),
    risk: aggregateProjectRisk(project.milestones),
    bars,
  };
}

export function buildGlobalProjectRows(
  projects: GlobalPlanningProject[],
  enabledKeys: Set<string>,
  columns: WeekColumn[],
): GlobalProjectRow[] {
  const rows: GlobalProjectRow[] = [];
  for (const project of projects) {
    if (!enabledKeys.has(project.project_key)) {
      continue;
    }
    const row = buildGlobalProjectRow(project, columns);
    if (row) {
      rows.push(row);
    }
  }
  return rows;
}
