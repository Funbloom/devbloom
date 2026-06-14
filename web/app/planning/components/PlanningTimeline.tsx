"use client";

import { useEffect, useMemo } from "react";
import type { ReactElement } from "react";
import type { MonthZoom } from "../monthZoom";
import {
  buildWeekColumns,
  computeMilestoneStartWeeks,
  defaultPlanningScrollLeftPx,
  monthSpans,
  PLANNING_WEEKS_MAX,
  todayLineLeftPx,
  weekColumnOffsets,
  weekRangeWidthPx,
  weekTimelineWidthPx,
} from "../planningTimeline";
import { useTimelineViewportWidth } from "../useTimelineViewportWidth";
import type { PlanningEvent, PlanningMilestone } from "../types";
import {
  PLANNING_STICKY_LEFT_W,
  PLANNING_STICKY_NAME_W,
  PLANNING_STICKY_RISK_W,
  PLANNING_STICKY_STATUS_W,
  PlanningTimelineHeader,
} from "./PlanningTimelineHeader";
import { PlanningTimelineWeekGrid } from "./PlanningTimelineWeekGrid";
import { RISK_LABELS, riskCellStyle, STATUS_LABELS, statusBarColor } from "./planningColors";

const ROW_H = 56;
const BAR_H = 36;

type Props = {
  startDate: string;
  milestones: PlanningMilestone[];
  events: PlanningEvent[];
  selectedMilestoneId: string | null;
  saving: boolean;
  onSelectMilestone: (id: string | null) => void;
  onAddMilestone: () => void;
  monthZoom: MonthZoom;
  compact?: boolean;
};

export function PlanningTimeline({
  startDate,
  milestones,
  events,
  selectedMilestoneId,
  saving,
  onSelectMilestone,
  onAddMilestone,
  monthZoom,
  compact = false,
}: Props): ReactElement {
  const { scrollRef, viewportWidth } = useTimelineViewportWidth();

  const columns = useMemo(
    () =>
      buildWeekColumns(
        startDate,
        PLANNING_WEEKS_MAX,
        monthZoom,
        viewportWidth,
        PLANNING_STICKY_LEFT_W,
      ),
    [startDate, monthZoom, viewportWidth],
  );
  const weekOffsets = useMemo(() => weekColumnOffsets(columns), [columns]);
  const startWeeks = computeMilestoneStartWeeks(milestones);
  const ordered = [...milestones].sort((a, b) => a.order_index - b.order_index);
  const monthGroups = useMemo(() => monthSpans(columns), [columns]);
  const timelineWidth = weekTimelineWidthPx(columns);

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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        flex: compact ? "0 0 auto" : 1,
      }}
    >
      <div
        ref={scrollRef}
        style={{
          overflowX: "auto",
          overflowY: "auto",
          flex: compact ? "0 0 auto" : 1,
          maxHeight: compact ? 300 : undefined,
          border: cellBorder,
          borderRadius: 10,
        }}
      >
        <div style={{ minWidth: PLANNING_STICKY_LEFT_W + timelineWidth, position: "relative" }}>
          <PlanningTimelineHeader
            stickyColumns={[
              { label: "Milestone", width: PLANNING_STICKY_NAME_W },
              { label: "Status", width: PLANNING_STICKY_STATUS_W },
              { label: "Risk", width: PLANNING_STICKY_RISK_W },
            ]}
            columns={columns}
            monthGroups={monthGroups}
            timelineWidth={timelineWidth}
            todayLineLeft={todayLineLeft}
          />

          {ordered.map((milestone) => {
            const startWeek = startWeeks.get(milestone.id) ?? 0;
            const duration = Math.max(1, milestone.duration_weeks);
            const isSelected = selectedMilestoneId === milestone.id;
            const milestoneEvents = events.filter((e) => e.milestone_id === milestone.id);

            return (
              <div
                key={milestone.id}
                style={{
                  display: "flex",
                  height: ROW_H,
                  borderTop: cellBorder,
                  background: isSelected ? "rgba(59,130,246,0.08)" : "transparent",
                  cursor: "pointer",
                }}
                onClick={() => onSelectMilestone(isSelected ? null : milestone.id)}
              >
                <div
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 3,
                    display: "flex",
                    background: isSelected ? "#0f1a2e" : "#0b1220",
                    borderRight: cellBorder,
                  }}
                >
                  <div
                    style={{
                      width: PLANNING_STICKY_NAME_W,
                      padding: "4px 8px",
                      borderRight: cellBorder,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      gap: 2,
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        lineHeight: 1.35,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        wordBreak: "break-word",
                      }}
                    >
                      {milestone.name}
                    </span>
                  </div>
                  <div
                    style={{
                      width: PLANNING_STICKY_STATUS_W,
                      padding: "4px 8px",
                      borderRight: cellBorder,
                      fontSize: 11,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {STATUS_LABELS[milestone.status]}
                  </div>
                  <div
                    style={{
                      width: PLANNING_STICKY_RISK_W,
                      padding: "4px 8px",
                      fontSize: 11,
                      display: "flex",
                      alignItems: "center",
                      ...riskCellStyle(milestone.risk),
                    }}
                  >
                    {RISK_LABELS[milestone.risk]}
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
                  <div
                    style={{
                      position: "absolute",
                      top: (ROW_H - BAR_H) / 2,
                      left: (weekOffsets[startWeek] ?? 0) + 2,
                      zIndex: 1,
                      width: weekRangeWidthPx(columns, startWeek, duration) - 4,
                      height: BAR_H,
                      borderRadius: 6,
                      background: statusBarColor(milestone.status),
                      opacity: 0.92,
                    }}
                    title={`${milestone.name} (${duration}w)`}
                  />
                  {milestoneEvents.map((ev) => {
                    const week = startWeek + ev.weeks_after_milestone_start;
                    if (week < 0 || week >= PLANNING_WEEKS_MAX) {
                      return null;
                    }
                    return (
                      <div
                        key={ev.id}
                        title={ev.name}
                        style={{
                          position: "absolute",
                          top: (ROW_H - 8) / 2,
                          left: (weekOffsets[week] ?? 0) + (columns[week]?.weekWidthPx ?? 0) / 2 - 4,
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "#f8fafc",
                          border: "2px solid #0f172a",
                          zIndex: 2,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div style={{ display: "flex", height: ROW_H, borderTop: cellBorder }}>
            <div
              style={{
                position: "sticky",
                left: 0,
                zIndex: 3,
                width: PLANNING_STICKY_LEFT_W,
                padding: "8px 10px",
                background: "#0b1220",
                borderRight: cellBorder,
                display: "flex",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                disabled={saving}
                onClick={onAddMilestone}
                style={{
                  fontSize: 13,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid #475569",
                  background: "#1e293b",
                  color: "#f1f5f9",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                Add milestone
              </button>
            </div>
            <div style={{ position: "relative", width: timelineWidth, height: ROW_H }}>
              <PlanningTimelineWeekGrid
                columns={columns}
                height={ROW_H}
                cellBorder={cellBorder}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
