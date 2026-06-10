"use client";

import { useCallback, useEffect, useRef } from "react";
import type { CSSProperties, MouseEvent, ReactElement } from "react";
import { normalizeRichTextHtml } from "../richText";

type Props = {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  minHeight?: number;
  onChange: (html: string) => void;
  onBlur?: (html: string) => void;
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
  padding: "6px 8px",
  borderBottom: "1px solid #334155",
  background: "#1e293b",
};

const toolbarButtonStyle: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid #475569",
  background: "#0f172a",
  color: "#e2e8f0",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const editorStyle: CSSProperties = {
  minHeight: 160,
  padding: "10px 12px",
  fontSize: 13,
  lineHeight: 1.5,
  color: "#f1f5f9",
  outline: "none",
  overflowY: "auto",
};

const shellStyle: CSSProperties = {
  border: "1px solid #334155",
  borderRadius: 8,
  background: "#0f172a",
  display: "grid",
  gridTemplateRows: "auto 1fr",
};

function runCommand(command: string, value?: string): void {
  document.execCommand(command, false, value);
}

export function RichTextEditor({
  value,
  disabled,
  placeholder = "Add notes…",
  minHeight = 160,
  onChange,
  onBlur,
}: Props): ReactElement {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastSyncedValue = useRef(value);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const normalized = normalizeRichTextHtml(value);
    if (normalizeRichTextHtml(editor.innerHTML) !== normalized) {
      editor.innerHTML = normalized;
    }
    lastSyncedValue.current = normalized;
  }, [value]);

  const syncValue = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const normalized = normalizeRichTextHtml(editor.innerHTML);
    if (normalized !== lastSyncedValue.current) {
      lastSyncedValue.current = normalized;
      onChange(normalized);
    }
  }, [onChange]);

  const handleBlur = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const normalized = normalizeRichTextHtml(editor.innerHTML);
    lastSyncedValue.current = normalized;
    onChange(normalized);
    onBlur?.(normalized);
  };

  const handleToolbarMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  return (
    <div style={shellStyle}>
      <div style={toolbarStyle}>
        <button
          type="button"
          style={toolbarButtonStyle}
          disabled={disabled}
          onMouseDown={handleToolbarMouseDown}
          onClick={() => {
            editorRef.current?.focus();
            runCommand("bold");
            syncValue();
          }}
        >
          B
        </button>
        <button
          type="button"
          style={{ ...toolbarButtonStyle, fontStyle: "italic" }}
          disabled={disabled}
          onMouseDown={handleToolbarMouseDown}
          onClick={() => {
            editorRef.current?.focus();
            runCommand("italic");
            syncValue();
          }}
        >
          I
        </button>
        <button
          type="button"
          style={{ ...toolbarButtonStyle, textDecoration: "underline" }}
          disabled={disabled}
          onMouseDown={handleToolbarMouseDown}
          onClick={() => {
            editorRef.current?.focus();
            runCommand("underline");
            syncValue();
          }}
        >
          U
        </button>
        <button
          type="button"
          style={toolbarButtonStyle}
          disabled={disabled}
          onMouseDown={handleToolbarMouseDown}
          onClick={() => {
            editorRef.current?.focus();
            runCommand("insertUnorderedList");
            syncValue();
          }}
        >
          Bullets
        </button>
        <button
          type="button"
          style={toolbarButtonStyle}
          disabled={disabled}
          onMouseDown={handleToolbarMouseDown}
          onClick={() => {
            editorRef.current?.focus();
            runCommand("insertOrderedList");
            syncValue();
          }}
        >
          Numbers
        </button>
      </div>
      <div
        ref={editorRef}
        className="planning-rich-text-editor"
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        style={{ ...editorStyle, minHeight }}
        onInput={syncValue}
        onBlur={handleBlur}
      />
    </div>
  );
}
