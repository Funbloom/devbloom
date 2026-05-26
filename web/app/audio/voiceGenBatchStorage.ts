import type { NarrationBatchClip } from "./voiceBatch";

const VOICE_GEN_BATCH_STORAGE_KEY = "voice_gen_batch_v1";

export type VoiceGenBatchPersisted = {
  fileName: string;
  jsonText: string;
  clips: NarrationBatchClip[];
  /** Absolute path on disk (local agent pick); used to reload before batch generate. */
  filePath?: string;
};

export function readVoiceGenBatch(): VoiceGenBatchPersisted | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw: string | null = window.localStorage.getItem(VOICE_GEN_BATCH_STORAGE_KEY);
  if (!raw?.trim()) {
    return null;
  }
  try {
    const data = JSON.parse(raw) as VoiceGenBatchPersisted;
    if (!data || typeof data !== "object") {
      return null;
    }
    const fileName = typeof data.fileName === "string" ? data.fileName : "";
    const jsonText = typeof data.jsonText === "string" ? data.jsonText : "";
    if (!jsonText.trim()) {
      return null;
    }
    const clips = Array.isArray(data.clips) ? data.clips : [];
    const filePath = typeof data.filePath === "string" ? data.filePath.trim() : "";
    return { fileName, jsonText, clips, filePath: filePath || undefined };
  } catch {
    return null;
  }
}

export function writeVoiceGenBatch(payload: VoiceGenBatchPersisted): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(VOICE_GEN_BATCH_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export function clearVoiceGenBatch(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(VOICE_GEN_BATCH_STORAGE_KEY);
  } catch {
    // ignore
  }
}
