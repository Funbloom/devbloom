export type MonthZoom = {
  zoomPercent: number;
  expandedMonthCount: number;
  zoomedCellPx: number;
};

export const ZOOM_PERCENT_MIN = 0;
export const ZOOM_PERCENT_MAX = 100;
export const DEFAULT_ZOOM_PERCENT = 50;

export const MONTH_ZOOM_MONTH_MIN = 1;
/** Expanded month count at 100% zoom (current month + next). */
export const MONTH_ZOOM_EXPANDED_AT_MAX = 2;
export const MONTH_ZOOM_COMPACT_CELL_PX = 14;
export const MONTH_ZOOM_CELL_PX_AT_ZERO = 14;
export const MONTH_ZOOM_CELL_PX_AT_MID = 40;
export const MONTH_ZOOM_CELL_PX_AT_MAX = 64;

/** @deprecated Use MONTH_ZOOM_CELL_PX_AT_ZERO / AT_MID / AT_MAX */
export const MONTH_ZOOM_CELL_PX_MIN = MONTH_ZOOM_CELL_PX_AT_ZERO;
/** @deprecated Use MONTH_ZOOM_CELL_PX_AT_MAX */
export const MONTH_ZOOM_CELL_PX_MAX = MONTH_ZOOM_CELL_PX_AT_MAX;

export function monthZoomFromPercent(
  percent: number,
  maxExpandedMonths: number,
): MonthZoom {
  const max = Math.max(MONTH_ZOOM_MONTH_MIN, maxExpandedMonths);
  const clampedPercent = Math.max(
    ZOOM_PERCENT_MIN,
    Math.min(ZOOM_PERCENT_MAX, Math.round(percent)),
  );
  const progress = clampedPercent / 100;

  const expandedMonthCount =
    clampedPercent === 0
      ? max
      : Math.max(
          MONTH_ZOOM_EXPANDED_AT_MAX,
          Math.round(max - progress * (max - MONTH_ZOOM_EXPANDED_AT_MAX)),
        );

  let zoomedCellPx: number;
  if (progress <= 0.5) {
    zoomedCellPx = Math.round(
      MONTH_ZOOM_CELL_PX_AT_ZERO +
        (progress / 0.5) * (MONTH_ZOOM_CELL_PX_AT_MID - MONTH_ZOOM_CELL_PX_AT_ZERO),
    );
  } else {
    zoomedCellPx = Math.round(
      MONTH_ZOOM_CELL_PX_AT_MID +
        ((progress - 0.5) / 0.5) * (MONTH_ZOOM_CELL_PX_AT_MAX - MONTH_ZOOM_CELL_PX_AT_MID),
    );
  }

  return {
    zoomPercent: clampedPercent,
    expandedMonthCount,
    zoomedCellPx,
  };
}

export const DEFAULT_MONTH_ZOOM: MonthZoom = monthZoomFromPercent(
  DEFAULT_ZOOM_PERCENT,
  MONTH_ZOOM_MONTH_MIN,
);

export function monthKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  return new Date(year, month - 1, day);
}

export function orderedMonthKeysInRange(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor <= end) {
    const key = monthKeyFromDate(cursor);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

export function orderedMonthKeysBetweenIso(fromIso: string, toIso: string): string[] {
  return orderedMonthKeysInRange(parseIsoDate(fromIso), parseIsoDate(toIso));
}

export function buildExpandedMonthKeys(
  expandedMonthCount: number,
  rangeMonthKeys: string[],
  ref: Date = new Date(),
): Set<string> {
  const max = Math.max(MONTH_ZOOM_MONTH_MIN, rangeMonthKeys.length);
  const count = Math.max(MONTH_ZOOM_MONTH_MIN, Math.min(max, Math.round(expandedMonthCount)));
  if (count >= max) {
    return new Set(rangeMonthKeys);
  }
  const rangeSet = new Set(rangeMonthKeys);
  const keys = new Set<string>();
  let year = ref.getFullYear();
  let month = ref.getMonth();
  for (let i = 0; i < count; i += 1) {
    const key = monthKeyFromDate(new Date(year, month, 1));
    if (rangeSet.has(key)) {
      keys.add(key);
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return keys;
}

export function clampMonthZoom(zoom: MonthZoom, maxExpandedMonths: number): MonthZoom {
  const percent = Number.isFinite(zoom.zoomPercent)
    ? zoom.zoomPercent
    : DEFAULT_ZOOM_PERCENT;
  return monthZoomFromPercent(percent, maxExpandedMonths);
}

export function cellWidthPx(monthKey: string, zoom: MonthZoom, expandedKeys: Set<string>): number {
  return expandedKeys.has(monthKey) ? zoom.zoomedCellPx : MONTH_ZOOM_COMPACT_CELL_PX;
}

type ViewportZoomColumn = {
  month_key: string;
  weekWidthPx: number;
  isZoomed: boolean;
};

export function applyViewportWeekZoom(
  columns: ViewportZoomColumn[],
  zoom: MonthZoom,
  expandedMonthKeys: Set<string>,
  viewportWidthPx: number,
  stickyLeftPx: number,
): void {
  if (zoom.zoomPercent < ZOOM_PERCENT_MAX || viewportWidthPx <= 0) {
    return;
  }
  let expandedWeeks = 0;
  for (const col of columns) {
    if (expandedMonthKeys.has(col.month_key)) {
      expandedWeeks += 1;
    }
  }
  if (expandedWeeks <= 0) {
    return;
  }
  const timelineViewportPx = Math.max(0, viewportWidthPx - stickyLeftPx);
  const zoomedPx = Math.max(
    MONTH_ZOOM_CELL_PX_AT_MID,
    Math.floor(timelineViewportPx / expandedWeeks),
  );
  for (const col of columns) {
    if (expandedMonthKeys.has(col.month_key)) {
      col.weekWidthPx = zoomedPx;
      col.isZoomed = true;
    }
  }
}

type ViewportZoomDayColumn = {
  monthKey: string;
  dayWidthPx: number;
  isZoomed: boolean;
};

export function applyViewportDayZoom(
  columns: ViewportZoomDayColumn[],
  zoom: MonthZoom,
  expandedMonthKeys: Set<string>,
  viewportWidthPx: number,
  stickyLeftPx: number,
): void {
  if (zoom.zoomPercent < ZOOM_PERCENT_MAX || viewportWidthPx <= 0) {
    return;
  }
  let expandedDays = 0;
  for (const col of columns) {
    if (expandedMonthKeys.has(col.monthKey)) {
      expandedDays += 1;
    }
  }
  if (expandedDays <= 0) {
    return;
  }
  const timelineViewportPx = Math.max(0, viewportWidthPx - stickyLeftPx);
  const zoomedPx = Math.max(
    MONTH_ZOOM_CELL_PX_AT_MID,
    Math.floor(timelineViewportPx / expandedDays),
  );
  for (const col of columns) {
    if (expandedMonthKeys.has(col.monthKey)) {
      col.dayWidthPx = zoomedPx;
      col.isZoomed = true;
    }
  }
}
