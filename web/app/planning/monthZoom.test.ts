import { describe, expect, it } from "vitest";
import {
  MONTH_ZOOM_EXPANDED_AT_MAX,
  applyViewportWeekZoom,
  monthZoomFromPercent,
} from "./monthZoom";

describe("monthZoom", () => {
  it("expands two months at 100% zoom", () => {
    const zoom = monthZoomFromPercent(100, 25);
    expect(zoom.expandedMonthCount).toBe(MONTH_ZOOM_EXPANDED_AT_MAX);
  });

  it("expands all months at 0% zoom", () => {
    const zoom = monthZoomFromPercent(0, 25);
    expect(zoom.expandedMonthCount).toBe(25);
  });

  it("sizes expanded weeks to fill viewport at 100% zoom", () => {
    const columns = [
      { month_key: "2026-06", weekWidthPx: 14, isZoomed: false },
      { month_key: "2026-06", weekWidthPx: 14, isZoomed: false },
      { month_key: "2026-07", weekWidthPx: 14, isZoomed: false },
      { month_key: "2026-07", weekWidthPx: 14, isZoomed: false },
      { month_key: "2026-08", weekWidthPx: 14, isZoomed: false },
    ];
    const expandedKeys = new Set(["2026-06", "2026-07"]);
    const zoom = monthZoomFromPercent(100, 12);
    applyViewportWeekZoom(columns, zoom, expandedKeys, 1200, 200);
    expect(columns[0].weekWidthPx).toBe(Math.floor(1000 / 4));
    expect(columns[4].weekWidthPx).toBe(14);
  });
});
