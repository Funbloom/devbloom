"use client";

import type { ReactElement } from "react";
import type { PlanningDeliverable, PlanningMilestone } from "../types";
import { RISK_LABELS, STATUS_LABELS } from "./planningColors";

type Props = {
  milestone: PlanningMilestone | null;
  deliverables: PlanningDeliverable[];
};

export function DeliverablesPanel({ milestone, deliverables }: Props): ReactElement {
  if (!milestone) {
    return (
      <div
        style={{
          marginTop: 12,
          padding: 12,
          border: "1px dashed #334155",
          borderRadius: 10,
          color: "var(--muted, #94a3b8)",
          fontSize: 13,
        }}
      >
        Select a milestone row to see deliverables.
      </div>
    );
  }

  const rows = deliverables
    .filter((d) => d.milestone_id === milestone.id)
    .sort((a, b) => a.order_index - b.order_index);

  return (
    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>
        Deliverables — {milestone.name}
      </h3>
      <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
        Status: {STATUS_LABELS[milestone.status]} · Risk: {RISK_LABELS[milestone.risk]} ·{" "}
        {milestone.duration_weeks} week(s)
      </div>
      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted, #94a3b8)" }}>
          No deliverables yet. Use Edit on the milestone to add some.
        </p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          {rows.map((d) => (
            <li key={d.id} style={{ fontSize: 13 }}>
              {d.title}{" "}
              <span style={{ color: "var(--muted, #94a3b8)" }}>({STATUS_LABELS[d.status]})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
