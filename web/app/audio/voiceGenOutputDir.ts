const VOICE_GEN_OUTPUT_DIR_KEY = "voice_gen_output_dir_v1";

export function readVoiceGenOutputDir(): string {
  if (typeof window === "undefined") {
    return "";
  }
  const raw: string | null = window.localStorage.getItem(VOICE_GEN_OUTPUT_DIR_KEY);
  return raw?.trim() ?? "";
}

export function writeVoiceGenOutputDir(path: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const trimmed: string = path.trim();
  try {
    if (trimmed) {
      window.localStorage.setItem(VOICE_GEN_OUTPUT_DIR_KEY, trimmed);
    } else {
      window.localStorage.removeItem(VOICE_GEN_OUTPUT_DIR_KEY);
    }
  } catch {
    // ignore quota / private mode
  }
}
