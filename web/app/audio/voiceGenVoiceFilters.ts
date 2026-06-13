import type { InworldVoiceOption } from "./client";

export type VoiceGenVoiceFilters = {
  search: string;
  sources: string[];
  langCodes: string[];
  genders: string[];
  ageGroups: string[];
  tags: string[];
  categories: string[];
};

export type VoiceFilterFacet = {
  value: string;
  count: number;
};

export type VoiceFilterFacets = {
  sources: VoiceFilterFacet[];
  langCodes: VoiceFilterFacet[];
  genders: VoiceFilterFacet[];
  ageGroups: VoiceFilterFacet[];
  tags: VoiceFilterFacet[];
  categories: VoiceFilterFacet[];
};

export function emptyVoiceGenVoiceFilters(): VoiceGenVoiceFilters {
  return {
    search: "",
    sources: [],
    langCodes: [],
    genders: [],
    ageGroups: [],
    tags: [],
    categories: [],
  };
}

export function formatVoicePropertyLabel(value: string): string {
  return value.trim().replace(/_/g, " ");
}

function facetListFromCounts(counts: Record<string, number>): VoiceFilterFacet[] {
  return Object.entries(counts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

export function buildVoiceFilterFacets(voices: InworldVoiceOption[]): VoiceFilterFacets {
  const sources: Record<string, number> = {};
  const langCodes: Record<string, number> = {};
  const genders: Record<string, number> = {};
  const ageGroups: Record<string, number> = {};
  const tags: Record<string, number> = {};
  const categories: Record<string, number> = {};

  for (const voice of voices) {
    const source = voice.source.trim();
    if (source) {
      sources[source] = (sources[source] ?? 0) + 1;
    }
    const langCode = voice.langCode.trim();
    if (langCode) {
      langCodes[langCode] = (langCodes[langCode] ?? 0) + 1;
    }
    const gender = voice.gender.trim();
    if (gender) {
      genders[gender] = (genders[gender] ?? 0) + 1;
    }
    const ageGroup = voice.ageGroup.trim();
    if (ageGroup) {
      ageGroups[ageGroup] = (ageGroups[ageGroup] ?? 0) + 1;
    }
    for (const tag of voice.tags) {
      tags[tag] = (tags[tag] ?? 0) + 1;
    }
    for (const category of voice.categories) {
      categories[category] = (categories[category] ?? 0) + 1;
    }
  }

  return {
    sources: facetListFromCounts(sources),
    langCodes: facetListFromCounts(langCodes),
    genders: facetListFromCounts(genders),
    ageGroups: facetListFromCounts(ageGroups),
    tags: facetListFromCounts(tags),
    categories: facetListFromCounts(categories),
  };
}

function matchesSearch(voice: InworldVoiceOption, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) {
    return true;
  }
  const haystack = [
    voice.displayName,
    voice.voiceId,
    voice.label,
    voice.description,
    voice.source,
    voice.langCode,
    voice.gender,
    voice.ageGroup,
    ...voice.tags,
    ...voice.categories,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function matchesFacetSelection(selected: string[], value: string): boolean {
  if (selected.length === 0) {
    return true;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return selected.includes(trimmed);
}

function matchesTagOrCategorySelection(selected: string[], values: string[]): boolean {
  if (selected.length === 0) {
    return true;
  }
  if (values.length === 0) {
    return false;
  }
  return selected.some((item) => values.includes(item));
}

export function voiceMatchesFilters(voice: InworldVoiceOption, filters: VoiceGenVoiceFilters): boolean {
  if (!matchesSearch(voice, filters.search)) {
    return false;
  }
  if (!matchesFacetSelection(filters.sources, voice.source)) {
    return false;
  }
  if (!matchesFacetSelection(filters.langCodes, voice.langCode)) {
    return false;
  }
  if (!matchesFacetSelection(filters.genders, voice.gender)) {
    return false;
  }
  if (!matchesFacetSelection(filters.ageGroups, voice.ageGroup)) {
    return false;
  }
  if (!matchesTagOrCategorySelection(filters.tags, voice.tags)) {
    return false;
  }
  if (!matchesTagOrCategorySelection(filters.categories, voice.categories)) {
    return false;
  }
  return true;
}

export function voiceGenVoiceFiltersActive(filters: VoiceGenVoiceFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.sources.length > 0 ||
    filters.langCodes.length > 0 ||
    filters.genders.length > 0 ||
    filters.ageGroups.length > 0 ||
    filters.tags.length > 0 ||
    filters.categories.length > 0
  );
}

export function toggleVoiceFilterValue(values: string[], value: string): string[] {
  if (values.includes(value)) {
    return values.filter((item) => item !== value);
  }
  return [...values, value];
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item: unknown) => (typeof item === "string" ? item.trim() : ""))
    .filter((item: string) => item.length > 0);
}

export function normalizeVoiceGenVoiceFilters(raw: unknown): VoiceGenVoiceFilters {
  if (!raw || typeof raw !== "object") {
    return emptyVoiceGenVoiceFilters();
  }
  const row = raw as Record<string, unknown>;
  return {
    search: typeof row.search === "string" ? row.search : "",
    sources: normalizeStringArray(row.sources),
    langCodes: normalizeStringArray(row.langCodes),
    genders: normalizeStringArray(row.genders),
    ageGroups: normalizeStringArray(row.ageGroups),
    tags: normalizeStringArray(row.tags),
    categories: normalizeStringArray(row.categories),
  };
}
