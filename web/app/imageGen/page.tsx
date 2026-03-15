"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  addStyle,
  deleteStyle,
  generateCharacterImage,
  generateImageFromPrompt,
  generateImagePrompt,
  getImageGenerated,
  getStyles,
  normalizeImageUrl,
  putImageGenerated,
  uploadImageToCloud,
} from "./client";
import { API_BASE, STORAGE_KEY_PROJECT } from "./config";
import { useAuth } from "../contexts/AuthContext";
import { fetchApi } from "../lib/api";
import { CharactersTabPanel } from "./CharactersTabPanel";
import { ImageTabPanel } from "./ImageTabPanel";
import { ResultsPanel } from "./ResultsPanel";
import type { GeneratedImage, ImageLocation, ImageTab } from "./types";

function parseStoredImages(raw: unknown[]): GeneratedImage[] {
  return raw
    .filter(
      (img) =>
        img &&
        typeof (img as Record<string, unknown>).id === "string" &&
        typeof (img as Record<string, unknown>).url === "string",
    )
    .map((img) => {
      const o = img as Record<string, unknown>;
      const rawUrl = typeof o.url === "string" ? o.url : "";
      const url = normalizeImageUrl(rawUrl);
      const tab: ImageTab = o.tab === "characters" ? "characters" : "image";

      let location: ImageLocation = "local";
      if (typeof o.location === "string" && (o.location === "local" || o.location === "cloud")) {
        location = o.location;
      } else if (url.includes("/images/")) {
        location = "local";
      } else {
        location = "cloud";
      }

      const filename =
        typeof o.filename === "string" && o.filename
          ? o.filename
          : (() => {
              try {
                const u = new URL(url, API_BASE);
                const pathname = u.pathname || "";
                const idx = pathname.lastIndexOf("/");
                return idx >= 0 ? pathname.slice(idx + 1) : "";
              } catch {
                return "";
              }
            })();

      return {
        id: String(o.id),
        url,
        filename: filename || undefined,
        prompt: typeof o.prompt === "string" ? o.prompt : "",
        styleName: typeof o.styleName === "string" ? o.styleName : undefined,
        createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date(0).toISOString(),
        tab,
        location,
      };
    });
}

function toPayload(img: GeneratedImage): Record<string, unknown> {
  return {
    id: img.id,
    url: img.url,
    filename: img.filename,
    prompt: img.prompt,
    styleName: img.styleName,
    createdAt: img.createdAt,
    tab: img.tab,
    location: img.location,
  };
}

