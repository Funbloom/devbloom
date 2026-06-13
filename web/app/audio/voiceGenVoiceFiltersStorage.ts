import {
  emptyVoiceGenVoiceFilters,
  normalizeVoiceGenVoiceFilters,
  type VoiceGenVoiceFilters,
} from "./voiceGenVoiceFilters";

const VOICE_GEN_VOICE_FILTERS_KEY = "voice_gen_voice_filters_v1";

export function readVoiceGenVoiceFilters(): VoiceGenVoiceFilters {
  if (typeof window === "undefined") {
    return emptyVoiceGenVoiceFilters();
  }
  const raw: string | null = window.localStorage.getItem(VOICE_GEN_VOICE_FILTERS_KEY);
  if (!raw) {
    return emptyVoiceGenVoiceFilters();
  }
  try {
    return normalizeVoiceGenVoiceFilters(JSON.parse(raw));
  } catch {
    return emptyVoiceGenVoiceFilters();
  }
}

export function writeVoiceGenVoiceFilters(filters: VoiceGenVoiceFilters): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const normalized = normalizeVoiceGenVoiceFilters(filters);
    if (voiceGenVoiceFiltersStoredEmpty(normalized)) {
      window.localStorage.removeItem(VOICE_GEN_VOICE_FILTERS_KEY);
      return;
    }
    window.localStorage.setItem(VOICE_GEN_VOICE_FILTERS_KEY, JSON.stringify(normalized));
  } catch {
    // ignore quota / private mode
  }
}

function voiceGenVoiceFiltersStoredEmpty(filters: VoiceGenVoiceFilters): boolean {
  return (
    filters.search.trim().length === 0 &&
    filters.sources.length === 0 &&
    filters.langCodes.length === 0 &&
    filters.genders.length === 0 &&
    filters.ageGroups.length === 0 &&
    filters.tags.length === 0 &&
    filters.categories.length === 0
  );
}
