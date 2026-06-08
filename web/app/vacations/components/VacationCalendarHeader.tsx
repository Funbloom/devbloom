"use client";

import type { ReactElement } from "react";
import {
  PLANNING_HEADER_H,
  PLANNING_MONTH_HEADER_COLORS,
} from "../../planning/components/PlanningTimelineHeader";
import {
  dayColumnWidth,
  type VacationDayColumn,
  type VacationMonthSpan,
} from "../vacationGrid";

export const VACATION_STICKY_NAME_W = 180;
const DAY_LETTER_ROW_H = 18;
const DAY_NUM_ROW_H = 24;
const MONTH_ROW_H = PLANNING_HEADER_H / 2;

type Props = {
  columns: VacationDayColumn[];
  monthGroups: VacationMonthSpan[];
  timelineWidth: number;
  todayLineLeft: number | null;
};

export function vacationHeaderHeightPx(): number {
  return MONTH_ROW_H + DAY_LETTER_ROW_H + DAY_NUM_ROW_H;
}

export function VacationCalendarHeader({
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

      <div
        style={{
          display: "flex",
          height: MONTH_ROW_H,
          position: "sticky",
          top: 0,
          zIndex: 4,
          background: "#111827",
        }}
      >
        <div
          style={{
            width: VACATION_STICKY_NAME_W,
            minWidth: VACATION_STICKY_NAME_W,
            position: "sticky",
            left: 0,
            zIndex: 6,
            background: "#111827",
            borderRight: cellBorder,
            borderBottom: cellBorder,
            display: "flex",
            alignItems: "flex-end",
            padding: "8px 10px",
            fontSize: 12,
            fontWeight: 600,
            color: "#94a3b8",
          }}
        >
          Name
        </div>
        <div style={{ display: "flex", width: timelineWidth }}>
          {monthGroups.map((group) => (
            <div
              key={group.monthKey}
              style={{
                width: group.widthPx,
                borderBottom: cellBorder,
                borderRight: cellBorder,
                textAlign: "center",
                fontSize: 11,
                fontWeight: 600,
                padding: "4px 6px",
                color: "#e2e8f0",
                background: PLANNING_MONTH_HEADER_COLORS[group.monthStripe],
              }}
            >
              {group.label}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          height: DAY_LETTER_ROW_H,
          position: "sticky",
          top: MONTH_ROW_H,
          zIndex: 3,
          background: "#111827",
        }}
      >
        <div
          style={{
            width: VACATION_STICKY_NAME_W,
            minWidth: VACATION_STICKY_NAME_W,
            position: "sticky",
            left: 0,
            zIndex: 6,
            background: "#111827",
            borderRight: cellBorder,
            borderBottom: cellBorder,
          }}
        />
        <div style={{ display: "flex" }}>
          {columns.map((col) => (
            <div
              key={`dow-${col.iso}`}
              style={{
                width: dayColumnWidth(col),
                minWidth: dayColumnWidth(col),
                borderRight: cellBorder,
                borderBottom: cellBorder,
                background: PLANNING_MONTH_HEADER_COLORS[col.monthStripe],
                fontSize: 9,
                fontWeight: 600,
                color: col.isToday ? "#f97316" : "#e2e8f0",
                textAlign: "center",
                lineHeight: `${DAY_LETTER_ROW_H}px`,
              }}
              title={col.iso}
            >
              {col.dayOfWeekLetter}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          height: DAY_NUM_ROW_H,
          position: "sticky",
          top: MONTH_ROW_H + DAY_LETTER_ROW_H,
          zIndex: 3,
          background: "#111827",
        }}
      >
        <div
          style={{
            width: VACATION_STICKY_NAME_W,
            minWidth: VACATION_STICKY_NAME_W,
            position: "sticky",
            left: 0,
            zIndex: 6,
            background: "#111827",
            borderRight: cellBorder,
            borderBottom: cellBorder,
          }}
        />
        <div style={{ display: "flex" }}>
          {columns.map((col) => (
            <div
              key={col.iso}
              style={{
                width: dayColumnWidth(col),
                minWidth: dayColumnWidth(col),
                borderRight: cellBorder,
                borderBottom: cellBorder,
                fontSize: 9,
                padding: "2px 2px",
                textAlign: "center",
                color: col.isToday ? "#f97316" : "var(--muted, #94a3b8)",
                fontWeight: col.isToday ? 700 : 400,
                lineHeight: `${DAY_NUM_ROW_H - 4}px`,
                overflow: "hidden",
              }}
              title={col.iso}
            >
              {col.dayOfMonth}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
