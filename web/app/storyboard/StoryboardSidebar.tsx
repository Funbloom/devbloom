"use client";

import type { Character, Location, Storyboard } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function imageSrc(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
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

  newStyle: string;
  onNewStyleChange: (value: string) => void;
  onSaveStyle: () => void;

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

export function StoryboardSidebar(props: Props) {
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
    newStyle,
    onNewStyleChange,
    onSaveStyle,
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
        <div className="admin-section">
          <div className="section-title">Style</div>
          <textarea
            value={newStyle}
            onChange={(e) => onNewStyleChange(e.target.value)}
            placeholder="Describe the visual style, mood, and guidelines for this storyboard."
          />
          <button type="button" onClick={() => void onSaveStyle()} disabled={isSaving}>
            Save style
          </button>
        </div>
      )}

      {activeStoryboard && (
        <div className="sidebar-panel sidebar-panel-characters">
          <h3 className="sidebar-panel-title">Characters</h3>
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
        </div>
      )}

      {activeStoryboard && (
        <div className="sidebar-panel sidebar-panel-locations">
          <h3 className="sidebar-panel-title">Locations</h3>
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
        </div>
      )}
      </div>
    </div>
  );
}

