import {
  clampMonthZoom,
  DEFAULT_MONTH_ZOOM,
  DEFAULT_ZOOM_PERCENT,
  monthZoomFromPercent,
  ZOOM_PERCENT_MAX,
  ZOOM_PERCENT_MIN,
  type MonthZoom,
} from "./monthZoom";

export const PLANNING_MONTH_ZOOM_STORAGE_KEY = "devbloom_planning_month_zoom";
export const GLOBAL_PLANNING_MONTH_ZOOM_STORAGE_KEY = "devbloom_planning_global_month_zoom";
export const VACATION_MONTH_ZOOM_STORAGE_KEY = "devbloom_vacation_month_zoom";

function parseStoredMonthZoom(raw: string): MonthZoom | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MonthZoom>;
    const zoomPercent = Number(parsed.zoomPercent);
    if (Number.isFinite(zoomPercent)) {
      return monthZoomFromPercent(zoomPercent, 1);
    }
    return monthZoomFromPercent(DEFAULT_ZOOM_PERCENT, 1);
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
    return monthZoomFromPercent(
      DEFAULT_ZOOM_PERCENT,
      maxExpandedMonths ?? 1,
    );
  }
  const parsed = parseStoredMonthZoom(raw);
  if (!parsed) {
    return monthZoomFromPercent(
      DEFAULT_ZOOM_PERCENT,
      maxExpandedMonths ?? 1,
    );
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
  const percent = Math.max(
    ZOOM_PERCENT_MIN,
    Math.min(ZOOM_PERCENT_MAX, Math.round(zoom.zoomPercent)),
  );
  window.localStorage.setItem(storageKey, JSON.stringify({ zoomPercent: percent }));
}
