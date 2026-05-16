export type TileImageSizePreset = "square" | "landscape" | "portrait";

export const TILE_IMAGE_SIZE_OPTIONS: { value: TileImageSizePreset; label: string }[] = [
  { value: "landscape", label: "Landscape" },
  { value: "square", label: "Square" },
  { value: "portrait", label: "Portrait" },
];

/** Match Image Gen / API storyboard_tile_dimensions (1024 base, 16:9 / 9:16). */
export function tileDimensionsFromPreset(sizePreset: TileImageSizePreset): { width: number; height: number } {
  const base = 1024;
  if (sizePreset === "landscape") {
    return { width: base, height: Math.max(1, Math.round((base * 9) / 16)) };
  }
  if (sizePreset === "portrait") {
    return { width: Math.max(1, Math.round((base * 9) / 16)), height: base };
  }
  return { width: base, height: base };
}
