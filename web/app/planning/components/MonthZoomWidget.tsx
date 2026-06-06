"use client";

import type { ReactElement } from "react";
import {
  monthZoomFromPercent,
  ZOOM_PERCENT_MAX,
  ZOOM_PERCENT_MIN,
  type MonthZoom,
} from "../monthZoom";

type Props = {
  monthZoom: MonthZoom;
  maxExpandedMonths: number;
  onMonthZoomChange: (zoom: MonthZoom) => void;
};

const SLIDER_WIDTH_PX = 120;

const sliderStyle = {
  width: SLIDER_WIDTH_PX,
  accentColor: "#3b82f6",
} as const;

export function MonthZoomWidget({
  monthZoom,
  maxExpandedMonths,
  onMonthZoomChange,
}: Props): ReactElement {
  const zoomPercent = Math.max(
    ZOOM_PERCENT_MIN,
    Math.min(ZOOM_PERCENT_MAX, Math.round(monthZoom.zoomPercent)),
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 16px",
        borderBottom: "1px solid #222836",
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", whiteSpace: "nowrap" }}>
        Zoom
      </span>
      <input
        type="range"
        min={ZOOM_PERCENT_MIN}
        max={ZOOM_PERCENT_MAX}
        step={1}
        value={zoomPercent}
        style={sliderStyle}
        aria-label="Timeline zoom"
        onChange={(e) => {
          onMonthZoomChange(
            monthZoomFromPercent(Number(e.target.value), maxExpandedMonths),
          );
        }}
      />
      <span
        style={{
          fontSize: 12,
          color: "#94a3b8",
          whiteSpace: "nowrap",
          minWidth: 72,
        }}
      >
        {zoomPercent}%
      </span>
    </div>
  );
}
