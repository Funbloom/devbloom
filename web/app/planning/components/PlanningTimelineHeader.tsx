"use client";

import type { ReactElement } from "react";
import type { MonthSpan, WeekColumn } from "../planningTimeline";

export const PLANNING_STICKY_NAME_W = 200;
export const PLANNING_STICKY_STATUS_W = 110;
export const PLANNING_STICKY_RISK_W = 100;
export const PLANNING_STICKY_LEFT_W =
  PLANNING_STICKY_NAME_W + PLANNING_STICKY_STATUS_W + PLANNING_STICKY_RISK_W;
export const PLANNING_HEADER_H = 52;

export const PLANNING_MONTH_HEADER_COLORS: [string, string] = ["#1e3a5f", "#2d4a3e"];
export const PLANNING_WEEK_STRIPE_COLORS: [string, string] = ["#1e3a5f", "#2d4a3e"];
export const PLANNING_WEEK_BODY_STRIPE_COLORS: [string, string] = ["#0b1220", "#111827"];

type StickyColumn = {
  label: string;
  width: number;
};

type Props = {
  stickyColumns: StickyColumn[];
  columns: WeekColumn[];
  monthGroups: MonthSpan[];
  timelineWidth: number;
  todayLineLeft: number | null;
};

export function PlanningTimelineHeader({
  stickyColumns,
  columns,
  monthGroups,
  timelineWidth,
  todayLineLeft,
}: Props): ReactElement {
  const cellBorder = "1px solid #2a2f3a";

  return (
    <>
      {todayLineLeft !== null ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: todayLineLeft,
            width: 2,
            background: "#f97316",
            zIndex: 5,
            pointerEvents: "none",
          }}
        />
      ) : null}

      <div style={{ display: "flex", height: PLANNING_HEADER_H, background: "#111827" }}>
        <div
          style={{
            position: "sticky",
            left: 0,
            zIndex: 4,
            display: "flex",
            background: "#111827",
            borderRight: cellBorder,
          }}
        >
          {stickyColumns.map((column, index) => (
            <div
              key={column.label}
              style={{
                width: column.width,
                padding: "8px 10px",
                fontWeight: 600,
                fontSize: 12,
                borderRight: index < stickyColumns.length - 1 ? cellBorder : undefined,
                display: "flex",
                alignItems: "flex-end",
              }}
            >
              {column.label}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: timelineWidth }}>
          <div style={{ display: "flex", height: PLANNING_HEADER_H / 2 }}>
            {monthGroups.map((group) => (
              <div
                key={group.monthKey}
                style={{
                  width: group.widthPx,
                  borderRight: cellBorder,
                  borderBottom: cellBorder,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "4px 6px",
                  textAlign: "center",
                  color: "#e2e8f0",
                  background: PLANNING_MONTH_HEADER_COLORS[group.monthStripe],
                }}
              >
                {group.label}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", height: PLANNING_HEADER_H / 2 }}>
            {columns.map((col) => (
              <div
                key={col.week_index}
                style={{
                  width: col.weekWidthPx,
                  minWidth: col.weekWidthPx,
                  borderRight: cellBorder,
                  background: PLANNING_WEEK_STRIPE_COLORS[col.week_stripe],
                  fontSize: 9,
                  padding: "2px 2px",
                  textAlign: "center",
                  color: "#e2e8f0",
                  overflow: "hidden",
                }}
                title={`${col.week_start_iso} – ${col.week_end_iso}`}
              >
                {col.range_label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
