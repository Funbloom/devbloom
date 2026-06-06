"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import type {
  MilestoneRisk,
  MilestoneStatus,
  PlanningDeliverable,
  PlanningEvent,
  PlanningMilestone,
} from "../types";
import { RISK_LABELS, STATUS_LABELS } from "./planningColors";

type Props = {
  milestone: PlanningMilestone;
  deliverables: PlanningDeliverable[];
  events: PlanningEvent[];
  saving: boolean;
  onClose: () => void;
  onSaveMilestone: (patch: {
    name: string;
    duration_weeks: number;
    status: MilestoneStatus;
    risk: MilestoneRisk;
  }) => Promise<void>;
  onDeleteMilestone: () => Promise<void>;
  onAddDeliverable: (title: string, status: MilestoneStatus) => Promise<void>;
  onUpdateDeliverable: (id: string, patch: { title?: string; status?: MilestoneStatus }) => Promise<void>;
  onDeleteDeliverable: (id: string) => Promise<void>;
  onAddEvent: (name: string, weeksAfter: number) => Promise<void>;
  onUpdateEvent: (id: string, patch: { name?: string; weeks_after_milestone_start?: number }) => Promise<void>;
  onDeleteEvent: (id: string) => Promise<void>;
};

const inputStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#f1f5f9",
  width: "100%",
};

export function MilestoneEditModal({
  milestone,
  deliverables,
  events,
  saving,
  onClose,
  onSaveMilestone,
  onDeleteMilestone,
  onAddDeliverable,
  onUpdateDeliverable,
  onDeleteDeliverable,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
}: Props): ReactElement {
  const [name, setName] = useState(milestone.name);
  const [durationWeeks, setDurationWeeks] = useState(String(milestone.duration_weeks));
  const [status, setStatus] = useState<MilestoneStatus>(milestone.status);
  const [risk, setRisk] = useState<MilestoneRisk>(milestone.risk);
  const [newDeliverableTitle, setNewDeliverableTitle] = useState("");
  const [newEventName, setNewEventName] = useState("");
  const [newEventWeek, setNewEventWeek] = useState("0");

  useEffect(() => {
    setName(milestone.name);
    setDurationWeeks(String(milestone.duration_weeks));
    setStatus(milestone.status);
    setRisk(milestone.risk);
  }, [milestone]);

  const milestoneDeliverables = deliverables
    .filter((d) => d.milestone_id === milestone.id)
    .sort((a, b) => a.order_index - b.order_index);
  const milestoneEvents = events
    .filter((e) => e.milestone_id === milestone.id)
    .sort((a, b) => a.order_index - b.order_index);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleSave = async () => {
    const duration = Number(durationWeeks);
    if (!name.trim() || !Number.isFinite(duration) || duration < 1) {
      return;
    }
    await onSaveMilestone({
      name: name.trim(),
      duration_weeks: duration,
      status,
      risk,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="milestone-edit-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          maxHeight: "min(90vh, 800px)",
          overflow: "auto",
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: 12,
          padding: 16,
          display: "grid",
          gap: 14,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <h2 id="milestone-edit-title" style={{ margin: 0, fontSize: 18 }}>
            Edit milestone
          </h2>
          <button type="button" onClick={onClose} style={{ padding: "4px 10px" }}>
            Close
          </button>
        </div>

        <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </label>

        <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
          Duration (weeks)
          <input
            type="number"
            min={1}
            value={durationWeeks}
            onChange={(e) => setDurationWeeks(e.target.value)}
            style={inputStyle}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as MilestoneStatus)}
              style={inputStyle}
            >
              {(Object.keys(STATUS_LABELS) as MilestoneStatus[]).map((key) => (
                <option key={key} value={key}>
                  {STATUS_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
            Risk
            <select
              value={risk}
              onChange={(e) => setRisk(e.target.value as MilestoneRisk)}
              style={inputStyle}
            >
              {(Object.keys(RISK_LABELS) as MilestoneRisk[]).map((key) => (
                <option key={key} value={key}>
                  {RISK_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <section style={{ display: "grid", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Deliverables</h3>
          {milestoneDeliverables.map((d) => (
            <div key={d.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
              <input
                type="text"
                value={d.title}
                disabled={saving}
                onChange={(e) => void onUpdateDeliverable(d.id, { title: e.target.value })}
                style={inputStyle}
              />
              <select
                value={d.status}
                disabled={saving}
                onChange={(e) =>
                  void onUpdateDeliverable(d.id, { status: e.target.value as MilestoneStatus })
                }
                style={{ ...inputStyle, width: 130 }}
              >
                {(Object.keys(STATUS_LABELS) as MilestoneStatus[]).map((key) => (
                  <option key={key} value={key}>
                    {STATUS_LABELS[key]}
                  </option>
                ))}
              </select>
              <button type="button" disabled={saving} onClick={() => void onDeleteDeliverable(d.id)}>
                Remove
              </button>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <input
              type="text"
              placeholder="New deliverable"
              value={newDeliverableTitle}
              onChange={(e) => setNewDeliverableTitle(e.target.value)}
              style={inputStyle}
            />
            <button
              type="button"
              disabled={saving || !newDeliverableTitle.trim()}
              onClick={() => {
                const title = newDeliverableTitle.trim();
                if (!title) {
                  return;
                }
                void onAddDeliverable(title, "todo").then(() => setNewDeliverableTitle(""));
              }}
            >
              Add
            </button>
          </div>
        </section>

        <section style={{ display: "grid", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Events</h3>
          {milestoneEvents.map((ev) => (
            <div key={ev.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px auto", gap: 8 }}>
              <input
                type="text"
                value={ev.name}
                disabled={saving}
                onChange={(e) => void onUpdateEvent(ev.id, { name: e.target.value })}
                style={inputStyle}
              />
              <input
                type="number"
                min={0}
                max={Math.max(0, milestone.duration_weeks - 1)}
                value={ev.weeks_after_milestone_start}
                disabled={saving}
                onChange={(e) =>
                  void onUpdateEvent(ev.id, {
                    weeks_after_milestone_start: Number(e.target.value),
                  })
                }
                style={inputStyle}
                title="Weeks after milestone start"
              />
              <button type="button" disabled={saving} onClick={() => void onDeleteEvent(ev.id)}>
                Remove
              </button>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px auto", gap: 8 }}>
            <input
              type="text"
              placeholder="Event name"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              style={inputStyle}
            />
            <input
              type="number"
              min={0}
              max={Math.max(0, milestone.duration_weeks - 1)}
              value={newEventWeek}
              onChange={(e) => setNewEventWeek(e.target.value)}
              style={inputStyle}
            />
            <button
              type="button"
              disabled={saving || !newEventName.trim()}
              onClick={() => {
                const label = newEventName.trim();
                if (!label) {
                  return;
                }
                void onAddEvent(label, Number(newEventWeek) || 0).then(() => {
                  setNewEventName("");
                  setNewEventWeek("0");
                });
              }}
            >
              Add
            </button>
          </div>
        </section>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
          <button
            type="button"
            className="imagegen-delete-button"
            disabled={saving}
            style={{ marginTop: 0, opacity: saving ? 0.6 : 1 }}
            onClick={() => void onDeleteMilestone()}
          >
            Delete milestone
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="button" disabled={saving} onClick={() => void handleSave()}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
