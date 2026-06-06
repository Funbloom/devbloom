import { fetchApi } from "../lib/api";
import type { VacationCellStatus, VacationEmployee, VacationGrid } from "./types";

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
  const response = await fetchApi(`/vacations${query ? `?${query}` : ""}`);
  return parseJson<VacationGrid>(response, "Load vacations");
}

export async function updateVacationCells(
  employeeId: string,
  dates: string[],
  status: VacationCellStatus,
): Promise<void> {
  const response = await fetchApi("/vacations/cells", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id: employeeId, dates, status }),
  });
  await parseJson(response, "Update vacation cells");
}

export async function fetchVacationEmployees(): Promise<VacationEmployee[]> {
  const response = await fetchApi("/vacations/employees");
  return parseJson<VacationEmployee[]>(response, "Load employees");
}

export async function createVacationEmployee(
  name: string,
  title: string,
  startDate: string,
): Promise<VacationEmployee> {
  const response = await fetchApi("/vacations/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, title, start_date: startDate }),
  });
  return parseJson<VacationEmployee>(response, "Create employee");
}

export async function updateVacationEmployee(
  id: string,
  patch: { name?: string; title?: string; start_date?: string },
): Promise<VacationEmployee> {
  const response = await fetchApi(`/vacations/employees/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return parseJson<VacationEmployee>(response, "Update employee");
}

export async function deleteVacationEmployee(id: string): Promise<void> {
  const response = await fetchApi(`/vacations/employees/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  await parseJson(response, "Delete employee");
}
