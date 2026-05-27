"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";

type Props = {
  mission: Record<string, unknown>;
  originalMissionId: string;
  working: boolean;
  dialoguePanel: ReactNode;
  onChange: (mission: Record<string, unknown>) => void;
  onSave: (mission: Record<string, unknown>) => void;
  onDelete: () => void;
};

function idsToLines(ids: unknown): string {
  if (!Array.isArray(ids)) {
    return "";
  }
  return ids.map((entry) => String(entry).trim()).filter(Boolean).join("\n");
}

function linesToIds(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function jsonToText(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

function textToJson(text: string, fieldLabel: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(`Invalid JSON in ${fieldLabel}`);
  }
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): ReactElement {
  return (
    <label className="narrative-mission-field">
      <span className="narrative-mission-field-label">{label}</span>
      {children}
    </label>
  );
}

export function MissionEditor({
  mission,
  originalMissionId,
  working,
  dialoguePanel,
  onChange,
  onSave,
  onDelete,
}: Props): ReactElement {
  const [objectivesJson, setObjectivesJson] = useState(() => jsonToText(mission.objectives));
  const [requirementsJson, setRequirementsJson] = useState(() => jsonToText(mission.requirements));
  const [rewardsJson, setRewardsJson] = useState(() => jsonToText(mission.rewards));
  const [uiJson, setUiJson] = useState(() => jsonToText(mission.ui));
  const [analyticsJson, setAnalyticsJson] = useState(() => jsonToText(mission.analytics));
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setObjectivesJson(jsonToText(mission.objectives));
    setRequirementsJson(jsonToText(mission.requirements));
    setRewardsJson(jsonToText(mission.rewards));
    setUiJson(jsonToText(mission.ui));
    setAnalyticsJson(jsonToText(mission.analytics));
    setJsonError(null);
  }, [mission]);

  const patch = useCallback(
    (fields: Record<string, unknown>): void => {
      onChange({ ...mission, ...fields });
    },
    [mission, onChange]
  );

  const handleSave = (): void => {
    try {
      const next: Record<string, unknown> = {
        ...mission,
        objectives: textToJson(objectivesJson, "objectives") ?? [],
        requirements: textToJson(requirementsJson, "requirements") ?? {},
        rewards: textToJson(rewardsJson, "rewards") ?? {},
        ui: textToJson(uiJson, "ui") ?? {},
        analytics: textToJson(analyticsJson, "analytics") ?? {},
      };
      setJsonError(null);
      onChange(next);
      onSave(next);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : String(err));
    }
  };

  const boolValue = (key: string): boolean => Boolean(mission[key]);

  return (
    <div className="narrative-mission-editor">
      {jsonError ? <p className="narrative-alert narrative-alert--warn">{jsonError}</p> : null}
      <div className="narrative-mission-editor-scroll">
      <div className="narrative-mission-editor-grid">
        <FieldRow label="Mission id">
          <input
            type="text"
            className="narrative-mission-input"
            value={String(mission.id ?? "")}
            onChange={(e) => patch({ id: e.target.value })}
            spellCheck={false}
          />
        </FieldRow>
        <FieldRow label="Title">
          <input
            type="text"
            className="narrative-mission-input"
            value={String(mission.title ?? "")}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </FieldRow>
        <FieldRow label="Description">
          <textarea
            className="narrative-mission-textarea"
            rows={3}
            value={String(mission.description ?? "")}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </FieldRow>
        <section className="narrative-mission-dialogues-wrap" aria-labelledby="narrative-mission-dialogues-heading">
          <div className="narrative-mission-dialogues-head">
            <h3 id="narrative-mission-dialogues-heading" className="narrative-mission-section-title">
              Dialogue
            </h3>
            <p className="narrative-mission-dialogues-hint">
              Edit script text below; changes save when you leave a field (same as the Dialogues tab).
            </p>
          </div>
          {dialoguePanel}
        </section>
        <FieldRow label="Category">
          <input
            type="text"
            className="narrative-mission-input"
            value={String(mission.category ?? "")}
            onChange={(e) => patch({ category: e.target.value })}
          />
        </FieldRow>
        <FieldRow label="Mission type">
          <input
            type="text"
            className="narrative-mission-input"
            value={String(mission.missionType ?? "")}
            onChange={(e) => patch({ missionType: e.target.value })}
          />
        </FieldRow>
        <FieldRow label="Difficulty">
          <input
            type="text"
            className="narrative-mission-input"
            value={String(mission.difficulty ?? "")}
            onChange={(e) => patch({ difficulty: e.target.value })}
          />
        </FieldRow>
        <div className="narrative-mission-flags">
          <label className="narrative-mission-check">
            <input
              type="checkbox"
              checked={boolValue("isDaily")}
              onChange={(e) => patch({ isDaily: e.target.checked })}
            />
            <span>Daily</span>
          </label>
          <label className="narrative-mission-check">
            <input
              type="checkbox"
              checked={boolValue("isRepeatable")}
              onChange={(e) => patch({ isRepeatable: e.target.checked })}
            />
            <span>Repeatable</span>
          </label>
          <label className="narrative-mission-check">
            <input
              type="checkbox"
              checked={boolValue("isStartingMission")}
              onChange={(e) => patch({ isStartingMission: e.target.checked })}
            />
            <span>Starting mission</span>
          </label>
        </div>
        <FieldRow label="Unlocks mission ids (one per line)">
          <textarea
            className="narrative-mission-textarea narrative-mission-textarea--ids"
            rows={3}
            value={idsToLines(mission.unlocksMissionIds)}
            onChange={(e) => patch({ unlocksMissionIds: linesToIds(e.target.value) })}
            spellCheck={false}
          />
        </FieldRow>
        <FieldRow label="Objectives (JSON)">
          <textarea
            className="narrative-mission-textarea narrative-mission-textarea--json"
            rows={5}
            value={objectivesJson}
            onChange={(e) => setObjectivesJson(e.target.value)}
            spellCheck={false}
          />
        </FieldRow>
        <FieldRow label="Requirements (JSON)">
          <textarea
            className="narrative-mission-textarea narrative-mission-textarea--json"
            rows={6}
            value={requirementsJson}
            onChange={(e) => setRequirementsJson(e.target.value)}
            spellCheck={false}
          />
        </FieldRow>
        <FieldRow label="Rewards (JSON)">
          <textarea
            className="narrative-mission-textarea narrative-mission-textarea--json"
            rows={5}
            value={rewardsJson}
            onChange={(e) => setRewardsJson(e.target.value)}
            spellCheck={false}
          />
        </FieldRow>
        <FieldRow label="UI (JSON)">
          <textarea
            className="narrative-mission-textarea narrative-mission-textarea--json"
            rows={4}
            value={uiJson}
            onChange={(e) => setUiJson(e.target.value)}
            spellCheck={false}
          />
        </FieldRow>
        <FieldRow label="Analytics (JSON)">
          <textarea
            className="narrative-mission-textarea narrative-mission-textarea--json"
            rows={3}
            value={analyticsJson}
            onChange={(e) => setAnalyticsJson(e.target.value)}
            spellCheck={false}
          />
        </FieldRow>
      </div>
      </div>
      <div className="narrative-mission-editor-actions narrative-mission-editor-actions--sticky">
        <button
          type="button"
          className="imagegen-generate-button"
          disabled={working}
          onClick={handleSave}
        >
          Save mission
        </button>
        <button
          type="button"
          className="narrative-mission-delete-btn"
          disabled={working}
          onClick={onDelete}
        >
          Delete mission
        </button>
        {originalMissionId !== String(mission.id ?? "") ? (
          <span className="narrative-mission-rename-hint">
            Renaming from <code>{originalMissionId}</code>
          </span>
        ) : null}
      </div>
    </div>
  );
}
