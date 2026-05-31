"use client";

import { useEffect, useRef, useState } from "react";
import type { AudiobankClip } from "../audiobankClient";

type Props = {
  clip: AudiobankClip;
  selected: boolean;
  playing: boolean;
  onSelect: (clip: AudiobankClip) => void;
  onTogglePlay: (clip: AudiobankClip) => void;
  onTagsChange: (clipId: string, tags: string[]) => void;
  onDelete: (clip: AudiobankClip) => void;
  deleting: boolean;
  canManage: boolean;
  showDownload: boolean;
  onDownload: (clip: AudiobankClip) => void;
  downloading: boolean;
};

export function AudiobankClipCard({
  clip,
  selected,
  playing,
  onSelect,
  onTogglePlay,
  onTagsChange,
  onDelete,
  deleting,
  canManage,
  showDownload,
  onDownload,
  downloading,
}: Props) {
  const [tagDraft, setTagDraft] = useState<string>("");
  const debounceRef = useRef<number | null>(null);
  const [localTags, setLocalTags] = useState<string[]>(clip.tags);

  useEffect(() => {
    setLocalTags(clip.tags);
  }, [clip.tags]);

  const scheduleTagSave = (nextTags: string[]) => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      onTagsChange(clip.id, nextTags);
    }, 400);
  };

  const removeTag = (tag: string) => {
    const next = localTags.filter((item) => item !== tag);
    setLocalTags(next);
    scheduleTagSave(next);
  };

  const addTag = () => {
    const value = tagDraft.trim().toLowerCase();
    setTagDraft("");
    if (!value || localTags.includes(value)) {
      return;
    }
    const next = [...localTags, value];
    setLocalTags(next);
    scheduleTagSave(next);
  };

  return (
    <div
      className={`audiobank-clip-card${selected ? " audiobank-clip-card--selected" : ""}`}
      onClick={() => {
        onSelect(clip);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(clip);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="audiobank-clip-header">
        <button
          type="button"
          className="audiobank-play-btn"
          title={playing ? "Stop" : "Play"}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePlay(clip);
          }}
        >
          {playing ? "■" : "▶"}
        </button>
        <span className="audiobank-clip-filename">{clip.filename}</span>
        <div className="audiobank-clip-actions">
          {showDownload && (
            <button
              type="button"
              className="audiobank-download-btn"
              title="Download clip"
              aria-label={`Download ${clip.filename}`}
              disabled={downloading}
              onClick={(event) => {
                event.stopPropagation();
                onDownload(clip);
              }}
            >
              {downloading ? "…" : "↓"}
            </button>
          )}
          {canManage && (
            <button
              type="button"
              className="audiobank-delete-btn"
              title="Delete clip"
              aria-label={`Delete ${clip.filename}`}
              disabled={deleting}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(clip);
              }}
            >
              {deleting ? "…" : "×"}
            </button>
          )}
        </div>
      </div>
      <div className="audiobank-clip-category">{clip.category}</div>
      <div
        className="audiobank-tag-list"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {localTags.map((tag) => (
          <span key={tag} className="audiobank-tag-chip">
            {tag}
            {canManage && (
              <button
                type="button"
                className="audiobank-tag-remove"
                aria-label={`Remove tag ${tag}`}
                onClick={() => {
                  removeTag(tag);
                }}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {canManage && (
          <input
            type="text"
            className="audiobank-tag-input"
            placeholder="+ tag"
            value={tagDraft}
            onChange={(event) => {
              setTagDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTag();
              }
            }}
            onBlur={() => {
              if (tagDraft.trim()) {
                addTag();
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
