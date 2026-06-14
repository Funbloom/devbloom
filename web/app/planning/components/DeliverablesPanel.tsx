"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import {
  formatPlanningDateDots,
  formatPlanningDateLong,
  joinObjectiveDeliverable,
  joinOwnersOrdered,
  resolveOwnersToEmployees,
  riskPillStyle,
  splitObjectiveDeliverable,
  statusPillStyle,
} from "../milestoneDetail";
import { isRichTextEmpty, normalizeRichTextHtml, sanitizeRichTextHtml } from "../richText";
import { OwnerEmployeePicker, OwnerEmployeePills } from "./OwnerEmployeePicker";
import { PlanningDateInput } from "./PlanningDateInput";
import { RichTextEditor } from "./RichTextEditor";
import {
  durationWeeksFromDeliveryDate,
  milestoneDeliveryDateIso,
} from "../planningTimeline";
import type {
  MilestoneRisk,
  MilestoneStatus,
  PlanningDeliverable,
  PlanningEmployee,
  PlanningEvent,
  PlanningMilestone,
} from "../types";
import { PlanningDeleteMilestoneConfirmDialog } from "./PlanningDeleteMilestoneConfirmDialog";
import { RISK_LABELS, STATUS_LABELS } from "./planningColors";

type Props = {
  milestone: PlanningMilestone | null;
  deliverables: PlanningDeliverable[];
  events: PlanningEvent[];
  employees: PlanningEmployee[];
  planStartDate: string;
  startWeek: number;
  disabled?: boolean;
  onMilestoneUpdated: (milestone: PlanningMilestone) => void;
  onDeliverableUpdated: (deliverable: PlanningDeliverable) => void;
  onDeliverableCreated: (deliverable: PlanningDeliverable) => void;
  onDeliverableDeleted: (deliverableId: string) => void;
  onEventCreated: (event: PlanningEvent) => void;
  onEventUpdated: (event: PlanningEvent) => void;
  onEventDeleted: (eventId: string) => void;
  onSaveMilestone: (
    milestoneId: string,
    patch: Partial<{
      name: string;
      duration_weeks: number;
      status: MilestoneStatus;
      risk: MilestoneRisk;
      goals: string[];
      notes: string;
    }>,
  ) => Promise<PlanningMilestone>;
  onSaveDeliverable: (
    deliverableId: string,
    patch: Partial<{
      title: string;
      status: MilestoneStatus;
      risk: MilestoneRisk;
      owner: string;
      due_date: string | null;
    }>,
  ) => Promise<PlanningDeliverable>;
  onCreateDeliverable: (milestoneId: string) => Promise<PlanningDeliverable>;
  onDeleteDeliverable: (deliverableId: string) => Promise<void>;
  onCreateEvent: (
    milestoneId: string,
    name: string,
    weeksAfterMilestoneStart: number,
  ) => Promise<PlanningEvent>;
  onSaveEvent: (
    eventId: string,
    patch: Partial<{ name: string; weeks_after_milestone_start: number }>,
  ) => Promise<PlanningEvent>;
  onDeleteEvent: (eventId: string) => Promise<void>;
  onDeleteMilestone: () => Promise<void>;
  canDeleteMilestone?: boolean;
  onError: (message: string) => void;
};

const panelStyle: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gap: 12,
  flex: "0 0 auto",
  border: "1px solid #334155",
  borderRadius: 10,
  padding: 14,
  background: "#0b1220",
};

const inputStyle: CSSProperties = {
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#f1f5f9",
  width: "100%",
  fontSize: 13,
  boxSizing: "border-box",
};

const selectStyle: CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  fontWeight: 600,
  color: "#cbd5e1",
  background: "#1e293b",
  borderBottom: "1px solid #334155",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  borderBottom: "1px solid #1e293b",
  verticalAlign: "top",
  lineHeight: 1.45,
};

const tdEditStyle: CSSProperties = {
  padding: "6px 8px",
  fontSize: 13,
  borderBottom: "1px solid #1e293b",
  verticalAlign: "top",
};

const pillBase: CSSProperties = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

const STATUS_OPTIONS: MilestoneStatus[] = ["todo", "in_progress", "ready", "completed"];
const RISK_OPTIONS: MilestoneRisk[] = ["on_track", "caution", "risk"];

function Pill({ label, style }: { label: string; style: CSSProperties }): ReactElement {
  return <span style={{ ...pillBase, ...style }}>{label}</span>;
}

