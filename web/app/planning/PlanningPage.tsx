"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { StudioTwoColumnShell } from "../components/studio/StudioTwoColumnShell";
import { STORAGE_KEY_ACTIVE_PROJECT, STORAGE_KEY_ACTIVE_PROJECT_NAME } from "../lib/activeProject";
import { fetchVacationEmployees } from "../vacations/vacationClient";
import { DeliverablesPanel } from "./components/DeliverablesPanel";
import { MilestoneEditModal } from "./components/MilestoneEditModal";
import { PlanningDeleteAllConfirmDialog } from "./components/PlanningDeleteAllConfirmDialog";
import { PlanningImportConflictDialog } from "./components/PlanningImportConflictDialog";
import { PlanningAnalysisModal } from "./components/PlanningAnalysisModal";
import { PlanningImportPreviewModal } from "./components/PlanningImportPreviewModal";
import { GlobalPlanningLeftPanel } from "./components/GlobalPlanningLeftPanel";
import {
  GlobalPlanningTimeline,
  globalPlanningMaxExpandedMonths,
} from "./components/GlobalPlanningTimeline";
import { PlanningLeftPanel } from "./components/PlanningLeftPanel";
import { MonthZoomWidget } from "./components/MonthZoomWidget";
import { PlanningTimeline } from "./components/PlanningTimeline";
import { defaultEnabledProjectKeys } from "./globalPlanningView";
import {
  loadEnabledProjectKeys,
  readStoredEnabledProjectKeys,
  saveEnabledProjectKeys,
} from "./globalProjectsStorage";
import { applyPlanningImport, parsePlanningImport } from "./planningImportClient";
import type { ImportApplyMode, ImportedPlanningData } from "./planningImportTypes";
import {
  clearProjectPlanning,
  createDeliverable,
  createEvent,
  createMilestone,
  deleteDeliverable,
  deleteEvent,
  deleteMilestone,
  fetchGlobalPlanning,
  fetchPlanningGraph,
  updateDeliverable,
  updateEvent,
  updateMilestone,
  upsertPlanStartDate,
} from "./planningClient";
import {
  computeMilestoneStartWeeks,
  defaultStartDateIso,
  PLANNING_WEEKS_MAX,
  planningRangeMonthKeys,
  planStartOrDefault,
} from "./planningTimeline";
import type {
  MilestoneStatus,
  GlobalPlanningProject,
  PlanningDeliverable,
  PlanningEmployee,
  PlanningGraph,
  PlanningMilestone,
} from "./types";
import {
  buildAnalyzedRiskUpdates,
  type PlanningAnalysisResult,
} from "./planningAnalysis";
import { clampMonthZoom, type MonthZoom } from "./monthZoom";
import {
  GLOBAL_PLANNING_MONTH_ZOOM_STORAGE_KEY,
  loadMonthZoom,
  PLANNING_MONTH_ZOOM_STORAGE_KEY,
  saveMonthZoom,
} from "./monthZoomStorage";

type PlanningTab = "current" | "global";
const PLANNING_TAB_STORAGE_KEY = "devbloom_planning_tab";

function loadPlanningTab(): PlanningTab {
  if (typeof window === "undefined") {
    return "current";
  }
  const raw = window.sessionStorage.getItem(PLANNING_TAB_STORAGE_KEY);
  return raw === "global" ? "global" : "current";
}

const emptyGraph = (): PlanningGraph => ({
  plan: null,
  milestones: [],
  deliverables: [],
  events: [],
});

