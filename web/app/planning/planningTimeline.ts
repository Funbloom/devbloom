import {
  applyViewportWeekZoom,
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
export const GLOBAL_PLANNING_MONTHS_DEFAULT = 24;
/** Default week column width when month zoom is not applied. */
export const WEEK_COLUMN_PX = 28;

export type WeekColumn = {
  week_index: number;
  month_label: string;
  month_key: string;
  month_stripe: 0 | 1;
  week_stripe: 0 | 1;
  range_label: string;
  week_start_iso: string;
  week_end_iso: string;
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

export function startOfWeekSunday(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

export function monthLongName(date: Date): string {
  return date.toLocaleString("en-US", { month: "long" });
}

export function monthStripeFromDate(date: Date): 0 | 1 {
  const stripe = (date.getFullYear() * 12 + date.getMonth()) % 2;
  return stripe as 0 | 1;
}

export function isoFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatWeekRangeLabel(weekStart: Date, weekEnd: Date): string {
  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${weekStart.getDate()}-${weekEnd.getDate()}`;
  }
  return `${weekStart.getDate()}-${weekEnd.getDate()}`;
}

function buildWeekColumn(
  weekIndex: number,
  weekStart: Date,
  expandedMonthKeys: Set<string>,
  clampedZoom: MonthZoom,
): WeekColumn {
  const weekEnd = addDays(weekStart, 6);
  const monthKey = monthKeyFromDate(weekStart);
  return {
    week_index: weekIndex,
    month_label: monthLongName(weekStart),
    month_key: monthKey,
    month_stripe: monthStripeFromDate(weekStart),
    week_stripe: (weekIndex % 2) as 0 | 1,
    range_label: formatWeekRangeLabel(weekStart, weekEnd),
    week_start_iso: isoFromDate(weekStart),
    week_end_iso: isoFromDate(weekEnd),
    isZoomed: expandedMonthKeys.has(monthKey),
    weekWidthPx: cellWidthPx(monthKey, clampedZoom, expandedMonthKeys),
  };
}

export function planningTimelineAnchor(startDate: string): Date {
  return startOfWeekSunday(parsePlanStart(startDate));
}

export function planningRangeMonthKeys(
  startDate: string,
  weekCount: number = PLANNING_WEEKS_MAX,
): string[] {
  const anchor = planningTimelineAnchor(startDate);
  const end = addDays(anchor, weekCount * 7 - 1);
  return orderedMonthKeysInRange(anchor, end);
}

export function buildWeekColumnsFromAnchor(
  anchor: Date,
  weekCount: number,
  zoom: MonthZoom = DEFAULT_MONTH_ZOOM,
  viewportWidthPx: number = 0,
  stickyLeftPx: number = 0,
): WeekColumn[] {
  const end = addDays(anchor, weekCount * 7 - 1);
  const rangeMonthKeys = orderedMonthKeysInRange(anchor, end);
  const clampedZoom = clampMonthZoom(zoom, rangeMonthKeys.length);
  const expandedMonthKeys = buildExpandedMonthKeys(
    clampedZoom.expandedMonthCount,
    rangeMonthKeys,
  );
  const columns: WeekColumn[] = [];
  for (let week = 0; week < weekCount; week += 1) {
    const weekStart = addDays(anchor, week * 7);
    columns.push(buildWeekColumn(week, weekStart, expandedMonthKeys, clampedZoom));
  }
  applyViewportWeekZoom(columns, clampedZoom, expandedMonthKeys, viewportWidthPx, stickyLeftPx);
  return columns;
}

export function buildWeekColumns(
  startDate: string,
  weekCount: number = PLANNING_WEEKS_MAX,
  zoom: MonthZoom = DEFAULT_MONTH_ZOOM,
  viewportWidthPx: number = 0,
  stickyLeftPx: number = 0,
): WeekColumn[] {
  return buildWeekColumnsFromAnchor(
    planningTimelineAnchor(startDate),
    weekCount,
    zoom,
    viewportWidthPx,
    stickyLeftPx,
  );
}

export function defaultGlobalRangeStartIso(today: Date = new Date()): string {
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  return isoFromDate(startOfWeekSunday(firstOfMonth));
}

export function defaultGlobalRangeEndIso(today: Date = new Date()): string {
  const endMonth = new Date(today.getFullYear(), today.getMonth() + GLOBAL_PLANNING_MONTHS_DEFAULT, 0);
  return isoFromDate(endMonth);
}

export function buildCalendarWeekColumns(
  rangeStartIso: string,
  rangeEndIso: string,
  zoom: MonthZoom = DEFAULT_MONTH_ZOOM,
  viewportWidthPx: number = 0,
  stickyLeftPx: number = 0,
): WeekColumn[] {
  const rangeStart = parsePlanStart(rangeStartIso);
  const rangeEnd = parsePlanStart(rangeEndIso);
  const anchor = startOfWeekSunday(rangeStart);
  const msPerDay = 24 * 60 * 60 * 1000;
  const weekCount = Math.min(
    PLANNING_WEEKS_MAX,
    Math.max(1, Math.ceil((rangeEnd.getTime() - anchor.getTime() + msPerDay) / (7 * msPerDay))),
  );
  return buildWeekColumnsFromAnchor(anchor, weekCount, zoom, viewportWidthPx, stickyLeftPx);
}

export function defaultPlanningScrollLeftPx(
  columns: WeekColumn[],
  stickyLeftPx: number,
  viewportWidthPx: number,
): number {
  const todayIndex = currentWeekIndexInColumns(columns);
  if (todayIndex === null) {
    return 0;
  }
  const offsets = weekColumnOffsets(columns);
  const todayOffset = offsets[todayIndex] ?? 0;
  const timelineViewportPx = Math.max(0, viewportWidthPx - stickyLeftPx);
  if (timelineViewportPx <= 0) {
    return Math.max(0, todayOffset);
  }
  return Math.max(0, todayOffset - Math.floor(timelineViewportPx * 0.1));
}

export function calendarRangeMonthKeys(
  rangeStartIso: string,
  rangeEndIso: string,
): string[] {
  const anchor = startOfWeekSunday(parsePlanStart(rangeStartIso));
  const end = parsePlanStart(rangeEndIso);
  return orderedMonthKeysInRange(anchor, end);
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

export function weekIndexForDate(columns: WeekColumn[], dateIso: string): number | null {
  const target = parsePlanStart(dateIso).getTime();
  for (const col of columns) {
    const start = parsePlanStart(col.week_start_iso).getTime();
    const end = parsePlanStart(col.week_end_iso).getTime();
    if (target >= start && target <= end) {
      return col.week_index;
    }
  }
  return null;
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
  const anchor = planningTimelineAnchor(startDate);
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const anchorMidnight = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (todayMidnight < anchorMidnight) {
    return null;
  }
  const diffMs = todayMidnight.getTime() - anchorMidnight.getTime();
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
}

export function currentWeekIndexInColumns(
  columns: WeekColumn[],
  today: Date = new Date(),
): number | null {
  return weekIndexForDate(columns, isoFromDate(today));
}

/** 0–1 position within a Sun–Sat week column (center of today's day slot). */
export function dayOffsetFractionInWeek(today: Date = new Date()): number {
  const dayOfWeek = today.getDay();
  return (dayOfWeek + 0.5) / 7;
}

export function todayLineLeftPx(
  columns: WeekColumn[],
  weekOffsets: number[],
  stickyLeftPx: number,
  today: Date = new Date(),
): number | null {
  const weekIndex = weekIndexForDate(columns, isoFromDate(today));
  if (weekIndex === null || weekIndex < 0 || weekIndex >= columns.length) {
    return null;
  }
  const column = columns[weekIndex];
  const fraction = dayOffsetFractionInWeek(today);
  return stickyLeftPx + (weekOffsets[weekIndex] ?? 0) + column.weekWidthPx * fraction;
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

export function addDaysToIso(iso: string, days: number): string {
  const base = parsePlanStart(iso);
  const shifted = addDays(base, days);
  return isoFromDate(shifted);
}

export function milestoneDeliveryDateIso(
  planStart: string,
  startWeek: number,
  durationWeeks: number,
): string {
  const milestoneStartOffsetDays = startWeek * 7;
  const deliveryOffsetDays = milestoneStartOffsetDays + Math.max(1, durationWeeks) * 7;
  return addDaysToIso(planStart, deliveryOffsetDays);
}

export function formatDueLabel(deliveryIso: string): string {
  const date = parsePlanStart(deliveryIso);
  const month = date.toLocaleString("en-US", { month: "short" });
  return `Due: ${month} ${date.getDate()}`;
}

export function durationWeeksFromDeliveryDate(
  planStart: string,
  startWeek: number,
  deliveryIso: string,
): number {
  const planStartDate = parsePlanStart(planStart);
  const deliveryDate = parsePlanStart(deliveryIso);
  const milestoneStart = addDays(planStartDate, startWeek * 7);
  const diffMs = deliveryDate.getTime() - milestoneStart.getTime();
  const days = Math.max(0, Math.round(diffMs / (24 * 60 * 60 * 1000)));
  return Math.max(1, Math.ceil(days / 7));
}

export type MonthSpan = {
  label: string;
  monthKey: string;
  monthStripe: 0 | 1;
  widthPx: number;
};

export function monthSpans(columns: WeekColumn[]): MonthSpan[] {
  const spans: MonthSpan[] = [];
  for (const col of columns) {
    const last = spans[spans.length - 1];
    if (last && last.monthKey === col.month_key) {
      last.widthPx += col.weekWidthPx;
    } else {
      spans.push({
        label: col.month_label,
        monthKey: col.month_key,
        monthStripe: col.month_stripe,
        widthPx: col.weekWidthPx,
      });
    }
  }
  return spans;
}
