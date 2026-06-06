"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { StudioTwoColumnShell } from "../components/studio/StudioTwoColumnShell";
import { STORAGE_KEY_ACTIVE_PROJECT } from "../lib/activeProject";
import { DeliverablesPanel } from "./components/DeliverablesPanel";
import { MilestoneEditModal } from "./components/MilestoneEditModal";
import { PlanningLeftPanel } from "./components/PlanningLeftPanel";
import { PlanningTimeline } from "./components/PlanningTimeline";
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
import { defaultStartDateIso, planStartOrDefault } from "./planningTimeline";
import type { MilestoneStatus, PlanningGraph, PlanningMilestone } from "./types";

const emptyGraph = (): PlanningGraph => ({
  plan: null,
  milestones: [],
  deliverables: [],
  events: [],
});

export function PlanningPage(): ReactElement {
  const [projectKey, setProjectKey] = useState("");
  const [graph, setGraph] = useState<PlanningGraph>(emptyGraph);
  const [startDate, setStartDate] = useState(defaultStartDateIso());
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [editMilestone, setEditMilestone] = useState<PlanningMilestone | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

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
    void loadGraph(projectKey);
  }, [projectKey, loadGraph]);

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

  const selectedMilestone =
    graph.milestones.find((m) => m.id === selectedMilestoneId) ?? null;

  if (!projectKey) {
    return (
      <main style={{ padding: 24 }}>
        <p style={{ color: "var(--muted, #94a3b8)" }}>
          Select a project in the header to open its planning timeline.
        </p>
      </main>
    );
  }

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
        left={
          <PlanningLeftPanel
            startDate={startDate}
            saving={saving}
            onStartDateChange={(value) => void handleStartDateChange(value)}
          />
        }
        right={
          <div className="imagegen-panel" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <h2 className="imagegen-panel-title">Timeline</h2>
            <div className="imagegen-panel-body" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
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
                    onSelectMilestone={setSelectedMilestoneId}
                    onEditMilestone={setEditMilestone}
                    onAddMilestone={() => void handleAddMilestone()}
                  />
                  <DeliverablesPanel milestone={selectedMilestone} deliverables={graph.deliverables} />
                </>
              )}
            </div>
          </div>
        }
        rightStyle={{ minHeight: "min(75vh, 920px)" }}
      />
    </>
  );
}
