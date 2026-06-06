import {
  buildExpandedMonthKeys,
  cellWidthPx,
  clampMonthZoom,
  DEFAULT_MONTH_ZOOM,
  monthKeyFromDate,
  orderedMonthKeysInRange,
  type MonthZoom,
} from "./monthZoom";
import type { PlanningMilestone, ProjectPlan } from "./types";

export const PLANNING_WEEKS_MAX = 104;
/** Default week column width when month zoom is not applied. */
export const WEEK_COLUMN_PX = 28;

export type WeekColumn = {
  week_index: number;
  month_label: string;
  month_key: string;
  range_label: string;
  isZoomed: boolean;
  weekWidthPx: number;
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

export function planningRangeMonthKeys(
  startDate: string,
  weekCount: number = PLANNING_WEEKS_MAX,
): string[] {
  const start = parsePlanStart(startDate);
  const end = addDays(start, weekCount * 7 - 1);
  return orderedMonthKeysInRange(start, end);
}

export function buildWeekColumns(
  startDate: string,
  weekCount: number = PLANNING_WEEKS_MAX,
  zoom: MonthZoom = DEFAULT_MONTH_ZOOM,
): WeekColumn[] {
  const start = parsePlanStart(startDate);
  const rangeMonthKeys = planningRangeMonthKeys(startDate, weekCount);
  const clampedZoom = clampMonthZoom(zoom, rangeMonthKeys.length);
  const expandedMonthKeys = buildExpandedMonthKeys(
    clampedZoom.expandedMonthCount,
    rangeMonthKeys,
  );
  const columns: WeekColumn[] = [];
  for (let week = 0; week < weekCount; week++) {
    const weekStart = addDays(start, week * 7);
    const weekEnd = addDays(weekStart, 6);
    const monthKey = monthKeyFromDate(weekStart);
    const isZoomed = expandedMonthKeys.has(monthKey);
    columns.push({
      week_index: week,
      month_label: monthShort(weekStart),
      month_key: monthKey,
      range_label: `${formatDay(weekStart)}-${formatDay(weekEnd)}`,
      isZoomed,
      weekWidthPx: cellWidthPx(monthKey, clampedZoom, expandedMonthKeys),
    });
  }
  return columns;
}

export function weekTimelineWidthPx(columns: WeekColumn[]): number {
  return columns.reduce((sum, col) => sum + col.weekWidthPx, 0);
}

export function weekColumnOffsets(columns: WeekColumn[]): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  for (const col of columns) {
    offsets.push(cursor);
    cursor += col.weekWidthPx;
  }
  return offsets;
}

export function weekRangeWidthPx(
  columns: WeekColumn[],
  startWeek: number,
  durationWeeks: number,
): number {
  let width = 0;
  const endWeek = Math.min(columns.length, startWeek + durationWeeks);
  for (let week = startWeek; week < endWeek; week += 1) {
    width += columns[week].weekWidthPx;
  }
  return width;
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
