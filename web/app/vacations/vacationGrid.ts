import {
  applyViewportDayZoom,
  buildExpandedMonthKeys,
  cellWidthPx,
  clampMonthZoom,
  DEFAULT_MONTH_ZOOM,
  orderedMonthKeysInRange,
  type MonthZoom,
} from "../planning/monthZoom";
import { monthLongName, monthStripeFromDate } from "../planning/planningTimeline";

export type VacationMonthZoom = MonthZoom;
export const DEFAULT_VACATION_MONTH_ZOOM = DEFAULT_MONTH_ZOOM;

export type VacationDayColumn = {
  iso: string;
  dayOfMonth: number;
  dayOfWeekLetter: string;
  monthLabel: string;
  monthKey: string;
  isToday: boolean;
  isZoomed: boolean;
  isWeekend: boolean;
  monthStripe: 0 | 1;
  dayWidthPx: number;
};
export const VACATION_WEEKEND_CELL_COLOR = "#3a4454";
export const VACATION_WEEKEND_CELL_SELECTED_COLOR = "#4a5568";
export const VACATION_HOLIDAY_CELL_COLOR = "#4c1d95";

const DAY_OF_WEEK_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map((part) => Number(part));
  return new Date(y, m - 1, d);
}

function isoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayIso(): string {
  return isoFromDate(new Date());
}

export function isWeekendIso(iso: string): boolean {
  const day = parseIso(iso).getDay();
  return day === 0 || day === 6;
}

export function buildDayColumns(
  fromIso: string,
  toIso: string,
  zoom: VacationMonthZoom = DEFAULT_VACATION_MONTH_ZOOM,
  viewportWidthPx: number = 0,
  stickyLeftPx: number = 0,
): VacationDayColumn[] {
  const start = parseIso(fromIso);
  const end = parseIso(toIso);
  const today = todayIso();
  const rangeMonthKeys = orderedMonthKeysInRange(start, end);
  const clampedZoom = clampMonthZoom(zoom, rangeMonthKeys.length);
  const zoomMonthKeys = buildExpandedMonthKeys(
    clampedZoom.expandedMonthCount,
    rangeMonthKeys,
  );
  const columns: VacationDayColumn[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const iso = isoFromDate(cursor);
    const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const isZoomed = zoomMonthKeys.has(monthKey);
    columns.push({
      iso,
      dayOfMonth: cursor.getDate(),
      dayOfWeekLetter: DAY_OF_WEEK_LETTERS[cursor.getDay()],
      monthLabel: monthLongName(cursor),
      monthKey,
      isToday: iso === today,
      isZoomed,
      isWeekend: cursor.getDay() === 0 || cursor.getDay() === 6,
      monthStripe: monthStripeFromDate(cursor),
      dayWidthPx: cellWidthPx(monthKey, clampedZoom, zoomMonthKeys),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  applyViewportDayZoom(columns, clampedZoom, zoomMonthKeys, viewportWidthPx, stickyLeftPx);
  return columns;
}

export type VacationMonthSpan = {
  label: string;
  monthKey: string;
  monthStripe: 0 | 1;
  widthPx: number;
};

function monthDateFromKey(monthKey: string): Date {
  const [year, month] = monthKey.split("-").map((part) => Number(part));
  return new Date(year, month - 1, 1);
}

export function monthSpans(columns: VacationDayColumn[]): VacationMonthSpan[] {
  const spans: VacationMonthSpan[] = [];
  for (const col of columns) {
    const last = spans[spans.length - 1];
    const width = dayColumnWidth(col);
    if (last && last.monthKey === col.monthKey) {
      last.widthPx += width;
    } else {
      spans.push({
        label: col.monthLabel,
        monthKey: col.monthKey,
        monthStripe: monthStripeFromDate(monthDateFromKey(col.monthKey)),
        widthPx: width,
      });
    }
  }
  return spans;
}

export const VACATION_DAY_PX_NORMAL = 14;

export function dayColumnWidth(col: VacationDayColumn): number {
  return col.dayWidthPx;
}

export function timelineWidthPx(columns: VacationDayColumn[]): number {
  return columns.reduce((sum, col) => sum + dayColumnWidth(col), 0);
}

export function todayLineLeftPx(columns: VacationDayColumn[], stickyNameW: number): number | null {
  let offset = stickyNameW;
  for (const col of columns) {
    if (col.isToday) {
      return offset + dayColumnWidth(col) / 2;
    }
    offset += dayColumnWidth(col);
  }
  return null;
}

export function defaultScrollLeftPx(columns: VacationDayColumn[]): number {
  let offset = 0;
  for (const col of columns) {
    if (col.isToday) {
      return Math.max(0, offset - col.dayWidthPx * 4);
    }
    offset += dayColumnWidth(col);
  }
  return 0;
}
