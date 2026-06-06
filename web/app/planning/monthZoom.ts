export type MonthZoom = {
  expandedMonthCount: number;
  zoomedCellPx: number;
};

export const DEFAULT_MONTH_ZOOM: MonthZoom = {
  expandedMonthCount: 2,
  zoomedCellPx: 28,
};

export const MONTH_ZOOM_MONTH_MIN = 1;
export const MONTH_ZOOM_CELL_PX_MIN = 16;
export const MONTH_ZOOM_CELL_PX_MAX = 40;
export const MONTH_ZOOM_COMPACT_CELL_PX = 14;

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
  const max = Math.max(MONTH_ZOOM_MONTH_MIN, maxExpandedMonths);
  return {
    expandedMonthCount: Math.max(
      MONTH_ZOOM_MONTH_MIN,
      Math.min(max, Math.round(zoom.expandedMonthCount)),
    ),
    zoomedCellPx: Math.max(
      MONTH_ZOOM_CELL_PX_MIN,
      Math.min(MONTH_ZOOM_CELL_PX_MAX, Math.round(zoom.zoomedCellPx)),
    ),
  };
}

export function cellWidthPx(monthKey: string, zoom: MonthZoom, expandedKeys: Set<string>): number {
  return expandedKeys.has(monthKey) ? zoom.zoomedCellPx : MONTH_ZOOM_COMPACT_CELL_PX;
}
