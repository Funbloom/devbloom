"use client";

import { useEffect, useState } from "react";
import type { ReactElement } from "react";

type Props = {
  mp3Name: string;
  audioUrl: string;
  trackedText: string | null;
  disabled: boolean;
  onRegenerate: (mp3Name: string, text: string) => Promise<void>;
  onDelete: (mp3Name: string) => Promise<void>;
};

export function OutputMp3ClipCard({
  mp3Name,
  audioUrl,
  trackedText,
  disabled,
  onRegenerate,
  onDelete,
}: Props): ReactElement {
  const [editText, setEditText] = useState<string>(trackedText ?? "");
  const [regenerating, setRegenerating] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  useEffect(() => {
    setEditText(trackedText ?? "");
  }, [trackedText, mp3Name]);

  const handleRegenerate = (): void => {
    const trimmed = editText.trim();
    if (!trimmed || disabled || regenerating) {
      return;
    }
    setRegenerating(true);
    void onRegenerate(mp3Name, trimmed).finally(() => {
      setRegenerating(false);
    });
  };

  const handleDelete = (): void => {
    if (disabled || deleting || regenerating) {
      return;
    }
    setDeleting(true);
    void onDelete(mp3Name).finally(() => {
      setDeleting(false);
    });
  };

  return (
    <div
      style={{
        border: "1px solid #2a2f3a",
        borderRadius: 10,
        padding: "10px 12px",
        background: "#0f1115",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: "#e2e8f0",
            wordBreak: "break-word",
            flex: 1,
          }}
          title={mp3Name}
        >
          {mp3Name}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {trackedText !== null ? (
            <button
              type="button"
              className="imagegen-button-secondary"
              disabled={disabled || regenerating || deleting || !editText.trim()}
              style={{ marginTop: 0 }}
              onClick={handleRegenerate}
            >
              {regenerating ? "Regenerating…" : "Regenerate"}
            </button>
          ) : null}
          <button
            type="button"
            className="imagegen-delete-button"
            disabled={disabled || deleting || regenerating}
            style={{ marginTop: 0 }}
            onClick={handleDelete}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- generated audio has no captions */}
      <audio controls src={audioUrl} style={{ width: "100%" }} preload="metadata" />
      {trackedText !== null ? (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#94a3b8" }}>
            <span>Script</span>
            <textarea
              value={editText}
              disabled={disabled || regenerating || deleting}
              rows={4}
              onChange={(event) => {
                setEditText(event.target.value);
              }}
              style={{
                width: "100%",
                resize: "vertical",
                padding: "8px 10px",
                fontSize: 13,
                borderRadius: 8,
                border: "1px solid #334155",
                background: "#0f172a",
                color: "#f1f5f9",
                boxSizing: "border-box",
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
