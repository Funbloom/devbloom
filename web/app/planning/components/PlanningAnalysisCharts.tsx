"use client";

import { useMemo } from "react";
import type { ReactElement } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type {
  DeliverableAnalysisRow,
  OwnerWorkloadRow,
  PlanningAnalysisResult,
} from "../planningAnalysis";
import { severityColor } from "../planningAnalysis";
import { formatPlanningDateLong } from "../milestoneDetail";

type Props = {
  result: PlanningAnalysisResult;
  onDeliverableSelect?: (deliverableId: string, milestoneId: string) => void;
};

type OwnerChartRow = {
  owner: string;
  openCount: number;
  density: number;
  weeksLeft: number;
  effectiveWeeksLeft: number;
  vacationDays: number;
  awayDays: number;
  holidayDays: number;
  nearestDue: string;
  severity: string;
  fill: string;
};

type UrgencyChartRow = {
  deliverableId: string;
  milestoneId: string;
  label: string;
  daysUntilDue: number;
  milestoneName: string;
  severity: string;
  fill: string;
};

function OwnerTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: OwnerChartRow }>;
}): ReactElement | null {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const row = payload[0].payload;
  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #334155",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 12,
        color: "#e2e8f0",
      }}
    >
      <div style={{ fontWeight: 600 }}>{row.owner}</div>
      <div>{row.openCount} open items</div>
      <div>{row.density.toFixed(1)} items/week (effective)</div>
      <div>{row.effectiveWeeksLeft.toFixed(1)} effective weeks left</div>
      {row.vacationDays + row.awayDays + row.holidayDays > 0 ? (
        <div>
          Unavailable: {row.vacationDays} vacation, {row.awayDays} away, {row.holidayDays} holiday
        </div>
      ) : null}
      <div>Nearest due: {row.nearestDue}</div>
    </div>
  );
}

function UrgencyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: UrgencyChartRow }>;
}): ReactElement | null {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const row = payload[0].payload;
  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #334155",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 12,
        color: "#e2e8f0",
        maxWidth: 260,
      }}
    >
      <div style={{ fontWeight: 600 }}>{row.label}</div>
      <div>{row.milestoneName}</div>
      <div>
        {row.daysUntilDue < 0
          ? `${Math.abs(row.daysUntilDue)} days overdue`
          : `${row.daysUntilDue} days until due`}
      </div>
    </div>
  );
}

function buildOwnerRows(owners: OwnerWorkloadRow[]): OwnerChartRow[] {
  return owners.map((owner) => ({
    owner: owner.ownerLabel,
    openCount: owner.openCount,
    density: owner.density,
    weeksLeft: owner.weeksLeft,
    effectiveWeeksLeft: owner.effectiveWeeksLeft,
    vacationDays: owner.vacationDays,
    awayDays: owner.awayDays,
    holidayDays: owner.holidayDays,
    nearestDue: owner.nearestDueIso ? formatPlanningDateLong(owner.nearestDueIso) : "—",
    severity: owner.severity,
    fill: severityColor(owner.severity),
  }));
}

function buildUrgencyRows(deliverables: DeliverableAnalysisRow[]): UrgencyChartRow[] {
  return deliverables
    .filter((row) => row.daysUntilDue !== null && row.computedSeverity !== "on_track")
    .map((row) => ({
      deliverableId: row.deliverableId,
      milestoneId: row.milestoneId,
      label: row.title,
      daysUntilDue: row.daysUntilDue ?? 0,
      milestoneName: row.milestoneName,
      severity: row.computedSeverity,
      fill: severityColor(row.computedSeverity),
    }));
}

export function PlanningAnalysisCharts({
  result,
  onDeliverableSelect,
}: Props): ReactElement {
  const ownerRows = useMemo(() => buildOwnerRows(result.owners), [result.owners]);
  const urgencyRows = useMemo(
    () => buildUrgencyRows(result.deliverables),
    [result.deliverables],
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Owner workload</h3>
        {ownerRows.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>No open deliverables assigned.</p>
        ) : (
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={ownerRows} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis
                  dataKey="owner"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={50}
                />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<OwnerTooltip />} />
                <Bar dataKey="openCount" radius={[4, 4, 0, 0]}>
                  {ownerRows.map((row) => (
                    <Cell key={row.owner} fill={row.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div>
        <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Deliverable urgency</h3>
        {urgencyRows.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>No at-risk deliverables on the timeline.</p>
        ) : (
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="daysUntilDue"
                  name="Days until due"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  label={{
                    value: "Days until due (negative = overdue)",
                    position: "insideBottom",
                    offset: -4,
                    fill: "#64748b",
                    fontSize: 11,
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="milestoneName"
                  name="Milestone"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  width={100}
                />
                <ZAxis range={[80, 80]} />
                <Tooltip content={<UrgencyTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                <Scatter
                  data={urgencyRows}
                  onClick={(point) => {
                    const row = point as UrgencyChartRow;
                    if (onDeliverableSelect) {
                      onDeliverableSelect(row.deliverableId, row.milestoneId);
                    }
                  }}
                  style={{ cursor: onDeliverableSelect ? "pointer" : "default" }}
                >
                  {urgencyRows.map((row) => (
                    <Cell key={row.deliverableId} fill={row.fill} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
