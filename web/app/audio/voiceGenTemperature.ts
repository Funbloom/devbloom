const VOICE_GEN_TEMPERATURE_KEY = "voice_gen_temperature_v1";
const DEFAULT_TEMPERATURE = 1;

export function readVoiceGenTemperature(): number {
  if (typeof window === "undefined") {
    return DEFAULT_TEMPERATURE;
  }
  const raw = window.localStorage.getItem(VOICE_GEN_TEMPERATURE_KEY);
  if (!raw) {
    return DEFAULT_TEMPERATURE;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 2) {
    return DEFAULT_TEMPERATURE;
  }
  return parsed;
}

export function writeVoiceGenTemperature(value: number): void {
  if (typeof window === "undefined") {
    return;
  }
  const clamped = Math.min(2, Math.max(0.05, value));
  try {
    window.localStorage.setItem(VOICE_GEN_TEMPERATURE_KEY, String(clamped));
  } catch {
    // ignore quota / private mode
  }
}

export function isInworldTts2Model(modelId: string): boolean {
  return modelId.trim() === "inworld-tts-2";
}

export function synthesizeTemperatureForModel(modelId: string, temperature: number): number | undefined {
  if (isInworldTts2Model(modelId)) {
    return undefined;
  }
  const clamped = Math.min(2, Math.max(0.05, temperature));
  return clamped;
}
