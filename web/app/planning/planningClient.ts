import { fetchApi } from "../lib/api";
import type {
  GlobalPlanningResponse,
  MilestoneRisk,
  MilestoneStatus,
  PlanningDeliverable,
  PlanningEvent,
  PlanningGraph,
  PlanningMilestone,
  ProjectPlan,
} from "./types";

async function parseJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${label} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function fetchPlanningGraph(projectKey: string): Promise<PlanningGraph> {
  const response = await fetchApi(
    `/planning?project_key=${encodeURIComponent(projectKey)}`,
  );
  return parseJson<PlanningGraph>(response, "Load planning");
}

export async function fetchGlobalPlanning(): Promise<GlobalPlanningResponse> {
  const response = await fetchApi("/planning/global");
  return parseJson<GlobalPlanningResponse>(response, "Load global planning");
}

export async function clearProjectPlanning(projectKey: string): Promise<void> {
  const response = await fetchApi(
    `/planning/plan?project_key=${encodeURIComponent(projectKey)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Clear planning failed (${response.status})`);
  }
}

export async function upsertPlanStartDate(
  projectKey: string,
  startDate: string,
): Promise<ProjectPlan> {
  const response = await fetchApi("/planning/plan", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_key: projectKey, start_date: startDate }),
  });
  return parseJson<ProjectPlan>(response, "Save start date");
}

export async function createMilestone(
  projectKey: string,
  name: string,
  durationWeeks: number,
  status: MilestoneStatus,
  risk: MilestoneRisk,
): Promise<PlanningMilestone> {
  const response = await fetchApi("/planning/milestones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_key: projectKey,
      name,
      duration_weeks: durationWeeks,
      status,
      risk,
    }),
  });
  return parseJson<PlanningMilestone>(response, "Create milestone");
}

export async function updateMilestone(
  milestoneId: string,
  patch: Partial<{
    name: string;
    duration_weeks: number;
    status: MilestoneStatus;
    risk: MilestoneRisk;
    goals: string[];
    notes: string;
  }>,
): Promise<PlanningMilestone> {
  const response = await fetchApi(`/planning/milestones/${encodeURIComponent(milestoneId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return parseJson<PlanningMilestone>(response, "Update milestone");
}

export async function deleteMilestone(milestoneId: string): Promise<void> {
  const response = await fetchApi(`/planning/milestones/${encodeURIComponent(milestoneId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Delete milestone failed (${response.status})`);
  }
}

export async function createDeliverable(
  milestoneId: string,
  title: string,
  status: MilestoneStatus,
  owner: string = "",
  dueDate: string | null = null,
  risk: MilestoneRisk = "on_track",
): Promise<PlanningDeliverable> {
  const response = await fetchApi("/planning/deliverables", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      milestone_id: milestoneId,
      title,
      status,
      owner,
      due_date: dueDate,
      risk,
    }),
  });
  return parseJson<PlanningDeliverable>(response, "Create deliverable");
}

export async function updateDeliverable(
  deliverableId: string,
  patch: Partial<{
    title: string;
    status: MilestoneStatus;
    risk: MilestoneRisk;
    owner: string;
    due_date: string | null;
  }>,
): Promise<PlanningDeliverable> {
  const response = await fetchApi(
    `/planning/deliverables/${encodeURIComponent(deliverableId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  return parseJson<PlanningDeliverable>(response, "Update deliverable");
}

export async function deleteDeliverable(deliverableId: string): Promise<void> {
  const response = await fetchApi(
    `/planning/deliverables/${encodeURIComponent(deliverableId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Delete deliverable failed (${response.status})`);
  }
}

export async function createEvent(
  milestoneId: string,
  name: string,
  weeksAfterMilestoneStart: number,
): Promise<PlanningEvent> {
  const response = await fetchApi("/planning/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      milestone_id: milestoneId,
      name,
      weeks_after_milestone_start: weeksAfterMilestoneStart,
    }),
  });
  return parseJson<PlanningEvent>(response, "Create event");
}

export async function updateEvent(
  eventId: string,
  patch: Partial<{ name: string; weeks_after_milestone_start: number }>,
): Promise<PlanningEvent> {
  const response = await fetchApi(`/planning/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return parseJson<PlanningEvent>(response, "Update event");
}

export async function deleteEvent(eventId: string): Promise<void> {
  const response = await fetchApi(`/planning/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Delete event failed (${response.status})`);
  }
}
