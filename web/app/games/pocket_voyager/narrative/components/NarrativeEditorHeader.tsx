"use client";

import type { ReactElement } from "react";

type Props = {
  missionId: string;
  introCount: number;
  returnCount: number;
  selectedCount: number;
};

export function NarrativeEditorHeader({
  missionId,
  introCount,
  returnCount,
  selectedCount,
}: Props): ReactElement {
  return (
    <header className="narrative-editor-header">
      <div className="narrative-editor-header-main">
        <p className="narrative-editor-mission-id narrative-editor-mission-id--primary" title={missionId}>
          {missionId}
        </p>
      </div>
      <div className="narrative-editor-stats" aria-label="Mission summary">
        <span className="narrative-stat">
          <span className="narrative-stat-value">{introCount}</span>
          <span className="narrative-stat-label">Intro</span>
        </span>
        <span className="narrative-stat">
          <span className="narrative-stat-value">{returnCount}</span>
          <span className="narrative-stat-label">Return</span>
        </span>
        {selectedCount > 0 ? (
          <span className="narrative-stat narrative-stat--accent">
            <span className="narrative-stat-value">{selectedCount}</span>
            <span className="narrative-stat-label">Selected</span>
          </span>
        ) : null}
      </div>
    </header>
  );
}
