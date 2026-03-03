"use client";

import { useCallback, useEffect, useState } from "react";

import type { Style } from "../storyboard/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const STORAGE_KEY_PROJECT = "activeProjectKey";

type GeneratedImage = {
  id: string;
  url: string;
  prompt: string;
  styleName?: string;
  createdAt: string;
  tab: "image" | "characters";
};

function normalizeImageUrl(url: string): string {
  if (url.startsWith("http")) return url;
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

export default function ImageGenPage() {
  const [projectKey, setProjectKey] = useState("");
  const [styles, setStyles] = useState<Style[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string | "__none">("__none");
  const [prompt, setPrompt] = useState("");
  const [genPrompt, setGenPrompt] = useState("");
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [imagesPerRow, setImagesPerRow] = useState(3);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"image" | "characters">("image");

  useEffect(() => {
    const key = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY_PROJECT) : null;
    setProjectKey(key?.trim() ?? "");
  }, []);

  useEffect(() => {
    const loadStyles = async () => {
      try {
        const response = await fetch(`${API_BASE}/storyboard/styles`);
        if (!response.ok) return;
        const data = (await response.json()) as Style[];
        if (Array.isArray(data)) {
          setStyles(data);
        }
      } catch {
        // ignore, styles remain empty
      }
    };
    void loadStyles();
  }, []);

  useEffect(() => {
    if (!projectKey) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(
          `${API_BASE}/tools/image_generated?project_key=${encodeURIComponent(projectKey)}`
        );
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { images?: unknown[] };
        const raw = data.images ?? [];
        if (!Array.isArray(raw) || cancelled) return;
        const parsed: GeneratedImage[] = raw
          .filter((img) => img && typeof (img as any).id === "string" && typeof (img as any).url === "string")
          .map((img) => {
            const anyImg = img as any;
            const rawTab = anyImg.tab;
            const tab: "image" | "characters" = rawTab === "characters" ? "characters" : "image";
            return {
              id: String(anyImg.id),
              url: normalizeImageUrl(String(anyImg.url)),
              prompt: typeof anyImg.prompt === "string" ? anyImg.prompt : "",
              styleName: typeof anyImg.styleName === "string" ? anyImg.styleName : undefined,
              createdAt:
                typeof anyImg.createdAt === "string" ? anyImg.createdAt : new Date(0).toISOString(),
              tab,
            };
          });
        if (!cancelled) setImages(parsed);
      } catch {
        if (!cancelled) setImages([]);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectKey]);

  const persistImages = useCallback(
    async (list: GeneratedImage[]) => {
      if (!projectKey) return;
      const payload = list.map((img) => ({
        id: img.id,
        url: img.url,
        prompt: img.prompt,
        styleName: img.styleName,
        createdAt: img.createdAt,
        tab: img.tab,
      }));
      try {
        await fetch(`${API_BASE}/tools/image_generated`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_key: projectKey, images: payload }),
        });
      } catch {
        // ignore persist errors
      }
    },
    [projectKey]
  );

  useEffect(() => {
    if (!projectKey) return;
    void persistImages(images);
  }, [projectKey, images, persistImages]);

  const handleGenerate = async () => {
    const base = genPrompt.trim() || prompt.trim();
    if (!base) return;
    setIsGenerating(true);
    setStatus("Generating image...");
    try {
      const style =
        selectedStyleId !== "__none" ? styles.find((s) => s.id === selectedStyleId) ?? null : null;
      let fullPrompt = base;
      if (style && style.prompt) {
        fullPrompt = `${style.prompt}\n\n${base}`;
      }
      const body = {
        prompt: fullPrompt,
      };
      const response = await fetch(`${API_BASE}/tools/generate_image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errBody = (await response.json().catch(() => ({}))) as {
          detail?: string | Array<{ loc?: unknown[]; msg?: string }>;
        };
        const detail = errBody.detail;
        const message =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail) && detail.length > 0 && detail[0].msg
              ? detail[0].msg
              : `Generate failed: ${response.status}`;
        throw new Error(message);
      }
      const data = (await response.json()) as { images?: { url?: string; filename?: string }[] };
      const now = new Date().toISOString();
      const sourceImages = (data.images ?? []).filter((img) => (img.url || img.filename || "") !== "");
      const newItems: GeneratedImage[] = sourceImages.map((img, index) => {
        const raw = img.url || img.filename!;
        const url = raw.startsWith("http")
          ? raw
          : `${API_BASE}${raw.startsWith("/") ? "" : "/"}${raw}`;
        return {
          id: `${now}-${index}-${Math.random().toString(36).slice(2)}`,
          url,
          prompt: base,
          styleName: style?.name,
          createdAt: now,
          tab: activeTab,
        };
      });
      setImages((prev) => [...newItems, ...prev]);
      setStatus("Image generated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error generating image: ${message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleImagesPerRowChange = (value: string) => {
    const n = parseInt(value, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 8) {
      setImagesPerRow(n);
    }
  };

  const setImagesPerRowClamped = (n: number) => {
    if (n >= 1 && n <= 8) setImagesPerRow(n);
  };

  const handleGeneratePrompt = async () => {
    const src = prompt.trim();
    if (!src) return;
    setIsGeneratingPrompt(true);
    setStatus("Generating image prompt...");
    try {
      const response = await fetch(`${API_BASE}/tools/generate_image_prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: src }),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error((errBody as { detail?: string }).detail ?? `Generate failed: ${response.status}`);
      }
      const data = (await response.json()) as { prompt?: string };
      if (data.prompt) {
        setGenPrompt(data.prompt);
      }
      setStatus("Image prompt generated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error generating image prompt: ${message}`);
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const visibleImages = images.filter((img) => img.tab === activeTab);

  return (
    <main>
      <div className="imagegen-shell">
        <div className="imagegen-left">
          <div className="imagegen-panel">
            <h2 className="imagegen-panel-title">Image Generation</h2>
            <div className="imagegen-panel-body">
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
              </div>
              <div className="sidebar-tab-content">
                {activeTab === "image" && (
                  <>
                    <label className="imagegen-label" htmlFor="imagegen-prompt">
                      Prompt (concept)
                    </label>
                    <textarea
                      id="imagegen-prompt"
                      className="imagegen-textarea"
                      placeholder="Describe the image you want to generate..."
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={4}
                    />

                    <label className="imagegen-label" htmlFor="imagegen-gen-prompt">
                      Generated Prompt
                    </label>
                    <textarea
                      id="imagegen-gen-prompt"
                      className="imagegen-textarea"
                      placeholder="Generated image prompt will appear here (you can edit it)."
                      value={genPrompt}
                      onChange={(e) => setGenPrompt(e.target.value)}
                      rows={4}
                    />

                    <button
                      type="button"
                      className="imagegen-generate-button"
                      onClick={handleGeneratePrompt}
                      disabled={isGeneratingPrompt || !prompt.trim()}
                    >
                      {isGeneratingPrompt ? "Generating Prompt..." : "Generate Prompt"}
                    </button>
                    <br /><br/>

                    <label className="imagegen-label" htmlFor="imagegen-style">
                      Style
                    </label>
                    <select
                      id="imagegen-style"
                      className="imagegen-select"
                      value={selectedStyleId}
                      onChange={(e) => setSelectedStyleId(e.target.value as "__none" | string)}
                    >
                      <option value="__none">(No style)</option>
                      {styles.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      className="imagegen-generate-button"
                      onClick={handleGenerate}
                      disabled={isGenerating || (!prompt.trim() && !genPrompt.trim())}
                    >
                      {isGenerating ? "Generating..." : "Generate"}
                    </button>

                    {status && <div className="status" style={{ marginTop: 8 }}>{status}</div>}
                  </>
                )}

                {activeTab === "characters" && (
                  <div style={{ fontSize: 13, color: "#9aa3b2" }}>
                    Characters image generation controls will go here.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="imagegen-right">
          <div className="imagegen-panel">
            <div className="imagegen-results-header">
              <h2 className="imagegen-panel-title">Results</h2>
              <div className="edit-actions imagegen-images-per-row-row" style={{ alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 14 }} htmlFor="imagegen-images-per-row">
                  Images per row:
                </label>
                <div className="imagegen-stepper">
                  <button
                    type="button"
                    aria-label="Decrease images per row"
                    className="imagegen-stepper-btn"
                    onClick={() => setImagesPerRowClamped(imagesPerRow - 1)}
                  >
                    −
                  </button>
                  <input
                    id="imagegen-images-per-row"
                    type="number"
                    min={1}
                    max={8}
                    value={imagesPerRow}
                    onChange={(e) => handleImagesPerRowChange(e.target.value)}
                    style={{ width: 56, padding: "6px 8px" }}
                  />
                  <button
                    type="button"
                    aria-label="Increase images per row"
                    className="imagegen-stepper-btn"
                    onClick={() => setImagesPerRowClamped(imagesPerRow + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <div
              className="imagegen-grid"
              style={{ gridTemplateColumns: `repeat(${imagesPerRow}, minmax(0, 1fr))` }}
            >
              {visibleImages.map((img) => (
                <div key={img.id} className="imagegen-card">
                  <div className="imagegen-card-image-wrap">
                    <img src={img.url} alt={img.prompt} className="imagegen-card-image" />
                  </div>
                  <div className="imagegen-card-meta">
                    {img.styleName && (
                      <div className="imagegen-card-style">Style: {img.styleName}</div>
                    )}
                    <div className="imagegen-card-prompt" title={img.prompt}>
                      {img.prompt}
                    </div>
                    <button
                      type="button"
                      className="imagegen-delete-button"
                      onClick={() => handleDeleteImage(img.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {visibleImages.length === 0 && (
                <div className="status" style={{ gridColumn: "1 / -1" }}>
                  No images yet. Enter a prompt and click Generate.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

