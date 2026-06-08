"use client";

import { useEffect, useMemo } from "react";
import type { ReactElement } from "react";
import type { MonthZoom } from "../monthZoom";
import {
  buildGlobalProjectRows,
  resolveGlobalPlanningRange,
} from "../globalPlanningView";
import {
  buildCalendarWeekColumns,
  calendarRangeMonthKeys,
  defaultPlanningScrollLeftPx,
  monthSpans,
  todayLineLeftPx,
  weekColumnOffsets,
  weekTimelineWidthPx,
} from "../planningTimeline";
import { useTimelineViewportWidth } from "../useTimelineViewportWidth";
import type { GlobalPlanningProject } from "../types";
import {
  PLANNING_STICKY_LEFT_W,
  PLANNING_STICKY_NAME_W,
  PLANNING_STICKY_RISK_W,
  PLANNING_STICKY_STATUS_W,
  PlanningTimelineHeader,
} from "./PlanningTimelineHeader";
import { PlanningTimelineWeekGrid } from "./PlanningTimelineWeekGrid";
import { RISK_LABELS, riskBarColor, riskCellStyle, STATUS_LABELS } from "./planningColors";

const ROW_H = 66;
const BAR_H = 34;

type Props = {
  projects: GlobalPlanningProject[];
  enabledKeys: Set<string>;
  monthZoom: MonthZoom;
};

export function GlobalPlanningTimeline({
  projects,
  enabledKeys,
  monthZoom,
}: Props): ReactElement {
  const { scrollRef, viewportWidth } = useTimelineViewportWidth();

  const range = useMemo(
    () => resolveGlobalPlanningRange(projects, enabledKeys),
    [projects, enabledKeys],
  );

  const columns = useMemo(
    () =>
      buildCalendarWeekColumns(
        range.fromIso,
        range.toIso,
        monthZoom,
        viewportWidth,
        PLANNING_STICKY_LEFT_W,
      ),
    [range.fromIso, range.toIso, monthZoom, viewportWidth],
  );

  const weekOffsets = useMemo(() => weekColumnOffsets(columns), [columns]);
  const monthGroups = useMemo(() => monthSpans(columns), [columns]);
  const timelineWidth = weekTimelineWidthPx(columns);
  const rows = useMemo(
    () => buildGlobalProjectRows(projects, enabledKeys, columns),
    [projects, enabledKeys, columns],
  );

  const todayLineLeft = useMemo(
    () => todayLineLeftPx(columns, weekOffsets, PLANNING_STICKY_LEFT_W),
    [columns, weekOffsets],
  );

  const cellBorder = "1px solid #2a2f3a";

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || viewportWidth <= 0) {
      return;
    }
    element.scrollLeft = defaultPlanningScrollLeftPx(
      columns,
      PLANNING_STICKY_LEFT_W,
      viewportWidth,
    );
  }, [columns, scrollRef, viewportWidth]);

  if (rows.length === 0) {
    return (
      <p style={{ margin: 0, color: "var(--muted, #94a3b8)", fontSize: 13 }}>
        Enable one or more projects with planning data to see the global timeline.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div
        ref={scrollRef}
        style={{
          overflowX: "auto",
          overflowY: "auto",
          flex: 1,
          border: cellBorder,
          borderRadius: 10,
        }}
      >
        <div style={{ minWidth: PLANNING_STICKY_LEFT_W + timelineWidth, position: "relative" }}>
          <PlanningTimelineHeader
            stickyColumns={[
              { label: "Project", width: PLANNING_STICKY_NAME_W },
              { label: "Status", width: PLANNING_STICKY_STATUS_W },
              { label: "Risk", width: PLANNING_STICKY_RISK_W },
            ]}
            columns={columns}
            monthGroups={monthGroups}
            timelineWidth={timelineWidth}
            todayLineLeft={todayLineLeft}
          />

          {rows.map((row) => (
            <div
              key={row.projectKey}
              style={{
                display: "flex",
                height: ROW_H,
                borderTop: cellBorder,
              }}
            >
              <div
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 3,
                  display: "flex",
                  background: "#0b1220",
                  borderRight: cellBorder,
                }}
              >
                <div
                  style={{
                    width: PLANNING_STICKY_NAME_W,
                    padding: "6px 8px",
                    borderRight: cellBorder,
                    display: "flex",
                    alignItems: "center",
                    fontSize: 12,
                    fontWeight: 600,
                    lineHeight: 1.35,
                    wordBreak: "break-word",
                  }}
                >
                  {row.displayName}
                </div>
                <div
                  style={{
                    width: PLANNING_STICKY_STATUS_W,
                    padding: "6px 8px",
                    borderRight: cellBorder,
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {STATUS_LABELS[row.status]}
                </div>
                <div
                  style={{
                    width: PLANNING_STICKY_RISK_W,
                    padding: "6px 8px",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    ...riskCellStyle(row.risk),
                  }}
                >
                  {RISK_LABELS[row.risk]}
                </div>
              </div>

              <div
                style={{
                  position: "relative",
                  width: timelineWidth,
                  height: ROW_H,
                }}
              >
                <PlanningTimelineWeekGrid
                  columns={columns}
                  height={ROW_H}
                  cellBorder={cellBorder}
                />
                {row.bars.map((bar) => (
                  <div
                    key={bar.milestoneId}
                    title={bar.title}
                    style={{
                      position: "absolute",
                      top: (ROW_H - BAR_H) / 2,
                      left: bar.leftPx,
                      zIndex: 1,
                      width: bar.widthPx,
                      height: BAR_H,
                      borderRadius: 6,
                      background: riskBarColor(bar.risk),
                      opacity: 0.92,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      padding: "0 4px",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#0f172a",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {bar.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function globalPlanningMaxExpandedMonths(
  projects: GlobalPlanningProject[],
  enabledKeys: Set<string>,
): number {
  const range = resolveGlobalPlanningRange(projects, enabledKeys);
  return calendarRangeMonthKeys(range.fromIso, range.toIso).length;
}
