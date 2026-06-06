"use client";

import type { ReactElement } from "react";
import {
  MONTH_ZOOM_CELL_PX_MAX,
  MONTH_ZOOM_CELL_PX_MIN,
  MONTH_ZOOM_MONTH_MIN,
  type MonthZoom,
} from "../monthZoom";

type Props = {
  monthZoom: MonthZoom;
  maxExpandedMonths: number;
  cellWidthLabel: string;
  onMonthZoomChange: (zoom: MonthZoom) => void;
};

const sliderStyle = {
  width: "100%",
  accentColor: "#3b82f6",
} as const;

export function MonthZoomWidget({
  monthZoom,
  maxExpandedMonths,
  cellWidthLabel,
  onMonthZoomChange,
}: Props): ReactElement {
  const max = Math.max(MONTH_ZOOM_MONTH_MIN, maxExpandedMonths);
  const expandedCount = Math.min(monthZoom.expandedMonthCount, max);
  const allExpanded = expandedCount >= max;

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: 10,
        borderRadius: 8,
        border: "1px solid #334155",
        background: "#0b1220",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>Month zoom</div>
      <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#94a3b8" }}>
        <span>
          {allExpanded
            ? `All months expanded (${max})`
            : `Expanded months (${expandedCount}) — from current month`}
        </span>
        <input
          type="range"
          min={MONTH_ZOOM_MONTH_MIN}
          max={max}
          step={1}
          value={expandedCount}
          style={sliderStyle}
          onChange={(e) => {
            onMonthZoomChange({
              ...monthZoom,
              expandedMonthCount: Number(e.target.value),
            });
          }}
        />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#94a3b8" }}>
        <span>
          {cellWidthLabel} ({monthZoom.zoomedCellPx}px)
        </span>
        <input
          type="range"
          min={MONTH_ZOOM_CELL_PX_MIN}
          max={MONTH_ZOOM_CELL_PX_MAX}
          step={2}
          value={monthZoom.zoomedCellPx}
          style={sliderStyle}
          onChange={(e) => {
            onMonthZoomChange({
              ...monthZoom,
              zoomedCellPx: Number(e.target.value),
            });
          }}
        />
      </label>
    </div>
  );
}