function SectionEditButton({
  editing,
  disabled,
  onClick,
}: {
  editing: boolean;
  disabled: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      className={editing ? "imagegen-button-secondary" : "imagegen-button"}
      disabled={disabled}
      onClick={onClick}
    >
      {editing ? "Done" : "Edit"}
    </button>
  );
}

function MilestoneNotesReadView({ notes }: { notes: string }): ReactElement {
  const sanitized = sanitizeRichTextHtml(notes);
  if (isRichTextEmpty(sanitized)) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted, #94a3b8)" }}>No notes yet.</p>
    );
  }
  return (
    <div
      className="planning-rich-text-display"
      style={{ fontSize: 13, lineHeight: 1.5, color: "#e2e8f0" }}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

export function DeliverablesPanel({
  milestone,
  deliverables,
  events,
  employees,
  planStartDate,
  startWeek,
  disabled,
  onMilestoneUpdated,
  onDeliverableUpdated,
  onDeliverableCreated,
  onDeliverableDeleted,
  onSaveMilestone,
  onSaveDeliverable,
  onCreateDeliverable,
  onDeleteDeliverable,
  onEventCreated,
  onEventUpdated,
  onEventDeleted,
  onCreateEvent,
  onSaveEvent,
  onDeleteEvent,
  onDeleteMilestone,
  canDeleteMilestone = false,
  onError,
}: Props): ReactElement | null {
  const [busy, setBusy] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState(false);
  const [editingDeliverables, setEditingDeliverables] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [milestoneStatus, setMilestoneStatus] = useState<MilestoneStatus>("todo");
  const [milestoneRisk, setMilestoneRisk] = useState<MilestoneRisk>("on_track");
  const [goals, setGoals] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [newEventName, setNewEventName] = useState("");
  const [newEventWeek, setNewEventWeek] = useState("0");

  const rows = milestone
    ? deliverables
        .filter((d) => d.milestone_id === milestone.id)
        .sort((a, b) => a.order_index - b.order_index)
    : [];

  const milestoneEvents = milestone
    ? events
        .filter((event) => event.milestone_id === milestone.id)
        .sort((a, b) => a.order_index - b.order_index)
    : [];

  useEffect(() => {
    setEditingMilestone(false);
    setEditingDeliverables(false);
    setDeleteConfirmOpen(false);
    setDeleteError(null);
    setNewEventName("");
    setNewEventWeek("0");
  }, [milestone?.id]);

  useEffect(() => {
    if (!milestone) {
      return;
    }
    setName(milestone.name);
    setMilestoneStatus(milestone.status);
    setMilestoneRisk(milestone.risk);
    setGoals(milestone.goals ?? []);
    setNotes(milestone.notes ?? "");
    setDeliveryDate(
      milestoneDeliveryDateIso(planStartDate, startWeek, milestone.duration_weeks),
    );
  }, [milestone, planStartDate, startWeek]);

  const runSave = useCallback(
    async (action: () => Promise<void>) => {
      if (disabled || busy || !milestone) {
        return;
      }
      setBusy(true);
      try {
        await action();
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to save changes.");
      } finally {
        setBusy(false);
      }
    },
    [busy, disabled, milestone, onError],
  );

  const saveMilestonePatch = useCallback(
    async (
      patch: Partial<{
        name: string;
        duration_weeks: number;
        status: MilestoneStatus;
        risk: MilestoneRisk;
        goals: string[];
        notes: string;
      }>,
    ) => {
      if (!milestone) {
        return;
      }
      await runSave(async () => {
        const updated = await onSaveMilestone(milestone.id, patch);
        onMilestoneUpdated(updated);
      });
    },
    [milestone, onMilestoneUpdated, onSaveMilestone, runSave],
  );

  if (!milestone) {
    return null;
  }

  const handleNameBlur = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === milestone.name) {
      return;
    }
    void saveMilestonePatch({ name: trimmed });
  };

  const handleDeliveryDateCommit = (value: string) => {
    setDeliveryDate(value);
    if (!value) {
      return;
    }
    const durationWeeks = durationWeeksFromDeliveryDate(planStartDate, startWeek, value);
    if (durationWeeks === milestone.duration_weeks) {
      return;
    }
    void saveMilestonePatch({ duration_weeks: durationWeeks });
  };

  const handleMilestoneStatusChange = (value: MilestoneStatus) => {
    setMilestoneStatus(value);
    if (value === milestone.status) {
      return;
    }
    void saveMilestonePatch({ status: value });
  };

  const handleMilestoneRiskChange = (value: MilestoneRisk) => {
    setMilestoneRisk(value);
    if (value === milestone.risk) {
      return;
    }
    void saveMilestonePatch({ risk: value });
  };

  const persistGoals = (nextGoals: string[]) => {
    const cleaned = nextGoals.map((g) => g.trim()).filter((g) => g.length > 0);
    const current = (milestone.goals ?? []).join("\n");
    const next = cleaned.join("\n");
    if (current === next) {
      return;
    }
    void saveMilestonePatch({ goals: cleaned });
  };

  const handleGoalBlur = (index: number, value: string) => {
    const next = [...goals];
    next[index] = value;
    setGoals(next);
    persistGoals(next);
  };

  const handleAddGoal = () => {
    setGoals([...goals, ""]);
  };

  const handleRemoveGoal = (index: number) => {
    const next = goals.filter((_, i) => i !== index);
    setGoals(next);
    persistGoals(next);
  };

  const handleNotesBlur = (value: string) => {
    const normalized = normalizeRichTextHtml(value);
    const current = normalizeRichTextHtml(milestone.notes ?? "");
    if (normalized === current) {
      return;
    }
    void saveMilestonePatch({ notes: normalized });
  };

  const handleRowFieldSave = async (
    row: PlanningDeliverable,
    patch: Partial<{
      title: string;
      status: MilestoneStatus;
      risk: MilestoneRisk;
      owner: string;
      due_date: string | null;
    }>,
  ) => {
    await runSave(async () => {
      const updated = await onSaveDeliverable(row.id, patch);
      onDeliverableUpdated(updated);
    });
  };

  const handleAddRow = () => {
    void runSave(async () => {
      const created = await onCreateDeliverable(milestone.id);
      onDeliverableCreated(created);
    });
  };

  const handleDeleteRow = (deliverableId: string) => {
    void runSave(async () => {
      await onDeleteDeliverable(deliverableId);
      onDeliverableDeleted(deliverableId);
    });
  };

  const handleAddEvent = () => {
    const label = newEventName.trim();
    if (!label) {
      return;
    }
    const weeksAfter = Number(newEventWeek);
    const safeWeeks = Number.isFinite(weeksAfter) ? Math.max(0, weeksAfter) : 0;
    void runSave(async () => {
      const created = await onCreateEvent(milestone.id, label, safeWeeks);
      onEventCreated(created);
      setNewEventName("");
      setNewEventWeek("0");
    });
  };

  const handleEventFieldSave = async (
    event: PlanningEvent,
    patch: Partial<{ name: string; weeks_after_milestone_start: number }>,
  ) => {
    await runSave(async () => {
      const updated = await onSaveEvent(event.id, patch);
      onEventUpdated(updated);
    });
  };

  const handleDeleteEvent = (eventId: string) => {
    void runSave(async () => {
      await onDeleteEvent(eventId);
      onEventDeleted(eventId);
    });
  };

  const handleConfirmDeleteMilestone = () => {
    void runSave(async () => {
      setDeleteError(null);
      try {
        await onDeleteMilestone();
        setDeleteConfirmOpen(false);
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : "Failed to delete milestone.");
      }
    });
  };

  const deliveryIso = milestoneDeliveryDateIso(planStartDate, startWeek, milestone.duration_weeks);
  const milestoneGoals = milestone.goals ?? [];
  const maxEventWeek = Math.max(0, milestone.duration_weeks - 1);
  const sectionDisabled = disabled || busy;

  return (
    <div style={panelStyle}>
      {deleteConfirmOpen ? (
        <PlanningDeleteMilestoneConfirmDialog
          milestoneName={milestone.name}
          deliverableCount={rows.length}
          eventCount={milestoneEvents.length}
          saving={sectionDisabled}
          error={deleteError}
          onConfirm={handleConfirmDeleteMilestone}
          onCancel={() => {
            if (!sectionDisabled) {
              setDeleteConfirmOpen(false);
              setDeleteError(null);
            }
          }}
        />
      ) : null}

      <div style={sectionHeaderStyle}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#fb923c" }}>Milestone</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {canDeleteMilestone ? (
            <button
              type="button"
              className="imagegen-delete-button"
              disabled={sectionDisabled}
              style={{ marginTop: 0 }}
              onClick={() => {
                setDeleteError(null);
                setDeleteConfirmOpen(true);
              }}
            >
              Delete
            </button>
          ) : null}
          <SectionEditButton
            editing={editingMilestone}
            disabled={sectionDisabled}
            onClick={() => setEditingMilestone((prev) => !prev)}
          />
        </div>
      </div>

      {editingMilestone ? (
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <span>Name</span>
            <input
              type="text"
              value={name}
              disabled={sectionDisabled}
              style={inputStyle}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              <span>Delivery date</span>
              <PlanningDateInput
                value={deliveryDate}
                disabled={disabled}
                style={inputStyle}
                onCommit={handleDeliveryDateCommit}
              />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              <span>Status</span>
              <select
                value={milestoneStatus}
                disabled={sectionDisabled}
                style={selectStyle}
                onChange={(e) => handleMilestoneStatusChange(e.target.value as MilestoneStatus)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              <span>Risk</span>
              <select
                value={milestoneRisk}
                disabled={sectionDisabled}
                style={selectStyle}
                onChange={(e) => handleMilestoneRiskChange(e.target.value as MilestoneRisk)}
              >
                {RISK_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {RISK_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px, 1fr) minmax(260px, 1fr)",
              gap: 16,
              alignItems: "start",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>Goals</span>
                <button
                  type="button"
                  className="imagegen-button-secondary"
                  disabled={sectionDisabled}
                  onClick={handleAddGoal}
                >
                  Add goal
                </button>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {goals.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>No goals yet.</p>
                ) : (
                  goals.map((goal, index) => (
                    <div key={`goal-${index}`} style={{ display: "flex", gap: 6 }}>
                      <input
                        type="text"
                        value={goal}
                        disabled={sectionDisabled}
                        style={inputStyle}
                        onChange={(e) => {
                          const next = [...goals];
                          next[index] = e.target.value;
                          setGoals(next);
                        }}
                        onBlur={(e) => handleGoalBlur(index, e.target.value)}
                      />
                      <button
                        type="button"
                        className="imagegen-delete-button"
                        disabled={sectionDisabled}
                        onClick={() => handleRemoveGoal(index)}
                        aria-label="Remove goal"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div style={{ display: "grid", gap: 6, minHeight: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Notes</span>
              <RichTextEditor
                value={notes}
                disabled={sectionDisabled}
                minHeight={200}
                onChange={setNotes}
                onBlur={handleNotesBlur}
              />
            </div>
          </div>
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>Events</span>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {milestoneEvents.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>No events yet.</p>
              ) : (
                milestoneEvents.map((event) => (
                  <EventRowEditor
                    key={event.id}
                    event={event}
                    maxWeek={maxEventWeek}
                    disabled={sectionDisabled}
                    onSave={(patch) => void handleEventFieldSave(event, patch)}
                    onDelete={() => handleDeleteEvent(event.id)}
                  />
                ))
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 90px auto", gap: 8 }}>
                <input
                  type="text"
                  placeholder="Event name"
                  value={newEventName}
                  disabled={sectionDisabled}
                  style={inputStyle}
                  onChange={(e) => setNewEventName(e.target.value)}
                />
                <input
                  type="number"
                  min={0}
                  max={maxEventWeek}
                  value={newEventWeek}
                  disabled={sectionDisabled}
                  style={inputStyle}
                  title="Weeks after milestone start"
                  onChange={(e) => setNewEventWeek(e.target.value)}
                />
                <button
                  type="button"
                  className="imagegen-button-secondary"
                  disabled={sectionDisabled || !newEventName.trim()}
                  onClick={handleAddEvent}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fb923c" }}>Milestone: {milestone.name}</div>
          <div style={{ fontSize: 13, color: "#cbd5e1" }}>
            Delivery date: {formatPlanningDateDots(deliveryIso)}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px, 1fr) minmax(260px, 1fr)",
              gap: 16,
              alignItems: "start",
            }}
          >
            <div>
              {milestoneGoals.length > 0 ? (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Goals:</div>
                  <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4, fontSize: 13 }}>
                    {milestoneGoals.map((goal, index) => (
                      <li key={`${goal}-${index}`}>{goal}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: "var(--muted, #94a3b8)" }}>No goals yet.</p>
              )}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Notes</div>
              <MilestoneNotesReadView notes={milestone.notes ?? ""} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Events</div>
            {milestoneEvents.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted, #94a3b8)" }}>No events yet.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4, fontSize: 13 }}>
                {milestoneEvents.map((event) => (
                  <li key={event.id}>
                    {event.name} — week {event.weeks_after_milestone_start}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div style={{ ...sectionHeaderStyle, marginTop: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Deliverables</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {editingDeliverables ? (
            <button
              type="button"
              className="imagegen-button-secondary"
              disabled={sectionDisabled}
              onClick={handleAddRow}
            >
              Add row
            </button>
          ) : null}
          <SectionEditButton
            editing={editingDeliverables}
            disabled={sectionDisabled}
            onClick={() => setEditingDeliverables((prev) => !prev)}
          />
        </div>
      </div>

      {rows.length === 0 && !editingDeliverables ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted, #94a3b8)" }}>
          No deliverables yet. Click Edit to add some.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: editingDeliverables ? 900 : 760,
              border: "1px solid #334155",
            }}
          >
            <thead>
              <tr>
                <th style={thStyle}>Objective</th>
                <th style={thStyle}>Deliverable</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Risk</th>
                <th style={thStyle}>Owner</th>
                <th style={thStyle}>Due Date</th>
                {editingDeliverables ? <th style={{ ...thStyle, width: 48 }} /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={editingDeliverables ? 7 : 6}
                    style={{ ...tdEditStyle, color: "var(--muted, #94a3b8)" }}
                  >
                    No deliverables. Click Add row to create one.
                  </td>
                </tr>
              ) : editingDeliverables ? (
                rows.map((row) => (
                  <DeliverableRowEditor
                    key={row.id}
                    row={row}
                    employees={employees}
                    disabled={sectionDisabled}
                    dateInputDisabled={disabled ?? false}
                    onSave={(patch) => void handleRowFieldSave(row, patch)}
                    onDelete={() => handleDeleteRow(row.id)}
                  />
                ))
              ) : (
                rows.map((row) => {
                  const parts = splitObjectiveDeliverable(row.title);
                  const rowRisk = row.risk ?? milestone.risk;
                  return (
                    <tr key={row.id}>
                      <td style={{ ...tdStyle, minWidth: 160 }}>{parts.objective || "—"}</td>
                      <td style={{ ...tdStyle, minWidth: 200 }}>{parts.deliverable || "—"}</td>
                      <td style={tdStyle}>
                        <Pill label={STATUS_LABELS[row.status]} style={statusPillStyle(row.status)} />
                      </td>
                      <td style={tdStyle}>
                        <Pill label={RISK_LABELS[rowRisk]} style={riskPillStyle(rowRisk)} />
                      </td>
                      <td style={tdStyle}>
                        <OwnerEmployeePills
                          owners={resolveOwnersToEmployees(row.owner, employees)}
                          employees={employees}
                        />
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        {formatPlanningDateLong(row.due_date)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type EventRowEditorProps = {
  event: PlanningEvent;
  maxWeek: number;
  disabled: boolean;
  onSave: (patch: Partial<{ name: string; weeks_after_milestone_start: number }>) => void;
  onDelete: () => void;
};

function EventRowEditor({
  event,
  maxWeek,
  disabled,
  onSave,
  onDelete,
}: EventRowEditorProps): ReactElement {
  const [eventName, setEventName] = useState(event.name);
  const [eventWeek, setEventWeek] = useState(String(event.weeks_after_milestone_start));

  useEffect(() => {
    setEventName(event.name);
    setEventWeek(String(event.weeks_after_milestone_start));
  }, [event]);

  const saveName = () => {
    const trimmed = eventName.trim();
    if (!trimmed || trimmed === event.name) {
      return;
    }
    onSave({ name: trimmed });
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 90px auto", gap: 8 }}>
      <input
        type="text"
        value={eventName}
        disabled={disabled}
        style={inputStyle}
        onChange={(e) => setEventName(e.target.value)}
        onBlur={saveName}
      />
      <input
        type="number"
        min={0}
        max={maxWeek}
        value={eventWeek}
        disabled={disabled}
        style={inputStyle}
        title="Weeks after milestone start"
        onChange={(e) => {
          const value = e.target.value;
          setEventWeek(value);
          const parsed = Number(value);
          if (!Number.isFinite(parsed)) {
            return;
          }
          const safeWeek = Math.min(maxWeek, Math.max(0, parsed));
          if (safeWeek !== event.weeks_after_milestone_start) {
            onSave({ weeks_after_milestone_start: safeWeek });
          }
        }}
      />
      <button
        type="button"
        className="imagegen-delete-button"
        disabled={disabled}
        onClick={onDelete}
        aria-label="Remove event"
      >
        ×
      </button>
    </div>
  );
}

type RowEditorProps = {
  row: PlanningDeliverable;
  employees: PlanningEmployee[];
  disabled: boolean;
  dateInputDisabled: boolean;
  onSave: (
    patch: Partial<{
      title: string;
      status: MilestoneStatus;
      risk: MilestoneRisk;
      owner: string;
      due_date: string | null;
    }>,
  ) => void;
  onDelete: () => void;
};

function DeliverableRowEditor({
  row,
  employees,
  disabled,
  dateInputDisabled,
  onSave,
  onDelete,
}: RowEditorProps): ReactElement {
  const parts = splitObjectiveDeliverable(row.title);
  const [objective, setObjective] = useState(parts.objective);
  const [deliverable, setDeliverable] = useState(parts.deliverable);
  const [status, setStatus] = useState<MilestoneStatus>(row.status);
  const [risk, setRisk] = useState<MilestoneRisk>(row.risk ?? "on_track");
  const [owner, setOwner] = useState(
    joinOwnersOrdered(resolveOwnersToEmployees(row.owner, employees), employees),
  );
  const [dueDate, setDueDate] = useState(row.due_date ?? "");

  useEffect(() => {
    const nextParts = splitObjectiveDeliverable(row.title);
    setObjective(nextParts.objective);
    setDeliverable(nextParts.deliverable);
    setStatus(row.status);
    setRisk(row.risk ?? "on_track");
    setOwner(joinOwnersOrdered(resolveOwnersToEmployees(row.owner, employees), employees));
    setDueDate(row.due_date ?? "");
  }, [row, employees]);

  const saveTitle = () => {
    const nextTitle = joinObjectiveDeliverable(objective, deliverable);
    if (nextTitle === row.title) {
      return;
    }
    onSave({ title: nextTitle });
  };

  return (
    <tr>
      <td style={{ ...tdEditStyle, minWidth: 150 }}>
        <input
          type="text"
          value={objective}
          disabled={disabled}
          style={inputStyle}
          onChange={(e) => setObjective(e.target.value)}
          onBlur={saveTitle}
        />
      </td>
      <td style={{ ...tdEditStyle, minWidth: 180 }}>
        <input
          type="text"
          value={deliverable}
          disabled={disabled}
          style={inputStyle}
          onChange={(e) => setDeliverable(e.target.value)}
          onBlur={saveTitle}
        />
      </td>
      <td style={tdEditStyle}>
        <select
          value={status}
          disabled={disabled}
          style={selectStyle}
          onChange={(e) => {
            const value = e.target.value as MilestoneStatus;
            setStatus(value);
            if (value !== row.status) {
              onSave({ status: value });
            }
          }}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {STATUS_LABELS[option]}
            </option>
          ))}
        </select>
      </td>
      <td style={tdEditStyle}>
        <select
          value={risk}
          disabled={disabled}
          style={selectStyle}
          onChange={(e) => {
            const value = e.target.value as MilestoneRisk;
            setRisk(value);
            if (value !== (row.risk ?? "on_track")) {
              onSave({ risk: value });
            }
          }}
        >
          {RISK_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {RISK_LABELS[option]}
            </option>
          ))}
        </select>
      </td>
      <td style={{ ...tdEditStyle, minWidth: 180 }}>
        <OwnerEmployeePicker
          employees={employees}
          value={owner}
          disabled={disabled}
          onChange={(nextOwner) => {
            setOwner(nextOwner);
            const current = joinOwnersOrdered(resolveOwnersToEmployees(row.owner, employees), employees);
            if (nextOwner === current) {
              return;
            }
            onSave({ owner: nextOwner });
          }}
        />
      </td>
      <td style={tdEditStyle}>
        <PlanningDateInput
          value={dueDate}
          disabled={dateInputDisabled}
          style={inputStyle}
          onCommit={(value) => {
            setDueDate(value);
            const current = row.due_date ?? "";
            if (value !== current) {
              onSave({ due_date: value || null });
            }
          }}
        />
      </td>
      <td style={tdEditStyle}>
        <button
          type="button"
          className="imagegen-delete-button"
          disabled={disabled}
          onClick={onDelete}
          aria-label="Delete row"
        >
          ×
        </button>
      </td>
    </tr>
  );
}
