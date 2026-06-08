"use client";

import type { ReactElement } from "react";
import type { WeekColumn } from "../planningTimeline";
import { PLANNING_WEEK_BODY_STRIPE_COLORS } from "./PlanningTimelineHeader";

type Props = {
  columns: WeekColumn[];
  height: number;
  cellBorder: string;
};

export function PlanningTimelineWeekGrid({
  columns,
  height,
  cellBorder,
}: Props): ReactElement {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height,
        display: "flex",
        zIndex: 0,
        pointerEvents: "none",
      }}
    >
      {columns.map((col) => (
        <div
          key={col.week_index}
          style={{
            width: col.weekWidthPx,
            minWidth: col.weekWidthPx,
            height: "100%",
            borderRight: cellBorder,
            boxSizing: "border-box",
            background: PLANNING_WEEK_BODY_STRIPE_COLORS[col.week_stripe],
          }}
        />
      ))}
    </div>
  );
}
