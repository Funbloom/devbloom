"use client";

import type { KeyboardEvent, ReactElement } from "react";

import type { DialogueLineRow } from "../narrativeClient";

export type LineSection = "intro" | "return";

type Props = {
  section: LineSection;
  title: string;
  lines: DialogueLineRow[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onLineChange: (id: string, patch: Partial<DialogueLineRow>) => void;
  onLineBlur: (id: string) => void;
  onDeleteLine: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onAddLine: () => void;
};

export function DialogueLineEditor({
  section,
  title,
  lines,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onLineChange,
  onLineBlur,
  onDeleteLine,
  onMoveUp,
  onMoveDown,
  onAddLine,
}: Props): ReactElement {
  const selectedInSection = lines.filter((l) => selectedIds.has(l.id)).length;

  const handleScriptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, index: number): void => {
    if (event.key !== "Tab") {
      return;
    }
    event.preventDefault();
    const delta = event.shiftKey ? -1 : 1;
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= lines.length) {
      return;
    }
    const nextId = lines[nextIndex].id;
    const el = document.querySelector<HTMLTextAreaElement>(
      `textarea[data-narrative-line="${section}"][data-line-id="${CSS.escape(nextId)}"]`
    );
    el?.focus();
  };

  return (
    <section className={`narrative-lines-section narrative-lines-section--${section}`}>
      <div className="narrative-lines-header">
        <div className="narrative-lines-heading">
          <h4 className="narrative-lines-title">{title}</h4>
          <span className="narrative-badge narrative-badge--muted">{lines.length}</span>
          {selectedInSection > 0 ? (
            <span className="narrative-badge narrative-badge--accent">{selectedInSection} sel.</span>
          ) : null}
        </div>
        <div className="narrative-lines-actions">
          <button type="button" className="narrative-toolbar-btn" onClick={onSelectAll}>
            All
          </button>
          <button type="button" className="narrative-toolbar-btn" onClick={onClearSelection}>
            Clear
          </button>
          <button type="button" className="imagegen-generate-button narrative-toolbar-primary" onClick={onAddLine}>
            New Line
          </button>
        </div>
      </div>

      {lines.length === 0 ? (
        <p className="narrative-lines-empty">No {title.toLowerCase()} lines yet. Click New Line to add one.</p>
      ) : (
        <ul className="narrative-line-list">
          {lines.map((line, index) => {
            const selected = selectedIds.has(line.id);
            return (
              <li
                key={`${section}-${line.id}-${index}`}
                className={`narrative-line-card${selected ? " narrative-line-card--selected" : ""}`}
              >
                <div className="narrative-line-main">
                  <label className="narrative-line-check" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleSelect(line.id)}
                    />
                    <span className="sr-only">Select {line.id}</span>
                  </label>
                  <button
                    type="button"
                    className={`narrative-line-index${selected ? " narrative-line-index--selected" : ""}`}
                    onClick={() => onToggleSelect(line.id)}
                    title="Select for AI improve"
                    aria-pressed={selected}
                  >
                    {index + 1}
                  </button>
                  <label className="narrative-line-script-field">
                    <span className="sr-only">Script for {line.id}</span>
                    <textarea
                      className="narrative-line-script"
                      rows={2}
                      data-narrative-line={section}
                      data-line-id={line.id}
                      data-line-index={String(index)}
                      placeholder="Dialogue script…"
                      value={line.script_text}
                      onChange={(e) => onLineChange(line.id, { script_text: e.target.value })}
                      onBlur={() => onLineBlur(line.id)}
                      onKeyDown={(e) => handleScriptKeyDown(e, index)}
                    />
                  </label>
                  <div className="narrative-line-order" role="group" aria-label="Line actions">
                    <button
                      type="button"
                      className="narrative-icon-btn"
                      onClick={() => onMoveUp(line.id)}
                      disabled={index === 0}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="narrative-icon-btn"
                      onClick={() => onMoveDown(line.id)}
                      disabled={index === lines.length - 1}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="narrative-icon-btn narrative-icon-btn--danger"
                      onClick={() => onDeleteLine(line.id)}
                      title="Delete line"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {line.warning ? <p className="narrative-line-warning">{line.warning}</p> : null}

                <div className="narrative-line-meta">
                  <label className="narrative-meta-field narrative-meta-field--id">
                    <span>ID</span>
                    <input
                      type="text"
                      value={line.id}
                      onChange={(e) => onLineChange(line.id, { id: e.target.value })}
                      onBlur={() => onLineBlur(line.id)}
                    />
                  </label>
                  <label className="narrative-meta-field">
                    <span>Character</span>
                    <input
                      type="text"
                      value={line.character_name}
                      onChange={(e) => onLineChange(line.id, { character_name: e.target.value })}
                      onBlur={() => onLineBlur(line.id)}
                    />
                  </label>
                  <label className="narrative-meta-field">
                    <span>Voice</span>
                    <input
                      type="text"
                      value={line.voice_name}
                      onChange={(e) => onLineChange(line.id, { voice_name: e.target.value })}
                      onBlur={() => onLineBlur(line.id)}
                    />
                  </label>
                  <label className="narrative-meta-field narrative-meta-field--mood">
                    <span>Mood</span>
                    <input
                      type="text"
                      value={line.mood ?? ""}
                      onChange={(e) => onLineChange(line.id, { mood: e.target.value || null })}
                      onBlur={() => onLineBlur(line.id)}
                    />
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
