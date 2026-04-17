/**
 * In-memory panel settings for Image Generation so navigating to /imageGen/edit and back
 * does not reset the left panel, and edit jobs use the same size (portrait/landscape/square)
 * and quality tier as Generate.
 */

export type ImagegenPanelSnapshot = {
  sizePreset: "square" | "portrait" | "landscape";
  qualityPreset: "high" | "medium" | "low";
  /** Same as `imageDefaults.quality` on the Image Gen page (server default can override). */
  imageDefaultsQuality: "high" | "medium" | "low";
  imageModel: string;
  openAiQuality: string;
  openAiStyle: string;
  openAiTransparent: boolean;
};

let panelSnapshot: ImagegenPanelSnapshot | null = null;

const editDraftByImageId = new Map<string, string>();

export function capturePanelSnapshot(snapshot: ImagegenPanelSnapshot): void {
  panelSnapshot = { ...snapshot };
}

export function getPanelSnapshot(): ImagegenPanelSnapshot | null {
  return panelSnapshot;
}

/** Matches `handleGenerate` / `handleGenerateCharacter` width×height from presets. */
export function dimensionsFromSnapshot(s: ImagegenPanelSnapshot): { width: number; height: number } {
  const sizeMap: Record<"high" | "medium" | "low", number> = {
    high: 1024,
    medium: 512,
    low: 256,
  };
  const effectiveQuality = s.imageDefaultsQuality || s.qualityPreset;
  const baseSize = sizeMap[effectiveQuality] ?? 1024;
  let width = baseSize;
  let height = baseSize;
  if (s.sizePreset === "landscape") {
    width = baseSize;
    height = Math.max(1, Math.round((baseSize * 9) / 16));
  } else if (s.sizePreset === "portrait") {
    width = Math.max(1, Math.round((baseSize * 9) / 16));
    height = baseSize;
  }
  return { width, height };
}

export function getEditDraft(imageId: string): string | undefined {
  return editDraftByImageId.get(imageId);
}

export function setEditDraft(imageId: string, text: string): void {
  if (!imageId.trim()) {
    return;
  }
  editDraftByImageId.set(imageId, text);
}

export function clearEditDraft(imageId: string): void {
  editDraftByImageId.delete(imageId);
}
