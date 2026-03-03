"use client";

import { useEffect } from "react";

const DEFAULT_THEME: "original" | "ocean" | "forest" = "ocean";

export function ThemeInitializer() {
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("uiTheme") as
        | "original"
        | "ocean"
        | "forest"
        | null;
      const theme = stored === "original" || stored === "ocean" || stored === "forest"
        ? stored
        : DEFAULT_THEME;
      document.documentElement.setAttribute("data-theme", theme);
    } catch {
      document.documentElement.setAttribute("data-theme", DEFAULT_THEME);
    }
  }, []);

  return null;
}

