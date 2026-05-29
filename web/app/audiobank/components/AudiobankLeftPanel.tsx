"use client";

import { useRef, type InputHTMLAttributes } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { isAudiobankAudioFile, type AudiobankClip } from "../audiobankClient";
import {
  AUDIOBANK_DEST_FOLDER_KEY,
  AUDIOBANK_DEFAULT_DEST_FOLDER,
  normalizeProjectRelativePath,
  relativeFolderFromPickedProject,
  type AudiobankOutputFormat,
} from "../audiobankUtils";

type Props = {
  destRelative: string;
  onDestRelativeChange: (value: string) => void;
  activeProjectKey: string;
  projectRoot: string | null;
  localAgentOk: boolean;
  localAgentEligible: boolean;
  selectedClip: AudiobankClip | null;
  importing: boolean;
  overwrite: boolean;
  onOverwriteChange: (value: boolean) => void;
  outputFormat: AudiobankOutputFormat;
  onOutputFormatChange: (value: AudiobankOutputFormat) => void;
  onImportFiles: (files: File[]) => void;
  onUseInProject: () => void;
  onNotify: (message: string, isError: boolean) => void;
};

export function AudiobankLeftPanel({
  destRelative,
  onDestRelativeChange,
  activeProjectKey,
  projectRoot,
  localAgentOk,
  localAgentEligible,
  selectedClip,
  importing,
  overwrite,
  onOverwriteChange,
  outputFormat,
  onOutputFormatChange,
  onImportFiles,
  onUseInProject,
  onNotify,
}: Props) {
  const { authUser } = useAuth();
  const isAdmin = Boolean(authUser?.is_admin);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const handleFilesPicked = (fileList: FileList | null) => {
    if (!fileList) {
      return;
    }
    const files = Array.from(fileList).filter(isAudiobankAudioFile);
    if (files.length === 0) {
      return;
    }
    onImportFiles(files);
  };

  const handlePickDestination = async () => {
    if (!localAgentEligible || !localAgentOk || !projectRoot) {
      return;
    }
    const { localAgent } = await import("../../lib/localAgentClient");
    const picked = await localAgent.pickDirectory();
    if (picked.cancelled || !picked.path) {
      return;
    }
    const rel = relativeFolderFromPickedProject(projectRoot, picked.path);
    if (rel === null) {
      onNotify("Pick a folder inside the active local project root.", true);
      return;
    }
    onDestRelativeChange(rel);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AUDIOBANK_DEST_FOLDER_KEY, rel);
    }
  };

  const handleBrowseDestination = async () => {
    if (!localAgentEligible || !localAgentOk || !projectRoot) {
      return;
    }
    const { localAgent } = await import("../../lib/localAgentClient");
    const rel = normalizeProjectRelativePath(destRelative) || ".";
    try {
      await localAgent.approveProjectRoot(projectRoot);
      await localAgent.revealFolder(projectRoot, rel);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onNotify(`Could not open folder: ${message}`, true);
    }
  };

  const destinationActionsEnabled = Boolean(localAgentEligible && localAgentOk && projectRoot);

  const canUseInProject = Boolean(
    selectedClip && projectRoot && localAgentOk && normalizeProjectRelativePath(destRelative).length >= 0
  );

  return (
    <div className="imagegen-panel">
      <h2 className="imagegen-panel-title">Audiobank</h2>
      <div className="imagegen-panel-body" style={{ display: "grid", gap: 12 }}>
        {isAdmin && (
          <div className="audiobank-import-panel">
            <div className="audiobank-import-panel-title">Import audio SFX</div>
            <div className="audiobank-import-panel-body">
              <div className="audiobank-import-panel-actions">
                <button
                  type="button"
                  className="imagegen-generate-button"
                  disabled={importing}
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                >
                  {importing ? "Importing…" : "Import files"}
                </button>
                <button
                  type="button"
                  className="imagegen-generate-button audiobank-import-panel-btn-secondary"
                  disabled={importing}
                  onClick={() => {
                    folderInputRef.current?.click();
                  }}
                >
                  Import folder
                </button>
                <label className="audiobank-overwrite-row audiobank-overwrite-row--inline">
                  <input
                    type="checkbox"
                    checked={overwrite}
                    disabled={importing}
                    onChange={(event) => {
                      onOverwriteChange(event.target.checked);
                    }}
                  />
                  <span>Overwrite</span>
                </label>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".wav,.mp3,audio/wav,audio/mpeg"
                multiple
                style={{ display: "none" }}
                onChange={(event) => {
                  handleFilesPicked(event.target.files);
                  event.target.value = "";
                }}
              />
              <input
                ref={folderInputRef}
                type="file"
                accept=".wav,.mp3,audio/wav,audio/mpeg"
                multiple
                {...({ webkitdirectory: "true" } as InputHTMLAttributes<HTMLInputElement>)}
                style={{ display: "none" }}
                onChange={(event) => {
                  handleFilesPicked(event.target.files);
                  event.target.value = "";
                }}
              />
              <p className="audiobank-hint">
                WAV and MP3 only. AI assigns category and tags on import.
              </p>
              <p className="audiobank-hint audiobank-hint--warning">
                ** Only royalty free audio files are allowed. **
              </p>
            </div>
          </div>
        )}

        <div>
          <div className="imagegen-label">Destination folder (in project)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              className="imagegen-input"
              style={{ flex: "1 1 160px", minWidth: 0 }}
              value={destRelative}
              placeholder={AUDIOBANK_DEFAULT_DEST_FOLDER}
              onChange={(event) => {
                onDestRelativeChange(normalizeProjectRelativePath(event.target.value));
              }}
            />
            <button
              type="button"
              className="imagegen-generate-button"
              style={{ background: "#334155", color: "#e2e8f0", flex: "0 0 auto" }}
              disabled={!destinationActionsEnabled}
              onClick={() => {
                void handlePickDestination();
              }}
            >
              Pick
            </button>
            <button
              type="button"
              className="imagegen-generate-button"
              style={{ background: "#334155", color: "#e2e8f0", flex: "0 0 auto" }}
              disabled={!destinationActionsEnabled}
              onClick={() => {
                void handleBrowseDestination();
              }}
            >
              Browse
            </button>
          </div>
          {!activeProjectKey && (
            <p className="audiobank-hint">Select an active project in Settings → Projects.</p>
          )}
          {activeProjectKey && !projectRoot && (
            <p className="audiobank-hint">Map the project folder in Admin to browse destinations.</p>
          )}
        </div>

        <div>
          <div className="audiobank-use-in-project-row">
            <button
              type="button"
              className="imagegen-generate-button"
              disabled={!canUseInProject}
              onClick={onUseInProject}
            >
              Use In Project
            </button>
            <label className="audiobank-format-field">
              <span className="audiobank-format-label">Format</span>
              <select
                className="imagegen-select audiobank-format-select"
                value={outputFormat}
                disabled={!canUseInProject}
                onChange={(event) => {
                  onOutputFormatChange(event.target.value as AudiobankOutputFormat);
                }}
              >
                <option value="original">Original</option>
                <option value="mp3">Mp3</option>
                <option value="wav">Wav</option>
              </select>
            </label>
          </div>
          {selectedClip ? (
            <p className="audiobank-hint">
              Selected: <strong>{selectedClip.filename}</strong>
            </p>
          ) : (
            <p className="audiobank-hint">Select a clip in the library to copy it into your project.</p>
          )}
        </div>
      </div>
    </div>
  );
}
