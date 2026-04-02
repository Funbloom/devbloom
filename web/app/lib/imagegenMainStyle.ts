/**
 * Persists the ImageGen → Image tab "Style" dropdown so other tools (e.g. cities location-update images) can default to the same preset.
 */
export const IMAGEGEN_MAIN_STYLE_STORAGE_KEY = "imagegen_image_tab_style_id";

export function readImagegenMainStyleId(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(IMAGEGEN_MAIN_STYLE_STORAGE_KEY)?.trim() ?? "";
}

/** Pass "__none" or empty to clear the saved preference. */
export function writeImagegenMainStyleId(id: string): void {
  if (typeof window === "undefined") return;
  if (!id || id === "__none") {
    window.localStorage.removeItem(IMAGEGEN_MAIN_STYLE_STORAGE_KEY);
  } else {
    window.localStorage.setItem(IMAGEGEN_MAIN_STYLE_STORAGE_KEY, id);
  }
}
