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
import { OwnerEmployeePicker, OwnerEmployeePills } from "./OwnerEmployeePicker";
import {
  durationWeeksFromDeliveryDate,
  milestoneDeliveryDateIso,
} from "../planningTimeline";
import type {
  MilestoneRisk,
  MilestoneStatus,
  PlanningDeliverable,
  PlanningEmployee,
  PlanningMilestone,
} from "../types";
import { RISK_LABELS, STATUS_LABELS } from "./planningColors";

type Props = {
  milestone: PlanningMilestone | null;
  deliverables: PlanningDeliverable[];
  employees: PlanningEmployee[];
  planStartDate: string;
  startWeek: number;
  disabled?: boolean;
  onMilestoneUpdated: (milestone: PlanningMilestone) => void;
  onDeliverableUpdated: (deliverable: PlanningDeliverable) => void;
  onDeliverableCreated: (deliverable: PlanningDeliverable) => void;
  onDeliverableDeleted: (deliverableId: string) => void;
  onSaveMilestone: (
    milestoneId: string,
    patch: Partial<{
      name: string;
      duration_weeks: number;
      status: MilestoneStatus;
      risk: MilestoneRisk;
      goals: string[];
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

const STATUS_OPTIONS: MilestoneStatus[] = ["todo", "in_progress", "ready", "completed"];
const RISK_OPTIONS: MilestoneRisk[] = ["on_track", "caution", "risk"];

function Pill({ label, style }: { label: string; style: CSSProperties }): ReactElement {
  return <span style={{ ...pillBase, ...style }}>{label}</span>;
}

export function DeliverablesPanel({
  milestone,
  deliverables,
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
  onError,
}: Props): ReactElement {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [milestoneStatus, setMilestoneStatus] = useState<MilestoneStatus>("todo");
  const [milestoneRisk, setMilestoneRisk] = useState<MilestoneRisk>("on_track");
  const [goals, setGoals] = useState<string[]>([]);

  const rows = milestone
    ? deliverables
        .filter((d) => d.milestone_id === milestone.id)
        .sort((a, b) => a.order_index - b.order_index)
    : [];

  useEffect(() => {
    setEditing(false);
  }, [milestone?.id]);

  useEffect(() => {
    if (!milestone) {
      return;
    }
    setName(milestone.name);
    setMilestoneStatus(milestone.status);
    setMilestoneRisk(milestone.risk);
    setGoals(milestone.goals ?? []);
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
        Select a milestone row to see goals and deliverables.
      </div>
    );
  }

  const deliveryIso = milestoneDeliveryDateIso(
    planStartDate,
    startWeek,
    milestone.duration_weeks,
  );
  const milestoneGoals = milestone.goals ?? [];

  const headerActions = (
    <button
      type="button"
      className={editing ? "imagegen-button-secondary" : "imagegen-button"}
      disabled={disabled || busy}
      onClick={() => setEditing((prev) => !prev)}
    >
      {editing ? "Done" : "Edit"}
    </button>
  );

  if (!editing) {
    return (
      <div style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ display: "grid", gap: 8, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Milestone: {milestone.name}</div>
            <div style={{ fontSize: 13, color: "#cbd5e1" }}>
              Delivery date: {formatPlanningDateDots(deliveryIso)}
            </div>
            {milestoneGoals.length > 0 ? (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Goals:</div>
                <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4, fontSize: 13 }}>
                  {milestoneGoals.map((goal, index) => (
                    <li key={`${goal}-${index}`}>{goal}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          {headerActions}
        </div>

        {rows.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted, #94a3b8)" }}>
            No deliverables yet. Click Edit to add some.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 760,
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
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
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
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const handleNameBlur = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === milestone.name) {
      return;
    }
    void saveMilestonePatch({ name: trimmed });
  };

  const handleDeliveryDateChange = (value: string) => {
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

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>{headerActions}</div>

      <div style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          <span>Milestone</span>
          <input
            type="text"
            value={name}
            disabled={disabled || busy}
            style={inputStyle}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
          />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <span>Delivery date</span>
            <input
              type="date"
              value={deliveryDate}
              disabled={disabled || busy}
              style={inputStyle}
              onChange={(e) => handleDeliveryDateChange(e.target.value)}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <span>Status</span>
            <select
              value={milestoneStatus}
              disabled={disabled || busy}
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
              disabled={disabled || busy}
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
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Goals</span>
            <button
              type="button"
              className="imagegen-button-secondary"
              disabled={disabled || busy}
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
                    disabled={disabled || busy}
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
                    disabled={disabled || busy}
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
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Deliverables</span>
        <button
          type="button"
          className="imagegen-button-secondary"
          disabled={disabled || busy}
          onClick={handleAddRow}
        >
          Add row
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: 900,
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
              <th style={{ ...thStyle, width: 48 }} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ ...tdEditStyle, color: "var(--muted, #94a3b8)" }}>
                  No deliverables. Click Add row to create one.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <DeliverableRowEditor
                  key={row.id}
                  row={row}
                  employees={employees}
                  disabled={disabled || busy}
                  onSave={(patch) => void handleRowFieldSave(row, patch)}
                  onDelete={() => handleDeleteRow(row.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type RowEditorProps = {
  row: PlanningDeliverable;
  employees: PlanningEmployee[];
  disabled: boolean;
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
        <input
          type="date"
          value={dueDate}
          disabled={disabled}
          style={inputStyle}
          onChange={(e) => {
            const value = e.target.value;
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