function StylesAddForm({
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
    <form
      onSubmit={handleSubmit}
      style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}
    >
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

export default function ImageGenPage() {
  const { session } = useAuth();
  const [projectKey, setProjectKey] = useState("");
  const [styles, setStyles] = useState<Awaited<ReturnType<typeof getStyles>>>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string>("__none");
  const [prompt, setPrompt] = useState("");
  const [genPrompt, setGenPrompt] = useState("");
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [imagesPerRow, setImagesPerRow] = useState(3);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingCharacter, setIsGeneratingCharacter] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ImageTab>("image");
  const [charRole, setCharRole] = useState("");
  const [charPhysical, setCharPhysical] = useState("");
  const [charAge, setCharAge] = useState("");
  const [charOutfit, setCharOutfit] = useState("");
  const [charNegative, setCharNegative] = useState("");
  const [selectedCharacterStyleId, setSelectedCharacterStyleId] = useState<string>("__none");
  const [isManagingStyles, setIsManagingStyles] = useState(false);
  const [defaultLocation, setDefaultLocation] = useState<ImageLocation>("local");
  const [isPrivate, setIsPrivate] = useState(false);

  /** Only persist after initial load for this project has completed; avoids overwriting saved data with [] on mount. */
  const loadCompletedForProjectRef = useRef<string | null>(null);

  useEffect(() => {
    const key = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY_PROJECT) : null;
    setProjectKey(key?.trim() ?? "");
  }, []);

  useEffect(() => {
    if (!session) return;
    const loadDefaults = async () => {
      try {
        const response = await fetchApi("/settings/image_defaults");
        if (!response.ok) return;
        const data = (await response.json()) as { location?: string };
        const loc = data.location === "cloud" ? "cloud" : "local";
        setDefaultLocation(loc);
      } catch {
        // ignore, fall back to local
      }
    };
    void loadDefaults();
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    getStyles().then((data) => {
      if (!cancelled) setStyles(data);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!projectKey) return;
    loadCompletedForProjectRef.current = null;
    let cancelled = false;
    getImageGenerated(projectKey, { private: isPrivate })
      .then(({ images: raw }) => {
        if (!cancelled) {
          setImages(parseStoredImages(raw));
          loadCompletedForProjectRef.current = projectKey;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImages([]);
          loadCompletedForProjectRef.current = projectKey;
        }
      });
    return () => { cancelled = true; };
  }, [projectKey, isPrivate]);

  const persistImages = useCallback(
    async (list: GeneratedImage[]) => {
      if (!projectKey) return;
      try {
        await putImageGenerated(projectKey, list.map(toPayload), { private: isPrivate });
      } catch {
        // ignore
      }
    },
    [projectKey, isPrivate]
  );

  useEffect(() => {
    if (!projectKey || loadCompletedForProjectRef.current !== projectKey) return;
    void persistImages(images);
  }, [projectKey, images, persistImages]);

  const handleAddStyle = useCallback(
    async (name: string, prompt: string) => {
      setIsManagingStyles(true);
      setStatus(null);
      try {
        const created = await addStyle(name, prompt);
        setStyles((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setStatus("Style added to bank.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setStatus(`Error adding style: ${message}`);
      } finally {
        setIsManagingStyles(false);
      }
    },
    []
  );

  const handleDeleteStyle = useCallback(
    async (styleId: string) => {
      setIsManagingStyles(true);
      setStatus(null);
      try {
        await deleteStyle(styleId);
        setStyles((prev) => prev.filter((s) => s.id !== styleId));
        setStatus("Style removed from bank.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setStatus(`Error deleting style: ${message}`);
      } finally {
        setIsManagingStyles(false);
      }
    },
    []
  );

  const handleGenerate = async () => {
    const base = genPrompt.trim() || prompt.trim();
    if (!base) return;
    setIsGenerating(true);
    setStatus("Generating image...");
    try {
      const style = selectedStyleId !== "__none" ? styles.find((s) => s.id === selectedStyleId) ?? null : null;
      let fullPrompt = base;
      if (style?.prompt) fullPrompt = `${style.prompt}\n\n${base}`;
      const backendImages = await generateImageFromPrompt(fullPrompt);
      const now = new Date().toISOString();
      const newItems: GeneratedImage[] = backendImages.map((img, index) => {
        const raw = (img.url || img.filename || "") as string;
        const filename =
          (img as Record<string, unknown>).filename && typeof (img as Record<string, unknown>).filename === "string"
            ? String((img as Record<string, unknown>).filename)
            : (() => {
                try {
                  const u = new URL(raw, API_BASE);
                  const pathname = u.pathname || "";
                  const idx = pathname.lastIndexOf("/");
                  return idx >= 0 ? pathname.slice(idx + 1) : "";
                } catch {
                  return "";
                }
              })();
        return {
          id: `${now}-${index}-${Math.random().toString(36).slice(2)}`,
          url: raw.startsWith("http") ? raw : normalizeImageUrl(raw),
          filename: filename || undefined,
          prompt: base,
          styleName: style?.name,
          createdAt: now,
          tab: activeTab,
          location: defaultLocation,
        };
      });
      setImages((prev) => [...newItems, ...prev]);
      setStatus("Image generated.");
    } catch (err) {
      setStatus(`Error generating image: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateCharacter = async () => {
    if (!charRole.trim() && !charPhysical.trim() && !charOutfit.trim() && !charAge.trim()) return;

    setIsGeneratingCharacter(true);
    setStatus("Generating character image...");
    try {
      const result = await generateCharacterImage({
        role: charRole,
        physical_description: charPhysical,
        age: charAge,
        outfit: charOutfit,
        negative_prompt: charNegative,
        style_id: selectedCharacterStyleId,
      });
      const now = new Date().toISOString();
      const newItems: GeneratedImage[] = result.images.map((img, index) => {
        const raw = (img.url || img.filename || "") as string;
        const filename =
          (img as Record<string, unknown>).filename && typeof (img as Record<string, unknown>).filename === "string"
            ? String((img as Record<string, unknown>).filename)
            : (() => {
                try {
                  const u = new URL(raw, API_BASE);
                  const pathname = u.pathname || "";
                  const idx = pathname.lastIndexOf("/");
                  return idx >= 0 ? pathname.slice(idx + 1) : "";
                } catch {
                  return "";
                }
              })();
        return {
          id: `${now}-${index}-${Math.random().toString(36).slice(2)}`,
          url: raw.startsWith("http") ? raw : normalizeImageUrl(raw),
          filename: filename || undefined,
          prompt: result.prompt,
          styleName: result.style_name,
          createdAt: now,
          tab: "characters",
          location: defaultLocation,
        };
      });
      setImages((prev) => [...newItems, ...prev]);
      setStatus("Character image generated.");
    } catch (err) {
      setStatus(`Error generating character image: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsGeneratingCharacter(false);
    }
  };

  const handleGeneratePrompt = async () => {
    const src = prompt.trim();
    if (!src) return;
    setIsGeneratingPrompt(true);
    setStatus("Generating image prompt...");
    try {
      const generated = await generateImagePrompt(src);
      setGenPrompt(generated);
      setStatus("Image prompt generated.");
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const handleImagesPerRowChange = (value: string) => {
    const n = parseInt(value, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 8) setImagesPerRow(n);
  };

  const setImagesPerRowClamped = (delta: number) => {
    const n = imagesPerRow + delta;
    if (n >= 1 && n <= 8) setImagesPerRow(n);
  };

  const toggleImageLocation = useCallback(
    async (imageId: string) => {
      const target = images.find((img) => img.id === imageId);
      if (!target) return;
      if (!projectKey) {
        setStatus("Set an active project in Admin to sync images.");
        return;
      }
      if (!target.filename) {
        setStatus("Cannot determine filename for this image.");
        return;
      }
      // If currently in cloud, switch to local URL based on filename.
      if (target.location === "cloud") {
        const localUrl = normalizeImageUrl(`/images/${target.filename}?project_key=${encodeURIComponent(projectKey)}`);
        setImages((prev) =>
          prev.map((img) =>
            img.id === imageId
              ? {
                  ...img,
                  url: localUrl,
                  location: "local",
                }
              : img,
          ),
        );
        setStatus("Switched image to use local copy.");
        return;
      }
      // local -> cloud: upload via API
      try {
        setStatus("Uploading image to cloud...");
        const cloudUrl = await uploadImageToCloud(projectKey, target.filename);
        setImages((prev) =>
          prev.map((img) =>
            img.id === imageId
              ? {
                  ...img,
                  url: cloudUrl,
                  location: "cloud",
                }
              : img,
          ),
        );
        setStatus("Image uploaded to cloud.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setStatus(`Error uploading image: ${message}`);
      }
    },
    [images, projectKey],
  );

  const visibleImages = images.filter((img) => img.tab === (activeTab === "styles" ? "image" : activeTab));

  return (
    <main>
      <div className="imagegen-shell">
        <div className="imagegen-left">
          <div className="imagegen-panel">
            <h2 className="imagegen-panel-title">Image Generation</h2>
            <div className="imagegen-panel-body">
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                />
                <span>Private (save under my account)</span>
              </label>
              <div className="sidebar-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "image"}
                  className={activeTab === "image" ? "sidebar-tab active" : "sidebar-tab"}
                  onClick={() => setActiveTab("image")}
                >
                  Image
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
                  aria-selected={activeTab === "styles"}
                  className={activeTab === "styles" ? "sidebar-tab active" : "sidebar-tab"}
                  onClick={() => setActiveTab("styles")}
                >
                  Styles
                </button>
              </div>
              <div className="sidebar-tab-content">
                {activeTab === "image" && (
                  <ImageTabPanel
                    prompt={prompt}
                    genPrompt={genPrompt}
                    onPromptChange={setPrompt}
                    onGenPromptChange={setGenPrompt}
                    styles={styles}
                    selectedStyleId={selectedStyleId}
                    onSelectedStyleIdChange={setSelectedStyleId}
                    onGeneratePrompt={handleGeneratePrompt}
                    onGenerate={handleGenerate}
                    isGenerating={isGenerating}
                    isGeneratingPrompt={isGeneratingPrompt}
                    status={status}
                  />
                )}
                {activeTab === "characters" && (
                  <CharactersTabPanel
                    role={charRole}
                    physical={charPhysical}
                    age={charAge}
                    outfit={charOutfit}
                    negativePrompt={charNegative}
                    styles={styles}
                    selectedStyleId={selectedCharacterStyleId}
                    onSelectedStyleIdChange={setSelectedCharacterStyleId}
                    onRoleChange={setCharRole}
                    onPhysicalChange={setCharPhysical}
                    onAgeChange={setCharAge}
                    onOutfitChange={setCharOutfit}
                    onNegativePromptChange={setCharNegative}
                    onGenerateCharacter={handleGenerateCharacter}
                    isGenerating={isGeneratingCharacter}
                    status={status}
                  />
                )}
                {activeTab === "styles" && (
                  <div className="sidebar-panel-content" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div className="section-title" style={{ marginBottom: 8 }}>
                      Style bank
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {styles.map((s) => (
                        <div
                          key={s.id}
                          className="sidebar-item"
                          style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                            }}
                          >
                            <span className="sources-name" style={{ fontWeight: 600 }}>
                              {s.name}
                            </span>
                            <button
                              type="button"
                              className="admin-link"
                              onClick={() => void handleDeleteStyle(s.id)}
                              disabled={isManagingStyles}
                            >
                              Remove
                            </button>
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#9aa3b2",
                              whiteSpace: "pre-wrap",
                              maxHeight: 60,
                              overflow: "auto",
                            }}
                          >
                            {s.prompt || "(no prompt)"}
                          </div>
                        </div>
                      ))}
                      {styles.length === 0 && (
                        <div className="status" style={{ fontSize: 12 }}>
                          No styles in bank. Add one below.
                        </div>
                      )}
                    </div>
                    <StylesAddForm onAdd={handleAddStyle} disabled={isManagingStyles} />
                    {status && (
                      <div className="status" style={{ marginTop: 8 }}>
                        {status}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <ResultsPanel
          images={visibleImages}
          imagesPerRow={imagesPerRow}
          onImagesPerRowChange={handleImagesPerRowChange}
          onImagesPerRowStep={setImagesPerRowClamped}
          onDeleteImage={(id) => setImages((prev) => prev.filter((img) => img.id !== id))}
          onToggleLocation={toggleImageLocation}
          emptyMessage="No images yet. Enter a prompt and click Generate."
        />
      </div>
    </main>
  );
}
