"use client";

import { useEffect } from "react";
import type { ReactElement } from "react";
import { STORAGE_KEY_ACTIVE_PROJECT } from "../lib/activeProject";

/** Reload when another tab changes the active project in localStorage. */
export function ActiveProjectStorageSync(): ReactElement | null {
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY_ACTIVE_PROJECT) {
        return;
      }
      if (event.newValue === event.oldValue) {
        return;
      }
      window.location.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return null;
}
