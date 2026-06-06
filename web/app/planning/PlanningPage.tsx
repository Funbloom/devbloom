"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { StudioTwoColumnShell } from "../components/studio/StudioTwoColumnShell";
import { STORAGE_KEY_ACTIVE_PROJECT } from "../lib/activeProject";
import { DeliverablesPanel } from "./components/DeliverablesPanel";
import { MilestoneEditModal } from "./components/MilestoneEditModal";
import { PlanningLeftPanel } from "./components/PlanningLeftPanel";
import { PlanningPanelTabs, type PlanningPanelTab } from "./components/PlanningPanelTabs";
import { PlanningTimeline } from "./components/PlanningTimeline";
import { VacationsGrid } from "./components/VacationsGrid";
import { VacationsLeftPanel } from "./components/VacationsLeftPanel";
import {
  createDeliverable,
  createEvent,
  createMilestone,
  deleteDeliverable,
  deleteEvent,
  deleteMilestone,
  fetchPlanningGraph,
  updateDeliverable,
  updateEvent,
  updateMilestone,
  upsertPlanStartDate,
} from "./planningClient";
import {
  defaultStartDateIso,
  PLANNING_WEEKS_MAX,
  planningRangeMonthKeys,
  planStartOrDefault,
} from "./planningTimeline";
import type { MilestoneStatus, PlanningGraph, PlanningMilestone, VacationGrid } from "./types";
import {
  clampMonthZoom,
  orderedMonthKeysBetweenIso,
  type MonthZoom,
} from "./monthZoom";
import {
  loadMonthZoom,
  PLANNING_MONTH_ZOOM_STORAGE_KEY,
  saveMonthZoom,
  VACATION_MONTH_ZOOM_STORAGE_KEY,
} from "./monthZoomStorage";
import { buildDayColumns } from "./vacationGrid";
import { fetchVacationGrid, updateVacationCells } from "./vacationClient";
import {
  aggregateSelectionState,
  cellKey,
  parseCellKey,
  type VacationCellKey,
} from "./vacationSelection";

const emptyGraph = (): PlanningGraph => ({
  plan: null,
  milestones: [],
  deliverables: [],
  events: [],
});

const emptyVacationGrid = (): VacationGrid => ({
  employees: [],
  entries: [],
  holidays: [],
  range: { from: "", to: "" },
});

