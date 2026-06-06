import { fetchApi } from "../lib/api";
import type { ImportApplyMode, ImportParseResult, ImportedPlanningData } from "./planningImportTypes";
import type { ProjectPlan } from "./types";

async function parseJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${label} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function parsePlanningImport(file: File): Promise<ImportParseResult> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetchApi("/planning/import/parse", {
    method: "POST",
    body: formData,
  });
  return parseJson<ImportParseResult>(response, "Parse import");
}

export async function applyPlanningImport(
  projectKey: string,
  mode: ImportApplyMode,
  data: ImportedPlanningData,
): Promise<ProjectPlan> {
  const response = await fetchApi("/planning/import/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_key: projectKey, mode, data }),
  });
  return parseJson<ProjectPlan>(response, "Apply import");
}
