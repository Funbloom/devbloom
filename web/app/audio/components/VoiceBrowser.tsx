"use client";

import { useCallback, useMemo, useState } from "react";
import type { ReactElement } from "react";

import type { InworldVoiceOption } from "../client";
import {
  buildVoiceFilterFacets,
  emptyVoiceGenVoiceFilters,
  formatVoicePropertyLabel,
  toggleVoiceFilterValue,
  voiceGenVoiceFiltersActive,
  voiceMatchesFilters,
  type VoiceFilterFacet,
  type VoiceGenVoiceFilters,
} from "../voiceGenVoiceFilters";
import { readVoiceGenVoiceFilters, writeVoiceGenVoiceFilters } from "../voiceGenVoiceFiltersStorage";

type Props = {
  voices: InworldVoiceOption[];
  selectedVoiceId: string;
  loading: boolean;
  disabled: boolean;
  onSelectVoice: (voiceId: string) => void;
  onPreviewVoice: (voiceId: string) => void;
};

function FilterChipGroup(props: {
  title: string;
  facets: VoiceFilterFacet[];
  selected: string[];
  disabled: boolean;
  onToggle: (value: string) => void;
}): ReactElement | null {
  if (props.facets.length === 0) {
    return null;
  }
  return (
    <div className="voicegen-filter-group">
      <div className="voicegen-filter-group-title">{props.title}</div>
      <div className="voicegen-filter-chips">
        {props.facets.map((facet) => {
          const active = props.selected.includes(facet.value);
          return (
            <button
              key={`${props.title}-${facet.value}`}
              type="button"
              className={active ? "voicegen-filter-chip voicegen-filter-chip--active" : "voicegen-filter-chip"}
              disabled={props.disabled}
              aria-pressed={active}
              onClick={() => {
                props.onToggle(facet.value);
              }}
            >
              <span>{formatVoicePropertyLabel(facet.value)}</span>
              <span className="voicegen-filter-chip-count">{facet.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VoiceBrowserCard(props: {
  voice: InworldVoiceOption;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onPreview: () => void;
}): ReactElement {
  const { voice } = props;
  return (
    <div
      className={
        props.selected ? "voicegen-voice-card voicegen-voice-card--selected" : "voicegen-voice-card"
      }
    >
      <button
        type="button"
        className="voicegen-voice-card-main"
        disabled={props.disabled}
        onClick={props.onSelect}
      >
        <div className="voicegen-voice-card-header">
          <span className="voicegen-voice-card-name">{voice.displayName}</span>
          <span className="voicegen-voice-card-id">{voice.voiceId}</span>
        </div>
        {voice.description ? (
          <p className="voicegen-voice-card-description">{voice.description}</p>
        ) : null}
        <div className="voicegen-voice-card-meta">
          {voice.source ? (
            <span className="voicegen-voice-meta-chip">{voice.source}</span>
          ) : null}
          {voice.langCode ? (
            <span className="voicegen-voice-meta-chip">{formatVoicePropertyLabel(voice.langCode)}</span>
          ) : null}
          {voice.gender ? (
            <span className="voicegen-voice-meta-chip">{formatVoicePropertyLabel(voice.gender)}</span>
          ) : null}
          {voice.ageGroup ? (
            <span className="voicegen-voice-meta-chip">{formatVoicePropertyLabel(voice.ageGroup)}</span>
          ) : null}
          {voice.categories.map((category) => (
            <span key={`${voice.voiceId}-cat-${category}`} className="voicegen-voice-meta-chip">
              {formatVoicePropertyLabel(category)}
            </span>
          ))}
        </div>
        {voice.tags.length > 0 ? (
          <div className="voicegen-voice-card-tags">
            {voice.tags.map((tag) => (
              <span key={`${voice.voiceId}-tag-${tag}`} className="voicegen-voice-tag-chip">
                {formatVoicePropertyLabel(tag)}
              </span>
            ))}
          </div>
        ) : null}
      </button>
      <button
        type="button"
        className="voicegen-voice-preview-btn"
        disabled={props.disabled}
        aria-label={`Preview ${voice.displayName}`}
        title="Preview voice"
        onClick={(event) => {
          event.stopPropagation();
          props.onPreview();
        }}
      >
        ▶
      </button>
    </div>
  );
}

export function VoiceBrowser(props: Props): ReactElement {
  const [filters, setFilters] = useState<VoiceGenVoiceFilters>(() => readVoiceGenVoiceFilters());

  const facets = useMemo(() => buildVoiceFilterFacets(props.voices), [props.voices]);
  const filteredVoices = useMemo(
    () => props.voices.filter((voice) => voiceMatchesFilters(voice, filters)),
    [props.voices, filters],
  );
  const filtersActive = voiceGenVoiceFiltersActive(filters);

  const updateFilters = useCallback((next: VoiceGenVoiceFilters): void => {
    setFilters(next);
    writeVoiceGenVoiceFilters(next);
  }, []);

  const clearFilters = useCallback((): void => {
    const cleared = emptyVoiceGenVoiceFilters();
    setFilters(cleared);
    writeVoiceGenVoiceFilters(cleared);
  }, []);

  return (
    <div className="voicegen-browser">
      <div className="voicegen-browser-toolbar">
        <input
          type="search"
          className="imagegen-select voicegen-browser-search"
          placeholder="Search name, description, tags…"
          value={filters.search}
          disabled={props.disabled || props.loading}
          onChange={(event) => {
            updateFilters({ ...filters, search: event.target.value });
          }}
        />
        <div className="voicegen-browser-summary">
          <span>
            {props.loading
              ? "Loading voices…"
              : `${filteredVoices.length} of ${props.voices.length} voice(s)`}
          </span>
          {filtersActive ? (
            <button
              type="button"
              className="voicegen-clear-filters-btn voicegen-clear-filters-btn--toolbar"
              disabled={props.disabled || props.loading}
              onClick={clearFilters}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <div className="voicegen-browser-layout">
        <aside className="voicegen-browser-filters">
          <div className="voicegen-browser-filters-header">
            <h3 className="voicegen-browser-filters-title">Filters</h3>
            <button
              type="button"
              className="voicegen-clear-filters-btn voicegen-clear-filters-btn--panel"
              disabled={!filtersActive || props.disabled || props.loading}
              onClick={clearFilters}
            >
              Clear filters
            </button>
          </div>
          <FilterChipGroup
            title="Source"
            facets={facets.sources}
            selected={filters.sources}
            disabled={props.disabled || props.loading}
            onToggle={(value) => {
              updateFilters({
                ...filters,
                sources: toggleVoiceFilterValue(filters.sources, value),
              });
            }}
          />
          <FilterChipGroup
            title="Language"
            facets={facets.langCodes}
            selected={filters.langCodes}
            disabled={props.disabled || props.loading}
            onToggle={(value) => {
              updateFilters({
                ...filters,
                langCodes: toggleVoiceFilterValue(filters.langCodes, value),
              });
            }}
          />
          <FilterChipGroup
            title="Gender"
            facets={facets.genders}
            selected={filters.genders}
            disabled={props.disabled || props.loading}
            onToggle={(value) => {
              updateFilters({
                ...filters,
                genders: toggleVoiceFilterValue(filters.genders, value),
              });
            }}
          />
          <FilterChipGroup
            title="Age group"
            facets={facets.ageGroups}
            selected={filters.ageGroups}
            disabled={props.disabled || props.loading}
            onToggle={(value) => {
              updateFilters({
                ...filters,
                ageGroups: toggleVoiceFilterValue(filters.ageGroups, value),
              });
            }}
          />
          <FilterChipGroup
            title="Categories"
            facets={facets.categories}
            selected={filters.categories}
            disabled={props.disabled || props.loading}
            onToggle={(value) => {
              updateFilters({
                ...filters,
                categories: toggleVoiceFilterValue(filters.categories, value),
              });
            }}
          />
          <FilterChipGroup
            title="Tags"
            facets={facets.tags}
            selected={filters.tags}
            disabled={props.disabled || props.loading}
            onToggle={(value) => {
              updateFilters({
                ...filters,
                tags: toggleVoiceFilterValue(filters.tags, value),
              });
            }}
          />
        </aside>

        <div className="voicegen-voice-list-wrap">
          {!props.loading && props.voices.length === 0 ? (
            <div className="voicegen-voice-empty">No voices loaded.</div>
          ) : null}
          {!props.loading && props.voices.length > 0 && filteredVoices.length === 0 ? (
            <div className="voicegen-voice-empty">No voices match the current filters.</div>
          ) : null}
          <div className="voicegen-voice-list">
            {filteredVoices.map((voice) => (
              <VoiceBrowserCard
                key={voice.voiceId}
                voice={voice}
                selected={voice.voiceId === props.selectedVoiceId}
                disabled={props.disabled || props.loading}
                onSelect={() => {
                  props.onSelectVoice(voice.voiceId);
                }}
                onPreview={() => {
                  props.onPreviewVoice(voice.voiceId);
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
