const VOICE_GEN_BATCH_MODE_KEY = "voice_gen_batch_mp3_mode_v1";

export type BatchExistingMp3Mode = "auto" | "skip" | "overwrite";

export function readVoiceGenBatchMp3Mode(): BatchExistingMp3Mode {
  if (typeof window === "undefined") {
    return "auto";
  }
  const raw = window.localStorage.getItem(VOICE_GEN_BATCH_MODE_KEY);
  if (raw === "skip" || raw === "overwrite" || raw === "auto") {
    return raw;
  }
  return "auto";
}

export function writeVoiceGenBatchMp3Mode(mode: BatchExistingMp3Mode): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(VOICE_GEN_BATCH_MODE_KEY, mode);
  } catch {
    // ignore quota / private mode
  }
}
