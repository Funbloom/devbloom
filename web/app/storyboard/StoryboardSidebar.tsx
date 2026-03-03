"use client";

import { useState } from "react";
import type { Character, Location, Storyboard, Style } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function imageSrc(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

function AddStyleForm({
  onAdd,
  disabled,
}: {
  onAdd: (name: string, prompt: string) => void;
  disabled: boolean;
}) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    onAdd(n, prompt.trim());
    setName("");
    setPrompt("");
  };
  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        type="text"
        placeholder="Style name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: "6px 8px", fontSize: 14 }}
      />
      <textarea
        placeholder="Style prompt (visual style, mood, guidelines)"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        style={{ width: "100%", resize: "vertical", padding: "6px 8px", fontSize: 14 }}
      />
      <button type="submit" disabled={disabled || !name.trim()}>
        Add style to bank
      </button>
    </form>
  );
}

type Props = {
  storyboards: Storyboard[];
  selectedId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  activeStoryboard: Storyboard | null;
  characters: Character[];
  locations: Location[];

  newName: string;
  onNewNameChange: (value: string) => void;
  onCreateStoryboard: () => void;
  onDeleteStoryboard: () => void;
  onSelectStoryboard: (id: string) => void;

  styles: Style[];
  newStyle: string;
  onApplyStyle: (style: Style | null) => void;
  onAddStyle: (name: string, prompt: string) => void;
  onDeleteStyle: (id: string) => void;

  newCharacterName: string;
  newCharacterImage: string;
  onNewCharacterNameChange: (value: string) => void;
  onNewCharacterImageChange: (value: string) => void;
  onNewCharacterFileChange: (file: File | null) => void;
  onAddCharacter: () => void;
  onDeleteCharacter: (id: string) => void;

  newLocationName: string;
  newLocationImage: string;
  onNewLocationNameChange: (value: string) => void;
  onNewLocationImageChange: (value: string) => void;
  onNewLocationFileChange: (file: File | null) => void;
  onAddLocation: () => void;
  onDeleteLocation: (id: string) => void;
};

type TabId = "styles" | "characters" | "locations";

