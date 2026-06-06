import type { PlanningMilestone, ProjectPlan } from "./types";

export const PLANNING_WEEKS_MAX = 104;
export const WEEK_COLUMN_PX = 28;

export type WeekColumn = {
  week_index: number;
  month_label: string;
  range_label: string;
};

function parsePlanStart(startDate: string): Date {
  const parts = startDate.split("-").map((p) => Number(p));
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date();
}

function addDays(base: Date, days: number): Date {
  const copy = new Date(base.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function monthShort(d: Date): string {
  return d.toLocaleString("en-US", { month: "short" }).toUpperCase();
}

function formatDay(d: Date): string {
  return String(d.getDate());
}

export function buildWeekColumns(startDate: string, weekCount: number = PLANNING_WEEKS_MAX): WeekColumn[] {
  const start = parsePlanStart(startDate);
  const columns: WeekColumn[] = [];
  for (let week = 0; week < weekCount; week++) {
    const weekStart = addDays(start, week * 7);
    const weekEnd = addDays(weekStart, 6);
    columns.push({
      week_index: week,
      month_label: monthShort(weekStart),
      range_label: `${formatDay(weekStart)}-${formatDay(weekEnd)}`,
    });
  }
  return columns;
}

export function computeMilestoneStartWeeks(milestones: PlanningMilestone[]): Map<string, number> {
  const ordered = [...milestones].sort((a, b) => a.order_index - b.order_index);
  const map = new Map<string, number>();
  let cursor = 0;
  for (const row of ordered) {
    map.set(row.id, cursor);
    cursor += Math.max(1, row.duration_weeks);
  }
  return map;
}

export function currentPlanWeekIndex(startDate: string, today: Date = new Date()): number | null {
  const start = parsePlanStart(startDate);
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  if (todayMidnight < startMidnight) {
    return null;
  }
  const diffMs = todayMidnight.getTime() - startMidnight.getTime();
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
}

export function defaultStartDateIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function planStartOrDefault(plan: ProjectPlan | null): string {
  return plan?.start_date?.trim() || defaultStartDateIso();
}