export function PlanningPage(): ReactElement {
  const [projectKey, setProjectKey] = useState("");
  const [activeProjectName, setActiveProjectName] = useState("");
  const [graph, setGraph] = useState<PlanningGraph>(emptyGraph);
  const [startDate, setStartDate] = useState(defaultStartDateIso());
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [editMilestone, setEditMilestone] = useState<PlanningMilestone | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [planningMonthZoom, setPlanningMonthZoom] = useState<MonthZoom>(() =>
    loadMonthZoom(PLANNING_MONTH_ZOOM_STORAGE_KEY),
  );
  const [importPreview, setImportPreview] = useState<{
    data: ImportedPlanningData;
    warnings: string[];
  } | null>(null);
  const [importConflictOpen, setImportConflictOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importParsing, setImportParsing] = useState(false);
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [employees, setEmployees] = useState<PlanningEmployee[]>([]);
  const [planningTab, setPlanningTab] = useState<PlanningTab>(() => loadPlanningTab());
  const [globalProjects, setGlobalProjects] = useState<GlobalPlanningProject[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalStatus, setGlobalStatus] = useState<string | null>(null);
  const [enabledProjectKeys, setEnabledProjectKeys] = useState<Set<string>>(new Set());
  const [globalMonthZoom, setGlobalMonthZoom] = useState<MonthZoom>(() =>
    loadMonthZoom(GLOBAL_PLANNING_MONTH_ZOOM_STORAGE_KEY),
  );

  const planningMaxExpandedMonths = useMemo(
    () => planningRangeMonthKeys(startDate, PLANNING_WEEKS_MAX).length,
    [startDate],
  );

  useEffect(() => {
    setPlanningMonthZoom((prev) => clampMonthZoom(prev, planningMaxExpandedMonths));
  }, [planningMaxExpandedMonths]);

  useEffect(() => {
    saveMonthZoom(PLANNING_MONTH_ZOOM_STORAGE_KEY, planningMonthZoom);
  }, [planningMonthZoom]);

  const globalMaxExpandedMonths = useMemo(
    () => globalPlanningMaxExpandedMonths(globalProjects, enabledProjectKeys),
    [globalProjects, enabledProjectKeys],
  );

  useEffect(() => {
    setGlobalMonthZoom((prev) => clampMonthZoom(prev, globalMaxExpandedMonths));
  }, [globalMaxExpandedMonths]);

  useEffect(() => {
    saveMonthZoom(GLOBAL_PLANNING_MONTH_ZOOM_STORAGE_KEY, globalMonthZoom);
  }, [globalMonthZoom]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.sessionStorage.setItem(PLANNING_TAB_STORAGE_KEY, planningTab);
  }, [planningTab]);

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

  const loadEmployees = useCallback(async () => {
    try {
      const data = await fetchVacationEmployees();
      setEmployees(data);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to load employees.");
    }
  }, []);

  const loadGlobalPlanning = useCallback(async () => {
    setGlobalLoading(true);
    setGlobalStatus(null);
    try {
      const data = await fetchGlobalPlanning();
      setGlobalProjects(data.projects);
      const defaults = defaultEnabledProjectKeys(data.projects);
      const stored = readStoredEnabledProjectKeys();
      setEnabledProjectKeys(loadEnabledProjectKeys(stored, defaults));
    } catch (err) {
      setGlobalStatus(err instanceof Error ? err.message : "Failed to load global planning.");
    } finally {
      setGlobalLoading(false);
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      if (typeof window === "undefined") {
        return;
      }
      const key = window.localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT)?.trim() ?? "";
      const name = window.localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT_NAME)?.trim() ?? "";
      setProjectKey(key);
      setActiveProjectName(name);
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
    void loadGraph(projectKey);
    void loadEmployees();
  }, [projectKey, loadGraph, loadEmployees]);

  useEffect(() => {
    if (planningTab === "global") {
      void loadGlobalPlanning();
    }
  }, [planningTab, loadGlobalPlanning]);

  const refresh = async () => {
    if (projectKey) {
      await loadGraph(projectKey);
    }
  };

  const closeImportFlow = () => {
    setImportPreview(null);
    setImportConflictOpen(false);
    setImportError(null);
  };

  const handleImportFileSelected = async (file: File) => {
    if (!projectKey) {
      setStatus("Select a project before importing a plan.");
      return;
    }
    setImportParsing(true);
    setImportError(null);
    setStatus(null);
    try {
      const result = await parsePlanningImport(file);
      setImportPreview({ data: result.data, warnings: result.warnings });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to parse import file.");
    } finally {
      setImportParsing(false);
    }
  };

  const runImportApply = async (mode: ImportApplyMode) => {
    if (!projectKey || !importPreview) {
      return;
    }
    setSaving(true);
    setImportError(null);
    setStatus(null);
    try {
      await applyPlanningImport(projectKey, mode, importPreview.data);
      closeImportFlow();
      await refresh();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to apply import.");
    } finally {
      setSaving(false);
    }
  };

  const handleImportConfirm = () => {
    if (!importPreview) {
      return;
    }
    if (graph.milestones.length > 0) {
      setImportConflictOpen(true);
      return;
    }
    void runImportApply("append");
  };

  const handleImportConflictChoice = (mode: ImportApplyMode) => {
    setImportConflictOpen(false);
    void runImportApply(mode);
  };

  const hasPlanningData = graph.milestones.length > 0 || graph.plan !== null;

  const handleDeleteAllConfirm = async () => {
    if (!projectKey) {
      return;
    }
    setSaving(true);
    setDeleteAllError(null);
    setStatus(null);
    try {
      await clearProjectPlanning(projectKey);
      setDeleteAllConfirmOpen(false);
      setSelectedMilestoneId(null);
      setEditMilestone(null);
      await refresh();
    } catch (err) {
      setDeleteAllError(err instanceof Error ? err.message : "Failed to delete planning data.");
    } finally {
      setSaving(false);
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

  const selectedMilestone =
    graph.milestones.find((m) => m.id === selectedMilestoneId) ?? null;

  const showMilestoneDetail = selectedMilestone !== null;

  const milestoneStartWeeks = useMemo(
    () => computeMilestoneStartWeeks(graph.milestones),
    [graph.milestones],
  );

  const mergeMilestone = useCallback((updated: PlanningMilestone) => {
    setGraph((prev) => ({
      ...prev,
      milestones: prev.milestones.map((milestone) =>
        milestone.id === updated.id
          ? { ...milestone, ...updated, goals: updated.goals ?? [] }
          : milestone,
      ),
    }));
  }, []);

  const mergeDeliverable = useCallback((updated: PlanningDeliverable) => {
    setGraph((prev) => ({
      ...prev,
      deliverables: prev.deliverables.map((deliverable) =>
        deliverable.id === updated.id
          ? { ...deliverable, ...updated, risk: updated.risk ?? "on_track" }
          : deliverable,
      ),
    }));
  }, []);

  const appendDeliverable = useCallback((created: PlanningDeliverable) => {
    setGraph((prev) => ({
      ...prev,
      deliverables: [
        ...prev.deliverables,
        { ...created, risk: created.risk ?? "on_track" },
      ],
    }));
  }, []);

  const removeDeliverableFromGraph = useCallback((deliverableId: string) => {
    setGraph((prev) => ({
      ...prev,
      deliverables: prev.deliverables.filter((deliverable) => deliverable.id !== deliverableId),
    }));
  }, []);

  const handleApplyAnalyzedRisks = useCallback(
    async (analysisResult: PlanningAnalysisResult) => {
      const updates = buildAnalyzedRiskUpdates(analysisResult);
      const milestoneUpdates = updates.milestones.filter((row) => row.risk !== row.previousRisk);
      const deliverableUpdates = updates.deliverables.filter((row) => row.risk !== row.previousRisk);
      if (milestoneUpdates.length === 0 && deliverableUpdates.length === 0) {
        return;
      }
      setSaving(true);
      setStatus(null);
      try {
        const results = await Promise.all([
          ...milestoneUpdates.map((row) => updateMilestone(row.id, { risk: row.risk })),
          ...deliverableUpdates.map((row) => updateDeliverable(row.id, { risk: row.risk })),
        ]);
        for (const updated of results) {
          if ("milestone_id" in updated) {
            mergeDeliverable(updated);
          } else {
            mergeMilestone(updated);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update risks.";
        setStatus(message);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [mergeDeliverable, mergeMilestone],
  );

  const handleToggleGlobalProject = (key: string, enabled: boolean) => {
    setEnabledProjectKeys((prev) => {
      const next = new Set(prev);
      if (enabled) {
        next.add(key);
      } else {
        next.delete(key);
      }
      saveEnabledProjectKeys(next);
      return next;
    });
  };

  const handleSelectAllGlobalProjects = () => {
    const next = new Set(globalProjects.map((project) => project.project_key));
    setEnabledProjectKeys(next);
    saveEnabledProjectKeys(next);
  };

  const handleClearAllGlobalProjects = () => {
    const next = new Set<string>();
    setEnabledProjectKeys(next);
    saveEnabledProjectKeys(next);
  };

  const planningTabSwitcher = (
    <div className="admin-tabs" style={{ marginBottom: 12 }}>
      <button
        type="button"
        role="tab"
        aria-selected={planningTab === "current"}
        className={planningTab === "current" ? "admin-tab active" : "admin-tab"}
        onClick={() => setPlanningTab("current")}
      >
        Current Project
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={planningTab === "global"}
        className={planningTab === "global" ? "admin-tab active" : "admin-tab"}
        onClick={() => setPlanningTab("global")}
      >
        All Projects
      </button>
    </div>
  );

  const leftPanel = (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      {planningTabSwitcher}
      {planningTab === "current" ? (
        <PlanningLeftPanel
          startDate={startDate}
          saving={saving || importParsing}
          importDisabled={!projectKey}
          analyseDisabled={!projectKey || !hasPlanningData}
          deleteAllDisabled={!projectKey || !hasPlanningData}
          onStartDateChange={(value) => void handleStartDateChange(value)}
          onImportFileSelected={(file) => void handleImportFileSelected(file)}
          onAnalyseClick={() => setAnalysisOpen(true)}
          onDeleteAllClick={() => {
            setDeleteAllError(null);
            setDeleteAllConfirmOpen(true);
          }}
        />
      ) : (
        <GlobalPlanningLeftPanel
          projects={globalProjects}
          enabledKeys={enabledProjectKeys}
          loading={globalLoading}
          onToggleProject={handleToggleGlobalProject}
          onSelectAll={handleSelectAllGlobalProjects}
          onClearAll={handleClearAllGlobalProjects}
        />
      )}
    </div>
  );

  const rightPanel =
    planningTab === "current" ? (
      <div
        className="imagegen-panel"
        style={{
          flex: showMilestoneDetail ? "0 0 auto" : 1,
          minHeight: showMilestoneDetail ? "auto" : 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h2 className="imagegen-panel-title">Timeline</h2>
        {projectKey && !loading ? (
          <MonthZoomWidget
            monthZoom={planningMonthZoom}
            maxExpandedMonths={planningMaxExpandedMonths}
            onMonthZoomChange={setPlanningMonthZoom}
          />
        ) : null}
        <div
          className="imagegen-panel-body"
          style={{
            flex: showMilestoneDetail ? "0 0 auto" : 1,
            minHeight: showMilestoneDetail ? "auto" : 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
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
                    compact={showMilestoneDetail}
                    onSelectMilestone={setSelectedMilestoneId}
                    onEditMilestone={setEditMilestone}
                    onAddMilestone={() => void handleAddMilestone()}
                  />
                  <DeliverablesPanel
                    milestone={selectedMilestone}
                    deliverables={graph.deliverables}
                    employees={employees}
                    planStartDate={startDate}
                    startWeek={
                      selectedMilestone
                        ? milestoneStartWeeks.get(selectedMilestone.id) ?? 0
                        : 0
                    }
                    disabled={saving || importParsing}
                    onMilestoneUpdated={mergeMilestone}
                    onDeliverableUpdated={mergeDeliverable}
                    onDeliverableCreated={appendDeliverable}
                    onDeliverableDeleted={removeDeliverableFromGraph}
                    onSaveMilestone={updateMilestone}
                    onSaveDeliverable={updateDeliverable}
                    onCreateDeliverable={(milestoneId) =>
                      createDeliverable(milestoneId, "New item", "todo", "", null, "on_track")
                    }
                    onDeleteDeliverable={deleteDeliverable}
                    onError={(message) => setStatus(message)}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>
    ) : (
      <div
        className="imagegen-panel"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h2 className="imagegen-panel-title">Global timeline</h2>
        {!globalLoading ? (
          <MonthZoomWidget
            monthZoom={globalMonthZoom}
            maxExpandedMonths={globalMaxExpandedMonths}
            onMonthZoomChange={setGlobalMonthZoom}
          />
        ) : null}
        <div
          className="imagegen-panel-body"
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {globalStatus ? (
            <p role="status" style={{ margin: "0 0 8px", color: "#fca5a5", fontSize: 13 }}>
              {globalStatus}
            </p>
          ) : null}
          {globalLoading ? (
            <p style={{ margin: 0, color: "var(--muted, #94a3b8)" }}>Loading global planning...</p>
          ) : (
            <GlobalPlanningTimeline
              projects={globalProjects}
              enabledKeys={enabledProjectKeys}
              monthZoom={globalMonthZoom}
            />
          )}
        </div>
      </div>
    );

  return (
    <>
      {analysisOpen ? (
        <PlanningAnalysisModal
          graph={graph}
          planStart={startDate}
          activeProjectName={activeProjectName || projectKey}
          saving={saving}
          onClose={() => setAnalysisOpen(false)}
          onSelectMilestone={(milestoneId) => {
            setSelectedMilestoneId(milestoneId);
            setAnalysisOpen(false);
          }}
          onApplyAnalyzedRisks={handleApplyAnalyzedRisks}
        />
      ) : null}

      {importPreview ? (
        <PlanningImportPreviewModal
          data={importPreview.data}
          warnings={importPreview.warnings}
          activeProjectName={activeProjectName || projectKey}
          saving={saving}
          error={importError}
          onClose={closeImportFlow}
          onConfirm={handleImportConfirm}
        />
      ) : null}

      {deleteAllConfirmOpen ? (
        <PlanningDeleteAllConfirmDialog
          projectName={activeProjectName || projectKey}
          milestoneCount={graph.milestones.length}
          saving={saving}
          error={deleteAllError}
          onConfirm={() => void handleDeleteAllConfirm()}
          onCancel={() => {
            if (!saving) {
              setDeleteAllConfirmOpen(false);
              setDeleteAllError(null);
            }
          }}
        />
      ) : null}

      {importConflictOpen ? (
        <PlanningImportConflictDialog
          existingMilestoneCount={graph.milestones.length}
          saving={saving}
          onChoose={handleImportConflictChoice}
          onCancel={() => setImportConflictOpen(false)}
        />
      ) : null}

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
        rightStyle={{
          minHeight:
            planningTab === "global"
              ? "min(75vh, 920px)"
              : showMilestoneDetail
                ? "auto"
                : "min(75vh, 920px)",
        }}
      />
    </>
  );
}
