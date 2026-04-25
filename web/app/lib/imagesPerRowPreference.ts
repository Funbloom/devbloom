const IMAGES_PER_ROW_STORAGE_KEY = "image_grid_images_per_row_v1";
const MIN_IMAGES_PER_ROW = 1;
const MAX_IMAGES_PER_ROW = 8;
const DEFAULT_IMAGES_PER_ROW = 3;

function clampImagesPerRow(value: number): number {
  if (value < MIN_IMAGES_PER_ROW) {
    return MIN_IMAGES_PER_ROW;
  }
  if (value > MAX_IMAGES_PER_ROW) {
    return MAX_IMAGES_PER_ROW;
  }
  return value;
}

export function readGlobalImagesPerRow(): number {
  if (typeof window === "undefined") {
    return DEFAULT_IMAGES_PER_ROW;
  }
  const raw: string | null = window.localStorage.getItem(IMAGES_PER_ROW_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_IMAGES_PER_ROW;
  }
  const parsed: number = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_IMAGES_PER_ROW;
  }
  return clampImagesPerRow(parsed);
}

export function writeGlobalImagesPerRow(nextValue: number): void {
  if (typeof window === "undefined") {
    return;
  }
  const clamped: number = clampImagesPerRow(nextValue);
  try {
    window.localStorage.setItem(IMAGES_PER_ROW_STORAGE_KEY, String(clamped));
  } catch {
    // ignore quota/private-mode errors
  }
}
