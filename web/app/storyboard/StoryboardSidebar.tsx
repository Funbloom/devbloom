"use client";

import { useCallback, useEffect, useState } from "react";
import type { Character, Location, Storyboard, Style } from "./types";

import { fetchApi, API_BASE } from "../lib/api";

type GeneratedImageItem = { id: string; url: string; prompt?: string; tab?: string };

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

  styles: Style[];
  newStyle: string;
  onApplyStyle: (style: Style | null) => void;

  projectKey: string;
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

function urlToCharacterImagePath(url: string): string {
  if (url.startsWith("http")) {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }
  return url.startsWith("/") ? url : `/${url}`;
}

export function StoryboardSidebar(props: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("styles");
  const [pickImageGenOpen, setPickImageGenOpen] = useState(false);
  const [generatedCharacterImages, setGeneratedCharacterImages] = useState<GeneratedImageItem[]>([]);
  const [loadingGeneratedImages, setLoadingGeneratedImages] = useState(false);
  const [pickLocationImageGenOpen, setPickLocationImageGenOpen] = useState(false);
  const [generatedLocationImages, setGeneratedLocationImages] = useState<GeneratedImageItem[]>([]);
  const [loadingGeneratedLocationImages, setLoadingGeneratedLocationImages] = useState(false);
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
    projectKey,
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

  const fetchGeneratedCharacterImages = useCallback(async () => {
    if (!projectKey.trim()) {
      setGeneratedCharacterImages([]);
      return;
    }
    setLoadingGeneratedImages(true);
    try {
      const response = await fetchApi(
        `/tools/image_generated?project_key=${encodeURIComponent(projectKey)}`
      );
      if (!response.ok) {
        setGeneratedCharacterImages([]);
        return;
      }
      const data = (await response.json()) as { images?: unknown[] };
      const raw = data.images ?? [];
      const list: GeneratedImageItem[] = (Array.isArray(raw) ? raw : [])
        .filter(
          (img: unknown) =>
            img &&
            typeof (img as GeneratedImageItem).id === "string" &&
            typeof (img as GeneratedImageItem).url === "string" &&
            (img as GeneratedImageItem).tab === "characters"
        )
        .map((img) => ({
          id: (img as GeneratedImageItem).id,
          url: (img as GeneratedImageItem).url,
          prompt: (img as GeneratedImageItem).prompt,
          tab: (img as GeneratedImageItem).tab,
        }));
      setGeneratedCharacterImages(list);
    } catch {
      setGeneratedCharacterImages([]);
    } finally {
      setLoadingGeneratedImages(false);
    }
  }, [projectKey]);

  const fetchGeneratedLocationImages = useCallback(async () => {
    if (!projectKey.trim()) {
      setGeneratedLocationImages([]);
      return;
    }
    setLoadingGeneratedLocationImages(true);
    try {
      const response = await fetchApi(
        `/tools/image_generated?project_key=${encodeURIComponent(projectKey)}`
      );
      if (!response.ok) {
        setGeneratedLocationImages([]);
        return;
      }
      const data = (await response.json()) as { images?: unknown[] };
      const raw = data.images ?? [];
      const list: GeneratedImageItem[] = (Array.isArray(raw) ? raw : [])
        .filter(
          (img: unknown) =>
            img &&
            typeof (img as GeneratedImageItem).id === "string" &&
            typeof (img as GeneratedImageItem).url === "string" &&
            (img as GeneratedImageItem).tab !== "characters"
        )
        .map((img) => ({
          id: (img as GeneratedImageItem).id,
          url: (img as GeneratedImageItem).url,
          prompt: (img as GeneratedImageItem).prompt,
          tab: (img as GeneratedImageItem).tab,
        }));
      setGeneratedLocationImages(list);
    } catch {
      setGeneratedLocationImages([]);
    } finally {
      setLoadingGeneratedLocationImages(false);
    }
  }, [projectKey]);

  useEffect(() => {
    if (pickImageGenOpen && projectKey.trim()) {
      void fetchGeneratedCharacterImages();
    } else if (!pickImageGenOpen) {
      setGeneratedCharacterImages([]);
    }
  }, [pickImageGenOpen, projectKey, fetchGeneratedCharacterImages]);

  useEffect(() => {
    if (pickLocationImageGenOpen && projectKey.trim()) {
      void fetchGeneratedLocationImages();
    } else if (!pickLocationImageGenOpen) {
      setGeneratedLocationImages([]);
    }
  }, [pickLocationImageGenOpen, projectKey, fetchGeneratedLocationImages]);

  const handlePickGeneratedCharacterImage = (img: GeneratedImageItem) => {
    const path = urlToCharacterImagePath(img.url);
    onNewCharacterImageChange(path);
    setPickImageGenOpen(false);
  };

  const handlePickGeneratedLocationImage = (img: GeneratedImageItem) => {
    const path = urlToCharacterImagePath(img.url);
    onNewLocationImageChange(path);
    setPickLocationImageGenOpen(false);
  };

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
              <button
                type="button"
                className="admin-link"
                onClick={() => setPickImageGenOpen(true)}
                disabled={!projectKey.trim()}
                title={!projectKey.trim() ? "Set active project in Admin to browse generated characters" : "Pick from Image Gen"}
              >
                Pick from Image Gen
              </button>
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
            {pickImageGenOpen && (
              <div
                className="pick-imagegen-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pick-imagegen-title"
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1000,
                }}
                onClick={() => setPickImageGenOpen(false)}
              >
                <div
                  className="pick-imagegen-modal"
                  style={{
                    background: "#161a22",
                    border: "1px solid #2a2f3a",
                    borderRadius: 12,
                    padding: 16,
                    maxWidth: "90vw",
                    maxHeight: "80vh",
                    overflow: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 id="pick-imagegen-title" style={{ margin: 0, fontSize: 16 }}>Pick from Image Gen (characters)</h3>
                    <button type="button" onClick={() => setPickImageGenOpen(false)} aria-label="Close">×</button>
                  </div>
                  {loadingGeneratedImages && <div className="status">Loading…</div>}
                  {!loadingGeneratedImages && generatedCharacterImages.length === 0 && (
                    <div className="status">
                      {!projectKey.trim()
                        ? "Set active project in Admin to see generated characters."
                        : "No character images yet. Generate some in Image Gen → Characters."}
                    </div>
                  )}
                  {!loadingGeneratedImages && generatedCharacterImages.length > 0 && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                        gap: 10,
                      }}
                    >
                      {generatedCharacterImages.map((img) => {
                        const src = img.url.startsWith("http") ? img.url : `${API_BASE}${img.url.startsWith("/") ? "" : "/"}${img.url}`;
                        return (
                          <button
                            type="button"
                            key={img.id}
                            className="pick-imagegen-thumb"
                            onClick={() => handlePickGeneratedCharacterImage(img)}
                            style={{
                              padding: 0,
                              border: "2px solid #2a2f3a",
                              borderRadius: 8,
                              overflow: "hidden",
                              background: "#0f1115",
                              cursor: "pointer",
                            }}
                          >
                            <img
                              src={src}
                              alt={img.prompt?.slice(0, 40) ?? "Character"}
                              style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
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
              <button
                type="button"
                className="admin-link"
                onClick={() => setPickLocationImageGenOpen(true)}
                disabled={!projectKey.trim()}
                title={!projectKey.trim() ? "Set active project in Admin to browse generated images" : "Pick from Image Gen (Image tab)"}
              >
                Pick from Image Gen
              </button>
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
            {pickLocationImageGenOpen && (
              <div
                className="pick-imagegen-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pick-location-imagegen-title"
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1000,
                }}
                onClick={() => setPickLocationImageGenOpen(false)}
              >
                <div
                  className="pick-imagegen-modal"
                  style={{
                    background: "#161a22",
                    border: "1px solid #2a2f3a",
                    borderRadius: 12,
                    padding: 16,
                    maxWidth: "90vw",
                    maxHeight: "80vh",
                    overflow: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 id="pick-location-imagegen-title" style={{ margin: 0, fontSize: 16 }}>Pick from Image Gen (Image tab)</h3>
                    <button type="button" onClick={() => setPickLocationImageGenOpen(false)} aria-label="Close">×</button>
                  </div>
                  {loadingGeneratedLocationImages && <div className="status">Loading…</div>}
                  {!loadingGeneratedLocationImages && generatedLocationImages.length === 0 && (
                    <div className="status">
                      {!projectKey.trim()
                        ? "Set active project in Admin to see generated images."
                        : "No images yet from Image tab. Generate some in Image Gen → Image."}
                    </div>
                  )}
                  {!loadingGeneratedLocationImages && generatedLocationImages.length > 0 && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                        gap: 10,
                      }}
                    >
                      {generatedLocationImages.map((img) => {
                        const src = img.url.startsWith("http") ? img.url : `${API_BASE}${img.url.startsWith("/") ? "" : "/"}${img.url}`;
                        return (
                          <button
                            type="button"
                            key={img.id}
                            className="pick-imagegen-thumb"
                            onClick={() => handlePickGeneratedLocationImage(img)}
                            style={{
                              padding: 0,
                              border: "2px solid #2a2f3a",
                              borderRadius: 8,
                              overflow: "hidden",
                              background: "#0f1115",
                              cursor: "pointer",
                            }}
                          >
                            <img
                              src={src}
                              alt={img.prompt?.slice(0, 40) ?? "Image"}
                              style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

