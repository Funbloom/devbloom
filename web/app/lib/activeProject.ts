/** Single source for active project storage keys and server sync (user_profiles.current_project_key). */

import { fetchApi } from "./api";

export const STORAGE_KEY_ACTIVE_PROJECT = "activeProjectKey";
export const STORAGE_KEY_ACTIVE_PROJECT_NAME = "activeProjectName";

type ActiveProjectChangedOptions = {
  reload?: boolean;
};

export function dispatchActiveProjectChanged(options?: ActiveProjectChangedOptions): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event("activeProjectChanged"));
  if (options?.reload) {
    window.location.reload();
  }
}

/** Persist current project to the server so auth refresh / other devices see the same selection. */
export async function persistActiveProjectToProfile(projectKey: string | null): Promise<void> {
  try {
    await fetchApi("/users/me/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_project_key: projectKey }),
    });
  } catch {
    // non-blocking; local selection still works
  }
}