export function PlanningPage(): ReactElement {
  const [panelTab, setPanelTab] = useState<PlanningPanelTab>("planning");
  const [projectKey, setProjectKey] = useState("");
  const [graph, setGraph] = useState<PlanningGraph>(emptyGraph);
  const [vacationGrid, setVacationGrid] = useState<VacationGrid>(emptyVacationGrid);
  const [startDate, setStartDate] = useState(defaultStartDateIso());
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [editMilestone, setEditMilestone] = useState<PlanningMilestone | null>(null);
  const [loading, setLoading] = useState(false);
  const [vacationLoading, setVacationLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [dragAnchor, setDragAnchor] = useState<VacationCellKey | null>(null);
  const [planningMonthZoom, setPlanningMonthZoom] = useState<MonthZoom>(() =>
    loadMonthZoom(PLANNING_MONTH_ZOOM_STORAGE_KEY),
  );
  const [vacationMonthZoom, setVacationMonthZoom] = useState<MonthZoom>(() =>
    loadMonthZoom(VACATION_MONTH_ZOOM_STORAGE_KEY),
  );

  const planningMaxExpandedMonths = useMemo(
    () => planningRangeMonthKeys(startDate, PLANNING_WEEKS_MAX).length,
    [startDate],
  );

  const vacationMaxExpandedMonths = useMemo(() => {
    if (!vacationGrid.range.from || !vacationGrid.range.to) {
      return 1;
    }
    return orderedMonthKeysBetweenIso(vacationGrid.range.from, vacationGrid.range.to).length;
  }, [vacationGrid.range.from, vacationGrid.range.to]);

  useEffect(() => {
    setPlanningMonthZoom((prev) => clampMonthZoom(prev, planningMaxExpandedMonths));
  }, [planningMaxExpandedMonths]);

  useEffect(() => {
    setVacationMonthZoom((prev) => clampMonthZoom(prev, vacationMaxExpandedMonths));
  }, [vacationMaxExpandedMonths]);

  useEffect(() => {
    saveMonthZoom(PLANNING_MONTH_ZOOM_STORAGE_KEY, planningMonthZoom);
  }, [planningMonthZoom]);

  useEffect(() => {
    saveMonthZoom(VACATION_MONTH_ZOOM_STORAGE_KEY, vacationMonthZoom);
  }, [vacationMonthZoom]);

  const loadGraph = useCallback(async (key: string) => {
    if (!key) {
      setGraph(emptyGraph());
      setStartDate(defaultStartDateIso());
      setSelectedMilestoneId(null);
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const data = await fetchPlanningGraph(key);
      setGraph(data);
      setStartDate(planStartOrDefault(data.plan));
      setSelectedMilestoneId((prev) =>
        prev && data.milestones.some((m) => m.id === prev) ? prev : null,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to load planning data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadVacations = useCallback(async () => {
    setVacationLoading(true);
    setStatus(null);
    try {
      const data = await fetchVacationGrid();
      setVacationGrid(data);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to load vacation data.");
    } finally {
      setVacationLoading(false);
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      const key =
        typeof window !== "undefined"
          ? window.localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT)?.trim() ?? ""
          : "";
      setProjectKey(key);
    };
    sync();
    window.addEventListener("activeProjectChanged", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("activeProjectChanged", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (panelTab === "planning") {
      void loadGraph(projectKey);
    }
  }, [projectKey, loadGraph, panelTab]);

  useEffect(() => {
    if (panelTab === "vacations") {
      void loadVacations();
    }
  }, [panelTab, loadVacations]);

  const refresh = async () => {
    if (projectKey) {
      await loadGraph(projectKey);
    }
  };

  const handleStartDateChange = async (value: string) => {
    if (!projectKey || !value) {
      return;
    }
    setStartDate(value);
    setSaving(true);
    setStatus(null);
    try {
      const plan = await upsertPlanStartDate(projectKey, value);
      setGraph((prev) => ({ ...prev, plan }));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save start date.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddMilestone = async () => {
    if (!projectKey) {
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await createMilestone(projectKey, `Milestone ${graph.milestones.length + 1}`, 2, "todo", "on_track");
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to add milestone.");
    } finally {
      setSaving(false);
    }
  };

  const entryStatusByKey = useMemo(() => {
    const map = new Map<string, "vacation" | "away_working">();
    for (const entry of vacationGrid.entries) {
      map.set(cellKey(entry.employee_id, entry.day_date), entry.status);
    }
    return map;
  }, [vacationGrid.entries]);

  const holidayDates = useMemo(() => new Set(vacationGrid.holidays), [vacationGrid.holidays]);

  const inactiveKeys = useMemo(() => {
    const set = new Set<string>();
    if (!vacationGrid.range.from || !vacationGrid.range.to) {
      return set;
    }
    const dayIsos = buildDayColumns(vacationGrid.range.from, vacationGrid.range.to).map((c) => c.iso);
    for (const employee of vacationGrid.employees) {
      for (const iso of dayIsos) {
        if (iso < employee.start_date) {
          set.add(cellKey(employee.id, iso));
        }
      }
    }
    return set;
  }, [vacationGrid.employees, vacationGrid.range]);

  const selectionState = aggregateSelectionState(
    selectedKeys,
    entryStatusByKey,
    holidayDates,
    inactiveKeys,
  );

  const applyVacationAction = async (status: "vacation" | "away_working" | null) => {
    const byEmployee = new Map<string, string[]>();
    for (const key of selectedKeys) {
      const parsed = parseCellKey(key);
      if (!parsed) {
        continue;
      }
      if (holidayDates.has(parsed.dateIso) || inactiveKeys.has(key)) {
        continue;
      }
      const dates = byEmployee.get(parsed.employeeId) ?? [];
      dates.push(parsed.dateIso);
      byEmployee.set(parsed.employeeId, dates);
    }
    if (byEmployee.size === 0) {
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      for (const [employeeId, dates] of byEmployee.entries()) {
        await updateVacationCells(employeeId, dates, status);
      }
      setSelectedKeys(new Set());
      await loadVacations();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to update vacation cells.");
    } finally {
      setSaving(false);
    }
  };

  const selectedMilestone =
    graph.milestones.find((m) => m.id === selectedMilestoneId) ?? null;

  const leftPanel = (
    <PlanningPanelTabs activeTab={panelTab} onTabChange={setPanelTab}>
      {panelTab === "planning" ? (
        <PlanningLeftPanel
          startDate={startDate}
          saving={saving}
          monthZoom={planningMonthZoom}
          maxExpandedMonths={planningMaxExpandedMonths}
          onMonthZoomChange={setPlanningMonthZoom}
          onStartDateChange={(value) => void handleStartDateChange(value)}
        />
      ) : (
        <VacationsLeftPanel
          selectionState={selectionState}
          saving={saving}
          monthZoom={vacationMonthZoom}
          maxExpandedMonths={vacationMaxExpandedMonths}
          onMonthZoomChange={setVacationMonthZoom}
          onRequestVacation={() => void applyVacationAction("vacation")}
          onSetAway={() => void applyVacationAction("away_working")}
          onCancelVacation={() => void applyVacationAction(null)}
          onCancelAway={() => void applyVacationAction(null)}
        />
      )}
    </PlanningPanelTabs>
  );

  const rightPanel =
    panelTab === "planning" ? (
      <div className="imagegen-panel" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <h2 className="imagegen-panel-title">Timeline</h2>
        <div className="imagegen-panel-body" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {!projectKey ? (
            <p style={{ margin: 0, color: "var(--muted, #94a3b8)" }}>
              Select a project in the header to open its planning timeline.
            </p>
          ) : (
            <>
              {status ? (
                <p role="status" style={{ margin: "0 0 8px", color: "#fca5a5", fontSize: 13 }}>
                  {status}
                </p>
              ) : null}
              {loading ? (
                <p style={{ margin: 0, color: "var(--muted, #94a3b8)" }}>Loading planning data...</p>
              ) : (
                <>
                  <PlanningTimeline
                    startDate={startDate}
                    milestones={graph.milestones}
                    events={graph.events}
                    selectedMilestoneId={selectedMilestoneId}
                    saving={saving}
                    monthZoom={planningMonthZoom}
                    onSelectMilestone={setSelectedMilestoneId}
                    onEditMilestone={setEditMilestone}
                    onAddMilestone={() => void handleAddMilestone()}
                  />
                  <DeliverablesPanel milestone={selectedMilestone} deliverables={graph.deliverables} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    ) : (
      <div className="imagegen-panel" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <h2 className="imagegen-panel-title">Vacation calendar</h2>
        <div className="imagegen-panel-body" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {status ? (
            <p role="status" style={{ margin: "0 0 8px", color: "#fca5a5", fontSize: 13 }}>
              {status}
            </p>
          ) : null}
          {vacationLoading ? (
            <p style={{ margin: 0, color: "var(--muted, #94a3b8)" }}>Loading vacation data...</p>
          ) : (
            <VacationsGrid
              rangeFrom={vacationGrid.range.from}
              rangeTo={vacationGrid.range.to}
              employees={vacationGrid.employees}
              entries={vacationGrid.entries}
              holidays={vacationGrid.holidays}
              selectedKeys={selectedKeys}
              dragAnchor={dragAnchor}
              monthZoom={vacationMonthZoom}
              onSelectKeys={setSelectedKeys}
              onDragAnchor={setDragAnchor}
            />
          )}
        </div>
      </div>
    );

  return (
    <>
      {editMilestone ? (
        <MilestoneEditModal
          milestone={editMilestone}
          deliverables={graph.deliverables}
          events={graph.events}
          saving={saving}
          onClose={() => setEditMilestone(null)}
          onSaveMilestone={async (patch) => {
            setSaving(true);
            try {
              await updateMilestone(editMilestone.id, patch);
              await refresh();
              setEditMilestone(null);
            } catch (err) {
              setStatus(err instanceof Error ? err.message : "Failed to save milestone.");
            } finally {
              setSaving(false);
            }
          }}
          onDeleteMilestone={async () => {
            setSaving(true);
            try {
              await deleteMilestone(editMilestone.id);
              setEditMilestone(null);
              setSelectedMilestoneId(null);
              await refresh();
            } catch (err) {
              setStatus(err instanceof Error ? err.message : "Failed to delete milestone.");
            } finally {
              setSaving(false);
            }
          }}
          onAddDeliverable={async (title, status: MilestoneStatus) => {
            setSaving(true);
            try {
              await createDeliverable(editMilestone.id, title, status);
              await refresh();
              const updated = await fetchPlanningGraph(projectKey);
              setGraph(updated);
              const ms = updated.milestones.find((m) => m.id === editMilestone.id);
              if (ms) {
                setEditMilestone(ms);
              }
            } finally {
              setSaving(false);
            }
          }}
          onUpdateDeliverable={async (id, patch) => {
            setSaving(true);
            try {
              await updateDeliverable(id, patch);
              await refresh();
            } finally {
              setSaving(false);
            }
          }}
          onDeleteDeliverable={async (id) => {
            setSaving(true);
            try {
              await deleteDeliverable(id);
              await refresh();
            } finally {
              setSaving(false);
            }
          }}
          onAddEvent={async (name, weeksAfter) => {
            setSaving(true);
            try {
              await createEvent(editMilestone.id, name, weeksAfter);
              await refresh();
            } catch (err) {
              setStatus(err instanceof Error ? err.message : "Failed to add event.");
            } finally {
              setSaving(false);
            }
          }}
          onUpdateEvent={async (id, patch) => {
            setSaving(true);
            try {
              await updateEvent(id, patch);
              await refresh();
            } catch (err) {
              setStatus(err instanceof Error ? err.message : "Failed to update event.");
            } finally {
              setSaving(false);
            }
          }}
          onDeleteEvent={async (id) => {
            setSaving(true);
            try {
              await deleteEvent(id);
              await refresh();
            } finally {
              setSaving(false);
            }
          }}
        />
      ) : null}

      <StudioTwoColumnShell
        left={leftPanel}
        right={rightPanel}
        rightStyle={{ minHeight: "min(75vh, 920px)" }}
      />
    </>
  );
}
