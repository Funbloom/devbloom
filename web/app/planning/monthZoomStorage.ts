import {
  clampMonthZoom,
  DEFAULT_MONTH_ZOOM,
  MONTH_ZOOM_CELL_PX_MAX,
  MONTH_ZOOM_CELL_PX_MIN,
  MONTH_ZOOM_MONTH_MIN,
  type MonthZoom,
} from "./monthZoom";

export const PLANNING_MONTH_ZOOM_STORAGE_KEY = "devbloom_planning_month_zoom";
export const VACATION_MONTH_ZOOM_STORAGE_KEY = "devbloom_vacation_month_zoom";

function parseStoredMonthZoom(raw: string): MonthZoom | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MonthZoom>;
    const expandedMonthCount = Number(parsed.expandedMonthCount);
    const zoomedCellPx = Number(parsed.zoomedCellPx);
    if (!Number.isFinite(expandedMonthCount) || !Number.isFinite(zoomedCellPx)) {
      return null;
    }
    return {
      expandedMonthCount: Math.max(MONTH_ZOOM_MONTH_MIN, Math.round(expandedMonthCount)),
      zoomedCellPx: Math.max(
        MONTH_ZOOM_CELL_PX_MIN,
        Math.min(MONTH_ZOOM_CELL_PX_MAX, Math.round(zoomedCellPx)),
      ),
    };
  } catch {
    return null;
  }
}

export function loadMonthZoom(storageKey: string, maxExpandedMonths?: number): MonthZoom {
  if (typeof window === "undefined") {
    return DEFAULT_MONTH_ZOOM;
  }
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return DEFAULT_MONTH_ZOOM;
  }
  const parsed = parseStoredMonthZoom(raw);
  if (!parsed) {
    return DEFAULT_MONTH_ZOOM;
  }
  if (maxExpandedMonths !== undefined) {
    return clampMonthZoom(parsed, maxExpandedMonths);
  }
  return parsed;
}

export function saveMonthZoom(storageKey: string, zoom: MonthZoom): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(zoom));
}
