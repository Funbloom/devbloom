import { fetchApi } from "../lib/api";
import type { PlanningEmployee, VacationCellStatus, VacationGrid } from "./types";

async function parseJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${label} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function fetchVacationGrid(
  fromIso?: string,
  toIso?: string,
): Promise<VacationGrid> {
  const params = new URLSearchParams();
  if (fromIso) {
    params.set("from", fromIso);
  }
  if (toIso) {
    params.set("to", toIso);
  }
  const query = params.toString();
  const response = await fetchApi(`/planning/vacations${query ? `?${query}` : ""}`);
  return parseJson<VacationGrid>(response, "Load vacations");
}

export async function updateVacationCells(
  employeeId: string,
  dates: string[],
  status: VacationCellStatus,
): Promise<void> {
  const response = await fetchApi("/planning/vacations/cells", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id: employeeId, dates, status }),
  });
  await parseJson(response, "Update vacation cells");
}

export async function fetchPlanningEmployees(): Promise<PlanningEmployee[]> {
  const response = await fetchApi("/planning/employees");
  return parseJson<PlanningEmployee[]>(response, "Load employees");
}

export async function createPlanningEmployee(
  name: string,
  title: string,
  startDate: string,
): Promise<PlanningEmployee> {
  const response = await fetchApi("/planning/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, title, start_date: startDate }),
  });
  return parseJson<PlanningEmployee>(response, "Create employee");
}

export async function updatePlanningEmployee(
  id: string,
  patch: { name?: string; title?: string; start_date?: string },
): Promise<PlanningEmployee> {
  const response = await fetchApi(`/planning/employees/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return parseJson<PlanningEmployee>(response, "Update employee");
}

export async function deletePlanningEmployee(id: string): Promise<void> {
  const response = await fetchApi(`/planning/employees/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  await parseJson(response, "Delete employee");
}
