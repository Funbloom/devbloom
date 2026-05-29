"use client";

import { useMemo } from "react";
import type { AudiobankClip } from "../audiobankClient";
import { buildCategoryTree, clipMatchesCategory, clipMatchesFilter } from "../audiobankUtils";
import { AudiobankCategoryTree } from "./AudiobankCategoryTree";
import { AudiobankClipCard } from "./AudiobankClipCard";
import { AudiobankFilterBar } from "./AudiobankFilterBar";

type Props = {
  clips: AudiobankClip[];
  categories: Array<{ category: string; clip_count: number }>;
  filterQuery: string;
  selectedCategory: string;
  selectedClipId: string;
  playingClipId: string;
  onFilterChange: (value: string) => void;
  onCategorySelect: (category: string) => void;
  onClipSelect: (clip: AudiobankClip) => void;
  onTogglePlay: (clip: AudiobankClip) => void;
  onTagsChange: (clipId: string, tags: string[]) => void;
  onDelete: (clip: AudiobankClip) => void;
  deletingClipId: string;
  showDownload: boolean;
  onDownload: (clip: AudiobankClip) => void;
  downloadingClipId: string;
};

export function AudiobankBrowser({
  clips,
  categories,
  filterQuery,
  selectedCategory,
  selectedClipId,
  playingClipId,
  onFilterChange,
  onCategorySelect,
  onClipSelect,
  onTogglePlay,
  onTagsChange,
  onDelete,
  deletingClipId,
  showDownload,
  onDownload,
  downloadingClipId,
}: Props) {
  const treeNodes = useMemo(() => buildCategoryTree(categories), [categories]);
  const visibleClips = useMemo(() => {
    return clips.filter(
      (clip) => clipMatchesCategory(clip.category, selectedCategory) && clipMatchesFilter(clip, filterQuery)
    );
  }, [clips, selectedCategory, filterQuery]);

  return (
    <div className="audiobank-browser">
      <AudiobankFilterBar value={filterQuery} onChange={onFilterChange} />
      <div className="audiobank-browser-body">
        <aside className="audiobank-browser-sidebar">
          <h3 className="audiobank-sidebar-title">Categories</h3>
          <AudiobankCategoryTree
            nodes={treeNodes}
            selectedCategory={selectedCategory}
            totalClipCount={clips.length}
            onSelect={onCategorySelect}
          />
        </aside>
        <div className="audiobank-clip-grid-wrap">
          {visibleClips.length === 0 ? (
            <div className="audiobank-empty">No clips match the current filter.</div>
          ) : (
            <div className="audiobank-clip-grid">
              {visibleClips.map((clip) => (
                <AudiobankClipCard
                  key={clip.id}
                  clip={clip}
                  selected={clip.id === selectedClipId}
                  playing={clip.id === playingClipId}
                  onSelect={onClipSelect}
                  onTogglePlay={onTogglePlay}
                  onTagsChange={onTagsChange}
                  onDelete={onDelete}
                  deleting={clip.id === deletingClipId}
                  showDownload={showDownload}
                  onDownload={onDownload}
                  downloading={clip.id === downloadingClipId}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
