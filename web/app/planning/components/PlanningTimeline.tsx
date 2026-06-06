"use client";

import { useMemo } from "react";
import type { ReactElement } from "react";
import type { MonthZoom } from "../monthZoom";
import {
  buildWeekColumns,
  computeMilestoneStartWeeks,
  currentPlanWeekIndex,
  PLANNING_WEEKS_MAX,
  weekColumnOffsets,
  weekRangeWidthPx,
  weekTimelineWidthPx,
} from "../planningTimeline";
import type { PlanningEvent, PlanningMilestone } from "../types";
import { RISK_LABELS, riskCellStyle, STATUS_LABELS, statusBarColor } from "./planningColors";

const STICKY_NAME_W = 200;
const STICKY_STATUS_W = 110;
const STICKY_RISK_W = 100;
const STICKY_LEFT_W = STICKY_NAME_W + STICKY_STATUS_W + STICKY_RISK_W;
const ROW_H = 68;
const BAR_H = 28;
const HEADER_H = 52;

type Props = {
  startDate: string;
  milestones: PlanningMilestone[];
  events: PlanningEvent[];
  selectedMilestoneId: string | null;
  saving: boolean;
  onSelectMilestone: (id: string) => void;
  onEditMilestone: (milestone: PlanningMilestone) => void;
  onAddMilestone: () => void;
  monthZoom: MonthZoom;
};

function monthSpans(
  columns: ReturnType<typeof buildWeekColumns>,
): Array<{ label: string; widthPx: number }> {
  const spans: Array<{ label: string; widthPx: number }> = [];
  for (const col of columns) {
    const last = spans[spans.length - 1];
    if (last && last.label === col.month_label) {
      last.widthPx += col.weekWidthPx;
    } else {
      spans.push({ label: col.month_label, widthPx: col.weekWidthPx });
    }
  }
  return spans;
}

export function PlanningTimeline({
  startDate,
  milestones,
  events,
  selectedMilestoneId,
  saving,
  onSelectMilestone,
  onEditMilestone,
  onAddMilestone,
  monthZoom,
}: Props): ReactElement {
  const columns = useMemo(
    () => buildWeekColumns(startDate, PLANNING_WEEKS_MAX, monthZoom),
    [startDate, monthZoom],
  );
  const weekOffsets = useMemo(() => weekColumnOffsets(columns), [columns]);
  const startWeeks = computeMilestoneStartWeeks(milestones);
  const ordered = [...milestones].sort((a, b) => a.order_index - b.order_index);
  const currentWeek = currentPlanWeekIndex(startDate);
  const monthGroups = monthSpans(columns);
  const timelineWidth = weekTimelineWidthPx(columns);

  const cellBorder = "1px solid #2a2f3a";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div style={{ overflowX: "auto", overflowY: "auto", flex: 1, border: cellBorder, borderRadius: 10 }}>
        <div style={{ minWidth: STICKY_LEFT_W + timelineWidth, position: "relative" }}>
          {currentWeek !== null && currentWeek >= 0 && currentWeek < PLANNING_WEEKS_MAX && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left:
                  STICKY_LEFT_W +
                  (weekOffsets[currentWeek] ?? 0) +
                  (columns[currentWeek]?.weekWidthPx ?? 0) / 2,
                width: 2,
                background: "#f97316",
                zIndex: 5,
                pointerEvents: "none",
              }}
            />
          )}

          <div style={{ display: "flex", height: HEADER_H, background: "#111827" }}>
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
              <div
                style={{
                  width: STICKY_NAME_W,
                  padding: "8px 10px",
                  fontWeight: 600,
                  fontSize: 12,
                  borderRight: cellBorder,
                  display: "flex",
                  alignItems: "flex-end",
                }}
              >
                Milestone
              </div>
              <div
                style={{
                  width: STICKY_STATUS_W,
                  padding: "8px 8px",
                  fontWeight: 600,
                  fontSize: 12,
                  borderRight: cellBorder,
                  display: "flex",
                  alignItems: "flex-end",
                }}
              >
                Status
              </div>
              <div
                style={{
                  width: STICKY_RISK_W,
                  padding: "8px 8px",
                  fontWeight: 600,
                  fontSize: 12,
                  display: "flex",
                  alignItems: "flex-end",
                }}
              >
                Risk
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", width: timelineWidth }}>
              <div style={{ display: "flex", height: HEADER_H / 2 }}>
                {monthGroups.map((group, idx) => (
                  <div
                    key={`${group.label}-${idx}`}
                    style={{
                      width: group.widthPx,
                      borderRight: cellBorder,
                      borderBottom: cellBorder,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "4px 6px",
                      textAlign: "center",
                    }}
                  >
                    {group.label}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", height: HEADER_H / 2 }}>
                {columns.map((col) => (
                  <div
                    key={col.week_index}
                    style={{
                      width: col.weekWidthPx,
                      minWidth: col.weekWidthPx,
                      borderRight: cellBorder,
                      fontSize: 9,
                      padding: "2px 2px",
                      textAlign: "center",
                      color: "var(--muted, #94a3b8)",
                      overflow: "hidden",
                    }}
                    title={`Week ${col.week_index + 1}`}
                  >
                    {col.range_label}
                  </div>
                ))}
              </div>
            </div>
          </div>

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
                onClick={() => onSelectMilestone(milestone.id)}
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
                      width: STICKY_NAME_W,
                      padding: "6px 8px",
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
                    <button
                      type="button"
                      style={{
                        alignSelf: "flex-start",
                        fontSize: 11,
                        padding: "2px 6px",
                        borderRadius: 6,
                        border: "1px solid #475569",
                        background: "#1e293b",
                        color: "#e2e8f0",
                        cursor: "pointer",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditMilestone(milestone);
                      }}
                    >
                      Edit
                    </button>
                  </div>
                  <div
                    style={{
                      width: STICKY_STATUS_W,
                      padding: "6px 8px",
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
                      width: STICKY_RISK_W,
                      padding: "6px 8px",
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
                  <div
                    style={{
                      position: "absolute",
                      top: (ROW_H - BAR_H) / 2,
                      left: (weekOffsets[startWeek] ?? 0) + 2,
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
                width: STICKY_LEFT_W,
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
            <div style={{ width: timelineWidth }} />
          </div>
        </div>
      </div>
    </div>
  );
}
