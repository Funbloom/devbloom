export const GLOBAL_PLANNING_PROJECTS_STORAGE_KEY = "devbloom_planning_global_projects";

export function loadEnabledProjectKeys(storedKeys: string[] | null, defaultKeys: Set<string>): Set<string> {
  if (!storedKeys || storedKeys.length === 0) {
    return new Set(defaultKeys);
  }
  return new Set(storedKeys);
}

export function readStoredEnabledProjectKeys(): string[] | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(GLOBAL_PLANNING_PROJECTS_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.filter((key) => typeof key === "string" && key.trim().length > 0);
  } catch {
    return null;
  }
}

export function saveEnabledProjectKeys(keys: Set<string>): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    GLOBAL_PLANNING_PROJECTS_STORAGE_KEY,
    JSON.stringify([...keys]),
  );
}