export function StoryboardSidebar(props: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("styles");
  const {
    storyboards,
    selectedId,
    isLoading,
    isSaving,
    activeStoryboard,
    characters,
    locations,
    newName,
    onNewNameChange,
    onCreateStoryboard,
    onDeleteStoryboard,
    onSelectStoryboard,
    styles,
    newStyle,
    onApplyStyle,
    onAddStyle,
    onDeleteStyle,
    newCharacterName,
    newCharacterImage,
    onNewCharacterNameChange,
    onNewCharacterImageChange,
    onNewCharacterFileChange,
    onAddCharacter,
    onDeleteCharacter,
    newLocationName,
    newLocationImage,
    onNewLocationNameChange,
    onNewLocationImageChange,
    onNewLocationFileChange,
    onAddLocation,
    onDeleteLocation,
  } = props;

  return (
    <div
      className="chat-left"
      style={{ flexBasis: "25%", maxWidth: "25%" }}
    >
      <div className="sidebar-panel-wrap">
        <div className="admin-section">
        <div className="section-title">Storyboards</div>
        {isLoading && <div className="status">Loading...</div>}
        <div className="storyboard-list">
          {storyboards.map((sb) => (
            <button
              key={sb.id}
              type="button"
              className={`agent-card ${selectedId === sb.id ? "active" : ""}`}
              onClick={() => onSelectStoryboard(sb.id)}
              disabled={isSaving}
            >
              <div className="agent-meta">
                <div className="agent-first-name">{sb.name}</div>
                {sb.project_key && <div className="agent-role">{sb.project_key}</div>}
              </div>
            </button>
          ))}
          {storyboards.length === 0 && <div className="status">No storyboards yet.</div>}
        </div>
        <div className="admin-form">
          <input
            type="text"
            placeholder="New storyboard name"
            value={newName}
            onChange={(e) => onNewNameChange(e.target.value)}
          />
          <button
            type="button"
            onClick={() => void onCreateStoryboard()}
            disabled={isSaving || !newName.trim()}
          >
            Create
          </button>
        </div>
        {activeStoryboard && (
          <div className="admin-form">
            <button
              type="button"
              onClick={() => void onDeleteStoryboard()}
              disabled={isSaving}
              className="admin-link"
            >
              Delete storyboard
            </button>
          </div>
        )}
      </div>

      {activeStoryboard && (
        <div className="sidebar-panel sidebar-panel-tabs">
          <div className="sidebar-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "styles"}
              className={activeTab === "styles" ? "sidebar-tab active" : "sidebar-tab"}
              onClick={() => setActiveTab("styles")}
            >
              Styles
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "characters"}
              className={activeTab === "characters" ? "sidebar-tab active" : "sidebar-tab"}
              onClick={() => setActiveTab("characters")}
            >
              Characters
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "locations"}
              className={activeTab === "locations" ? "sidebar-tab active" : "sidebar-tab"}
              onClick={() => setActiveTab("locations")}
            >
              Locations
            </button>
          </div>
          <div className="sidebar-tab-content">
            {activeTab === "styles" && (
              <div className="sidebar-panel-content" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Current style</label>
              <select
                value={
                  newStyle === ""
                    ? "__none"
                    : styles.find((s) => s.prompt === newStyle)?.id ?? "__none"
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__none") void onApplyStyle(null);
                  else {
                    const s = styles.find((x) => x.id === v);
                    if (s) void onApplyStyle(s);
                  }
                }}
                disabled={isSaving}
                style={{ width: "100%", padding: "6px 8px", fontSize: 14 }}
              >
                <option value="__none">(None)</option>
                {styles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ borderTop: "1px solid #2a2f3a", paddingTop: 10, marginTop: 4 }}>
              <div className="section-title" style={{ marginBottom: 8 }}>Style bank</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {styles.map((s) => (
                  <div key={s.id} className="sidebar-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span className="sources-name" style={{ fontWeight: 600 }}>{s.name}</span>
                      <button
                        type="button"
                        className="admin-link"
                        onClick={() => void onDeleteStyle(s.id)}
                        disabled={isSaving}
                      >
                        Remove
                      </button>
                    </div>
                    <div style={{ fontSize: 12, color: "#9aa3b2", whiteSpace: "pre-wrap", maxHeight: 60, overflow: "auto" }}>
                      {s.prompt || "(no prompt)"}
                    </div>
                  </div>
                ))}
                {styles.length === 0 && <div className="status" style={{ fontSize: 12 }}>No styles in bank. Add one below.</div>}
              </div>
              <AddStyleForm onAdd={onAddStyle} disabled={isSaving} />
            </div>
              </div>
            )}
            {activeTab === "characters" && (
              <div className="sidebar-panel-content">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {characters.map((ch) => {
                const src =
                  ch.image ? imageSrc(ch.image) : "";
                return (
                  <div className="sidebar-item" key={ch.id}>
                    <div className="sources-name">{ch.name}</div>
                    {src && (
                      <div className="image-grid">
                        <div className="image-item">
                          <img className="image-preview character-image" src={src} alt={ch.name} />
                          <div className="image-name">{ch.image}</div>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      className="admin-link"
                      onClick={() => void onDeleteCharacter(ch.id)}
                      disabled={isSaving}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
              {characters.length === 0 && <div className="status">No characters yet.</div>}
            </div>
            <div
              className="admin-form"
              style={{ flexDirection: "column", alignItems: "flex-start", gap: 8, marginTop: 4 }}
            >
              <button
                type="button"
                onClick={() => void onAddCharacter()}
                disabled={isSaving || !newCharacterName.trim()}
              >
                Add character
              </button>
              <input
                type="text"
                placeholder="Character name"
                value={newCharacterName}
                onChange={(e) => onNewCharacterNameChange(e.target.value)}
              />
              <input
                type="text"
                placeholder="Image URL (optional)"
                value={newCharacterImage}
                onChange={(e) => onNewCharacterImageChange(e.target.value)}
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  onNewCharacterFileChange(file);
                  if (file) {
                    onNewCharacterImageChange(file.name);
                  }
                }}
              />
            </div>
              </div>
            )}
            {activeTab === "locations" && (
              <div className="sidebar-panel-content">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {locations.map((loc) => {
                const src =
                  loc.image ? imageSrc(loc.image) : "";
                return (
                  <div className="sidebar-item" key={loc.id}>
                    <div className="sources-name">{loc.name}</div>
                    {src && (
                      <div className="image-grid">
                        <div className="image-item">
                          <img className="image-preview character-image" src={src} alt={loc.name} />
                          <div className="image-name">{loc.image}</div>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      className="admin-link"
                      onClick={() => void onDeleteLocation(loc.id)}
                      disabled={isSaving}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
              {locations.length === 0 && <div className="status">No locations yet.</div>}
            </div>
            <div
              className="admin-form"
              style={{ flexDirection: "column", alignItems: "flex-start", gap: 8, marginTop: 4 }}
            >
              <button
                type="button"
                onClick={() => void onAddLocation()}
                disabled={isSaving || !newLocationName.trim()}
              >
                Add location
              </button>
              <input
                type="text"
                placeholder="Location name"
                value={newLocationName}
                onChange={(e) => onNewLocationNameChange(e.target.value)}
              />
              <input
                type="text"
                placeholder="Image URL (optional)"
                value={newLocationImage}
                onChange={(e) => onNewLocationImageChange(e.target.value)}
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  onNewLocationFileChange(file);
                  if (file) {
                    onNewLocationImageChange(file.name);
                  }
                }}
              />
            </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

