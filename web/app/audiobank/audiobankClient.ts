import { fetchApi } from "../lib/api";

export type AudiobankClip = {
  id: string;
  filename: string;
  storage_path: string;
  public_url: string;
  category: string;
  tags: string[];
  content_type: string;
  file_size_bytes: number;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
};

export type AudiobankCategory = {
  category: string;
  clip_count: number;
};

export async function fetchAudiobankCategories(): Promise<AudiobankCategory[]> {
  const response = await fetchApi("/audiobank/categories");
  if (!response.ok) {
    throw new Error(`Failed to load categories (${response.status})`);
  }
  const data = (await response.json()) as AudiobankCategory[];
  return Array.isArray(data) ? data : [];
}

export async function fetchAudiobankClips(options?: {
  category?: string;
  q?: string;
}): Promise<AudiobankClip[]> {
  const params = new URLSearchParams();
  if (options?.category) {
    params.set("category", options.category);
  }
  if (options?.q) {
    params.set("q", options.q);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetchApi(`/audiobank/clips${suffix}`);
  if (!response.ok) {
    throw new Error(`Failed to load clips (${response.status})`);
  }
  const data = (await response.json()) as AudiobankClip[];
  return Array.isArray(data) ? data : [];
}

export class AudiobankImportSkippedError extends Error {
  filename: string;

  constructor(filename: string, message: string) {
    super(message);
    this.name = "AudiobankImportSkippedError";
    this.filename = filename;
  }
}

export async function importAudiobankFile(
  file: File,
  options?: { categoryOverride?: string; overwrite?: boolean }
): Promise<AudiobankClip> {
  const form = new FormData();
  form.append("file", file, file.name);
  if (options?.categoryOverride && options.categoryOverride.trim()) {
    form.append("category", options.categoryOverride.trim());
  }
  if (options?.overwrite) {
    form.append("overwrite", "true");
  }
  const response = await fetchApi("/audiobank/import", {
    method: "POST",
    body: form,
  });
  if (response.status === 409) {
    const detail = await response.text();
    throw new AudiobankImportSkippedError(
      file.name,
      detail || `Clip already exists in Audiobank: ${file.name}`
    );
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Import failed (${response.status})`);
  }
  return (await response.json()) as AudiobankClip;
}

export async function patchAudiobankClip(
  clipId: string,
  body: { tags?: string[]; category?: string }
): Promise<AudiobankClip> {
  const response = await fetchApi(`/audiobank/clips/${encodeURIComponent(clipId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Update failed (${response.status})`);
  }
  return (await response.json()) as AudiobankClip;
}

export async function deleteAudiobankClip(clipId: string): Promise<void> {
  const response = await fetchApi(`/audiobank/clips/${encodeURIComponent(clipId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Delete failed (${response.status})`);
  }
}

export function isAudiobankAudioFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return lower.endsWith(".wav") || lower.endsWith(".mp3");
}

export async function fetchAudiobankClipAudioBlob(
  clipId: string,
  format?: "wav" | "mp3"
): Promise<Blob> {
  const params = new URLSearchParams();
  if (format) {
    params.set("format", format);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetchApi(`/audiobank/clips/${encodeURIComponent(clipId)}/audio${suffix}`);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Audio load failed (${response.status})`);
  }
  return response.blob();
}

export async function downloadAudiobankClipFile(clip: AudiobankClip): Promise<void> {
  const blob = await fetchAudiobankClipAudioBlob(clip.id);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = clip.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
