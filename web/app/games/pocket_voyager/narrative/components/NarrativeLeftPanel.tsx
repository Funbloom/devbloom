"use client";

import type { ChangeEvent, ReactElement } from "react";

import { StudioActivityBox } from "../../../../components/studio/StudioActivityBox";
import type { StudioActivity } from "../../../../components/studio/types";
import type { ImproveProposal } from "./ImproveReviewPanel";

type Props = {
  missionsPathLabel: string;
  dialoguesPathLabel: string;
  missionsRelativePath: string;
  dialoguesRelativePath: string;
  aiImprovePrompt: string;
  dirty: boolean;
  agentAvailable: boolean;
  fallbackMode: boolean;
  autoSaveEnabled: boolean;
  working: boolean;
  activity: StudioActivity;
  validationErrors: string[];
  orphanCount: number;
  onMissionsRelativeChange: (value: string) => void;
  onDialoguesRelativeChange: (value: string) => void;
  onAiImprovePromptChange: (value: string) => void;
  onPickMissions: () => void;
  onPickDialogues: () => void;
  onLoad: () => void;
  onImprove: () => void;
  selectedLineCount: number;
  onUploadMissions: (file: File) => void;
  onUploadDialogues: (file: File) => void;
};

export function NarrativeLeftPanel({
  missionsPathLabel,
  dialoguesPathLabel,
  missionsRelativePath,
  dialoguesRelativePath,
  aiImprovePrompt,
  dirty,
  agentAvailable,
  fallbackMode,
  autoSaveEnabled,
  working,
  activity,
  validationErrors,
  orphanCount,
  onMissionsRelativeChange,
  onDialoguesRelativeChange,
  onAiImprovePromptChange,
  onPickMissions,
  onPickDialogues,
  onLoad,
  onImprove,
  selectedLineCount,
  onUploadMissions,
  onUploadDialogues,
}: Props): ReactElement {
  const handleMissionsUpload = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) {
      onUploadMissions(file);
    }
    event.target.value = "";
  };

  const handleDialoguesUpload = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) {
      onUploadDialogues(file);
    }
    event.target.value = "";
  };

  return (
    <div className="narrative-left imagegen-left-inner">
      <div className="narrative-left-scroll">
        <header className="narrative-left-intro">
          <h2 className="imagegen-left-title">Narrative</h2>
          <p className="narrative-left-tagline">
            Edit story missions and dialogue for Pocket Voyager. Changes save automatically when the local agent is
            connected.
          </p>
        </header>

        {(fallbackMode || (dirty && !autoSaveEnabled)) && (
          <div className="narrative-alerts">
            {fallbackMode ? (
              <div className="narrative-alert narrative-alert--warn" role="status">
                Local agent offline — upload JSON or start the agent to save in Unity.
              </div>
            ) : null}
            {dirty && !autoSaveEnabled ? (
              <div className="narrative-alert narrative-alert--warn" role="status">
                Unsaved changes (connect local agent to auto-save)
              </div>
            ) : null}
          </div>
        )}

        {autoSaveEnabled ? (
          <p className="narrative-autosave-hint" role="status">
            Edits save automatically to your Unity project.
          </p>
        ) : null}

        <section className="narrative-left-group imagegen-panel">
          <h3 className="narrative-left-group-title imagegen-panel-title">Story files</h3>
          <div className="imagegen-panel-body">
            <div className="narrative-file-field">
              <span className="imagegen-label">Missions JSON</span>
              <div className="narrative-file-row">
                <input
                  type="text"
                  className="narrative-file-input"
                  value={missionsRelativePath}
                  onChange={(e) => onMissionsRelativeChange(e.target.value)}
                  disabled={working}
                  spellCheck={false}
                />
                {agentAvailable ? (
                  <button
                    type="button"
                    className="imagegen-generate-button narrative-file-btn"
                    onClick={onPickMissions}
                    disabled={working}
                  >
                    Pick…
                  </button>
                ) : (
                  <label className="imagegen-generate-button narrative-file-btn narrative-file-btn--upload">
                    Upload
                    <input type="file" accept=".json,application/json" hidden onChange={handleMissionsUpload} />
                  </label>
                )}
              </div>
              {missionsPathLabel ? (
                <p className="narrative-path-hint" title={missionsPathLabel}>
                  {missionsPathLabel}
                </p>
              ) : null}
            </div>

            <div className="narrative-file-field">
              <span className="imagegen-label">Dialogues JSON</span>
              <div className="narrative-file-row">
                <input
                  type="text"
                  className="narrative-file-input"
                  value={dialoguesRelativePath}
                  onChange={(e) => onDialoguesRelativeChange(e.target.value)}
                  disabled={working}
                  spellCheck={false}
                />
                {agentAvailable ? (
                  <button
                    type="button"
                    className="imagegen-generate-button narrative-file-btn"
                    onClick={onPickDialogues}
                    disabled={working}
                  >
                    Pick…
                  </button>
                ) : (
                  <label className="imagegen-generate-button narrative-file-btn narrative-file-btn--upload">
                    Upload
                    <input type="file" accept=".json,application/json" hidden onChange={handleDialoguesUpload} />
                  </label>
                )}
              </div>
              {dialoguesPathLabel ? (
                <p className="narrative-path-hint" title={dialoguesPathLabel}>
                  {dialoguesPathLabel}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              className="imagegen-import-button narrative-btn-block"
              onClick={onLoad}
              disabled={working}
            >
              Reload from disk
            </button>
          </div>
        </section>

        <section className="narrative-left-group imagegen-panel narrative-ai-panel">
          <h3 className="narrative-left-group-title imagegen-panel-title">AI improve</h3>
          <div className="imagegen-panel-body narrative-ai-panel-body">
            <div className="narrative-ai-prompt-block">
              <span className="imagegen-label narrative-ai-prompt-label">Tone / style prompt</span>
              <textarea
                className="narrative-ai-prompt narrative-ai-prompt--wide"
                rows={4}
                value={aiImprovePrompt}
                onChange={(e) => onAiImprovePromptChange(e.target.value)}
                disabled={working}
                placeholder="e.g. Warm, funny, short sentences."
              />
            </div>

            <button
              type="button"
              className="imagegen-generate-button narrative-btn-block"
              onClick={onImprove}
              disabled={working}
            >
              {selectedLineCount > 0
                ? `Improve selected lines (${selectedLineCount})`
                : "Improve selected lines"}
            </button>
            <p className="narrative-hint">
              Use the checkbox or line number in Intro or Return (Dialogues or Mission tab).
            </p>
          </div>
        </section>

        {(validationErrors.length > 0 || orphanCount > 0) && (
          <section className="narrative-left-group imagegen-panel">
            <h3 className="narrative-left-group-title imagegen-panel-title">Validation</h3>
            <div className="imagegen-panel-body">
              {validationErrors.length > 0 ? (
                <ul className="narrative-validation-list">
                  {validationErrors.slice(0, 6).map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              ) : null}
              {orphanCount > 0 ? (
                <p className="narrative-hint">{orphanCount} clip(s) not used by any mission.</p>
              ) : null}
            </div>
          </section>
        )}

        <StudioActivityBox activity={activity} working={working} idleMessage="Ready to edit." />
      </div>
    </div>
  );
}
