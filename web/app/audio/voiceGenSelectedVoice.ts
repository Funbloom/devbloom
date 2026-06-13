const VOICE_GEN_SELECTED_VOICE_KEY = "voice_gen_selected_voice_v1";

export function readVoiceGenSelectedVoice(): string {
  if (typeof window === "undefined") {
    return "";
  }
  const raw: string | null = window.localStorage.getItem(VOICE_GEN_SELECTED_VOICE_KEY);
  return raw?.trim() ?? "";
}

export function writeVoiceGenSelectedVoice(voiceId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const trimmed: string = voiceId.trim();
  try {
    if (trimmed) {
      window.localStorage.setItem(VOICE_GEN_SELECTED_VOICE_KEY, trimmed);
    } else {
      window.localStorage.removeItem(VOICE_GEN_SELECTED_VOICE_KEY);
    }
  } catch {
    // ignore quota / private mode
  }
}
