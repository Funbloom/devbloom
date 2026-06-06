import {
  buildExpandedMonthKeys,
  cellWidthPx,
  clampMonthZoom,
  DEFAULT_MONTH_ZOOM,
  orderedMonthKeysInRange,
  type MonthZoom,
} from "./monthZoom";

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
  weekStripe: 0 | 1;
  dayWidthPx: number;
};

export const VACATION_WEEK_DOW_COLORS: [string, string] = ["#1e3a5f", "#2d4a3e"];
export const VACATION_WEEKEND_CELL_COLOR = "#3a4454";
export const VACATION_WEEKEND_CELL_SELECTED_COLOR = "#4a5568";
export const VACATION_HOLIDAY_CELL_COLOR = "#4c1d95";

const DAY_OF_WEEK_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

const MONTH_NAMES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

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

export function buildDayColumns(
  fromIso: string,
  toIso: string,
  zoom: VacationMonthZoom = DEFAULT_VACATION_MONTH_ZOOM,
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
  const weekAnchor = new Date(start);
  weekAnchor.setDate(start.getDate() - start.getDay());
  weekAnchor.setHours(0, 0, 0, 0);
  const msPerDay = 24 * 60 * 60 * 1000;

  const columns: VacationDayColumn[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const iso = isoFromDate(cursor);
    const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const dayOffset = Math.floor((cursor.getTime() - weekAnchor.getTime()) / msPerDay);
    const weekStripe = (Math.floor(dayOffset / 7) % 2) as 0 | 1;
    const isZoomed = zoomMonthKeys.has(monthKey);
    columns.push({
      iso,
      dayOfMonth: cursor.getDate(),
      dayOfWeekLetter: DAY_OF_WEEK_LETTERS[cursor.getDay()],
      monthLabel: MONTH_NAMES[cursor.getMonth()],
      monthKey,
      isToday: iso === today,
      isZoomed,
      isWeekend: cursor.getDay() === 0 || cursor.getDay() === 6,
      weekStripe,
      dayWidthPx: cellWidthPx(monthKey, clampedZoom, zoomMonthKeys),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return columns;
}

export function monthSpans(
  columns: VacationDayColumn[],
): Array<{ label: string; monthKey: string; span: number }> {
  const spans: Array<{ label: string; monthKey: string; span: number }> = [];
  for (const col of columns) {
    const last = spans[spans.length - 1];
    if (last && last.monthKey === col.monthKey) {
      last.span += 1;
    } else {
      spans.push({ label: col.monthLabel, monthKey: col.monthKey, span: 1 });
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
