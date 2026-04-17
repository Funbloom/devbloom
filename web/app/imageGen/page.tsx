"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  addStyle,
  deleteStyle,
  generateCharacterImage,
  generateImageFromPrompt,
  generateImagePrompt,
  getImageGenerated,
  importImageFile,
  getStyles,
  normalizeImageUrl,
  putImageGenerated,
  removeBackground,
  resolveReferenceForEditApi,
  uploadImageToCloud,
} from "./client";
import { IMAGEGEN_EDIT_CONTEXT_KEY, IMAGEGEN_EDIT_RETURN_KEY } from "./editKeys";
import { capturePanelSnapshot, getPanelSnapshot } from "./imagegenPanelSnapshot";
import { RunEditImageEffect } from "./RunEditImageEffect";
import { API_BASE, STORAGE_KEY_PROJECT } from "./config";
import { readImagegenMainStyleId, writeImagegenMainStyleId } from "../lib/imagegenMainStyle";
import { isGeminiImageConfirmCancelled } from "../lib/confirmGeminiImage";
import { IMAGEGEN_DEFAULT_IMAGE_MODEL, IMAGE_MODEL_OPTIONS } from "../lib/imageModels";
import { useAuth } from "../contexts/AuthContext";
import { fetchApi } from "../lib/api";
import { CharactersTabPanel } from "./CharactersTabPanel";
import { ImageTabPanel } from "./ImageTabPanel";
import { ResultsPanel } from "./ResultsPanel";
import { ImagegenTooltip } from "./ImagegenTooltip";
import { parseStoredImages, toPayload } from "./persistence";
import type { GeneratedImage, ImageLocation, ImageTab } from "./types";

/** Same pattern as UI Builder → Breakdown Activity (status + indeterminate progress). */
type ImageGenGenerateActivity = { message: string; isError: boolean } | null;

function ImageGenGenerateActivityBox({
  activity,
  working,
}: {
  activity: ImageGenGenerateActivity;
  working: boolean;
}) {
  return (
    <div
      style={{
        flexShrink: 0,
        marginBottom: "0.75rem",
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid #2a2f3a",
        background: "#0f1115",
      }}
      aria-live="polite"
      aria-busy={working}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#94a3b8",
          }}
        >
          Activity
        </div>
        {working && (
          <span style={{ fontSize: 11, color: "#22d3ee", fontWeight: 600 }}>Working…</span>
        )}
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.45,
          color: activity?.isError
            ? "#f87171"
            : activity
              ? "var(--foreground, #e2e8f0)"
              : "#94a3b8",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {activity === null
          ? "Ready — enter a prompt and click Generate."
          : activity.message}
      </div>
      {working && (
        <div className="breakdown-progress-track" role="progressbar" aria-valuetext="In progress" style={{ marginTop: 10 }}>
          <div className="breakdown-progress-bar" />
        </div>
      )}
    </div>
  );
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

function ImageGenPageInner() {
  const router = useRouter();
  const { session } = useAuth();
  const BG_DEFAULTS = {
    model: "isnet-general-use",
    alphaMatting: false,
    fgThreshold: 240,
    bgThreshold: 10,
  };
  const [projectKey, setProjectKey] = useState("");
  const [styles, setStyles] = useState<Awaited<ReturnType<typeof getStyles>>>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string>("__none");
  const [prompt, setPrompt] = useState("");
  const [genPrompt, setGenPrompt] = useState("");
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [imagesPerRow, setImagesPerRow] = useState(3);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditImageGenerating, setIsEditImageGenerating] = useState(false);
  const [isGeneratingCharacter, setIsGeneratingCharacter] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
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
  const [bgModel, setBgModel] = useState(BG_DEFAULTS.model);
  const [bgAlphaMatting, setBgAlphaMatting] = useState(BG_DEFAULTS.alphaMatting);
  const [bgFgThreshold, setBgFgThreshold] = useState(BG_DEFAULTS.fgThreshold);
  const [bgBgThreshold, setBgBgThreshold] = useState(BG_DEFAULTS.bgThreshold);
  const [sizePreset, setSizePreset] = useState<"square" | "portrait" | "landscape">(() => {
    const s = getPanelSnapshot();
    return s?.sizePreset ?? "square";
  });
  const [qualityPreset, setQualityPreset] = useState<"high" | "medium" | "low">(() => {
    const s = getPanelSnapshot();
    return s?.qualityPreset ?? "medium";
  });
  const [imageModel, setImageModel] = useState(() => getPanelSnapshot()?.imageModel ?? IMAGEGEN_DEFAULT_IMAGE_MODEL);
  const [openAiQuality, setOpenAiQuality] = useState(() => getPanelSnapshot()?.openAiQuality ?? "");
  const [openAiStyle, setOpenAiStyle] = useState(() => getPanelSnapshot()?.openAiStyle ?? "");
  const [openAiTransparent, setOpenAiTransparent] = useState(() => getPanelSnapshot()?.openAiTransparent ?? false);
  const [imageDefaults, setImageDefaults] = useState(() => ({
    num_images: 2,
    quality: (getPanelSnapshot()?.imageDefaultsQuality ?? "medium") as "high" | "medium" | "low",
  }));
  /** Image tab: generation status / errors (matches UI Builder Breakdown Activity). */
  const [generateActivity, setGenerateActivity] = useState<ImageGenGenerateActivity>(null);

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
        const data = (await response.json()) as {
          location?: string;
          num_images?: number;
          quality?: "high" | "medium" | "low";
        };
        const loc = data.location === "cloud" ? "cloud" : "local";
        setDefaultLocation(loc);
        setImageDefaults((prev) => ({
          ...prev,
          num_images: typeof data.num_images === "number" ? data.num_images : prev.num_images,
          quality: data.quality || prev.quality,
        }));
      } catch {
        // ignore, fall back to local
      }
    };
    void loadDefaults();
  }, [session]);

  const imageTabStylePrefHydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getStyles().then((data) => {
      if (!cancelled) setStyles(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (styles.length === 0) return;
    if (!imageTabStylePrefHydrated.current) {
      imageTabStylePrefHydrated.current = true;
      const saved = readImagegenMainStyleId();
      if (saved && styles.some((s) => s.id === saved)) {
        setSelectedStyleId(saved);
        return;
      }
    }
    writeImagegenMainStyleId(selectedStyleId);
  }, [styles, selectedStyleId]);

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

  useEffect(() => {
    capturePanelSnapshot({
      sizePreset,
      qualityPreset,
      imageDefaultsQuality: imageDefaults.quality,
      imageModel,
      openAiQuality,
      openAiStyle,
      openAiTransparent,
    });
  }, [
    sizePreset,
    qualityPreset,
    imageDefaults.quality,
    imageModel,
    openAiQuality,
    openAiStyle,
    openAiTransparent,
  ]);

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
    setStatus(null);
    setGenerateActivity({ message: "Preparing request (model, size, quality, style)…", isError: false });
    try {
      const style = selectedStyleId !== "__none" ? styles.find((s) => s.id === selectedStyleId) ?? null : null;
      let fullPrompt = base;
      if (style?.prompt) fullPrompt = `${style.prompt}\n\n${base}`;
      const sizeMap: Record<"high" | "medium" | "low", number> = {
        high: 1024,
        medium: 512,
        low: 256,
      };
      const quality = imageDefaults.quality || qualityPreset;
      const baseSize = sizeMap[quality] ?? 1024;
      let width = baseSize;
      let height = baseSize;
      if (sizePreset === "landscape") {
        width = baseSize;
        height = Math.max(1, Math.round((baseSize * 9) / 16));
      } else if (sizePreset === "portrait") {
        width = Math.max(1, Math.round((baseSize * 9) / 16));
        height = baseSize;
      }
      setGenerateActivity({
        message: `Calling image API (${imageModel}) at ${width}×${height}, ${imageDefaults.num_images} image(s) — this may take a while…`,
        isError: false,
      });
      const backendImages = await generateImageFromPrompt(fullPrompt, {
        width,
        height,
        numImages: imageDefaults.num_images,
        model: imageModel,
        quality: openAiQuality || undefined,
        style: openAiStyle || undefined,
        transparentBackground: openAiTransparent,
        ...(projectKey.trim() ? { projectKey: projectKey.trim() } : {}),
      });
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
      setGenerateActivity({
        message: `Finished — added ${newItems.length} image(s) to results.`,
        isError: false,
      });
    } catch (err) {
      if (isGeminiImageConfirmCancelled(err)) {
        setGenerateActivity({ message: "Cancelled.", isError: false });
      } else {
        const detail = err instanceof Error ? err.message : "Unknown error";
        setGenerateActivity({
          message: detail,
          isError: true,
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateCharacter = async () => {
    if (!charRole.trim() && !charPhysical.trim() && !charOutfit.trim() && !charAge.trim()) return;

    setIsGeneratingCharacter(true);
    setStatus("Generating character image...");
    try {
      const sizeMap: Record<"high" | "medium" | "low", number> = {
        high: 1024,
        medium: 512,
        low: 256,
      };
      const effectiveQuality = imageDefaults.quality || qualityPreset;
      const baseSize = sizeMap[effectiveQuality] ?? 1024;
      const result = await generateCharacterImage({
        role: charRole,
        physical_description: charPhysical,
        age: charAge,
        outfit: charOutfit,
        negative_prompt: charNegative,
        style_id: selectedCharacterStyleId,
        model: imageModel,
        width: baseSize,
        height: baseSize,
        quality: openAiQuality || undefined,
        style: openAiStyle || undefined,
        transparent_background: openAiTransparent,
        ...(projectKey.trim() ? { project_key: projectKey.trim() } : {}),
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
      if (isGeminiImageConfirmCancelled(err)) {
        setStatus(null);
      } else {
        setStatus(`Error generating character image: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
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

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!projectKey.trim()) {
      setStatus("Set an active project in Admin to import images.");
      return;
    }
    setIsImporting(true);
    setStatus("Importing image...");
    try {
      const backendImages = await importImageFile(file, projectKey.trim());
      const now = new Date().toISOString();
      const tab: ImageTab = activeTab === "characters" ? "characters" : "image";
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
          id: `${now}-import-${index}-${Math.random().toString(36).slice(2)}`,
          url: raw.startsWith("http") ? raw : normalizeImageUrl(raw),
          filename: filename || undefined,
          prompt: "Imported image",
          createdAt: now,
          tab,
          location: defaultLocation,
        };
      });
      setImages((prev) => [...newItems, ...prev]);
      setStatus("Image imported.");
    } catch (err) {
      setStatus(`Error importing image: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsImporting(false);
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

  const handleRemoveBackground = useCallback(
    async (imageId: string) => {
      const target = images.find((img) => img.id === imageId);
      if (!target) return;
      if (!projectKey) {
        setStatus("Set an active project in Admin to remove background.");
        return;
      }
      if (!target.filename) {
        setStatus("Cannot determine filename for this image.");
        return;
      }
      try {
        setStatus("Removing background...");
        const result = await removeBackground(target.filename, projectKey, {
          model: bgModel,
          alphaMatting: bgAlphaMatting,
          alphaMattingForegroundThreshold: bgFgThreshold,
          alphaMattingBackgroundThreshold: bgBgThreshold,
        });
        const now = new Date().toISOString();
        let url = typeof result.url === "string" ? result.url : "";
        if (url && !url.startsWith("http")) {
          url = normalizeImageUrl(url);
        }
        let location: ImageLocation = target.location ?? defaultLocation;
        let finalUrl = url;
        if (location === "cloud") {
          const uploaded = await uploadImageToCloud(projectKey, result.filename || target.filename);
          finalUrl = uploaded;
        }
        const newItem: GeneratedImage = {
          id: `${now}-${Math.random().toString(36).slice(2)}`,
          url: finalUrl,
          filename: result.filename || target.filename,
          prompt: target.prompt,
          styleName: target.styleName,
          createdAt: now,
          tab: target.tab,
          location,
        };
        setImages((prev) => [newItem, ...prev]);
        setStatus("Background removed.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setStatus(`Error removing background: ${message}`);
      }
    },
    [images, projectKey, defaultLocation],
  );

  const handleEditImage = useCallback(
    (img: GeneratedImage) => {
      try {
        resolveReferenceForEditApi(img);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Cannot edit this image.");
        return;
      }
      try {
        capturePanelSnapshot({
          sizePreset,
          qualityPreset,
          imageDefaultsQuality: imageDefaults.quality,
          imageModel,
          openAiQuality,
          openAiStyle,
          openAiTransparent,
        });
        sessionStorage.removeItem(IMAGEGEN_EDIT_RETURN_KEY);
        sessionStorage.setItem(IMAGEGEN_EDIT_CONTEXT_KEY, JSON.stringify(img));
      } catch {
        setStatus("Could not store image context.");
        return;
      }
      router.push("/imageGen/edit");
    },
    [
      router,
      sizePreset,
      qualityPreset,
      imageDefaults.quality,
      imageModel,
      openAiQuality,
      openAiStyle,
      openAiTransparent,
    ],
  );

  const visibleImages = images.filter((img) => img.tab === (activeTab === "styles" ? "image" : activeTab));

  return (
    <main>
      <input
        ref={importFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
        className="imagegen-hidden-file-input"
        aria-hidden
        tabIndex={-1}
        onChange={handleImportFileChange}
      />
      <Suspense fallback={null}>
        <RunEditImageEffect
          projectKey={projectKey}
          defaultLocation={defaultLocation}
          imageModel={imageModel}
          setImages={setImages}
          setStatus={setStatus}
          setIsEditImageGenerating={setIsEditImageGenerating}
          setGenerateActivity={setGenerateActivity}
          setActiveTab={setActiveTab}
        />
      </Suspense>
      <div className="imagegen-shell" style={{ position: "relative" }}>
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
                    model={imageModel}
                    modelOptions={IMAGE_MODEL_OPTIONS}
                    onModelChange={setImageModel}
                    openAiQuality={openAiQuality}
                    onOpenAiQualityChange={setOpenAiQuality}
                    openAiStyle={openAiStyle}
                    onOpenAiStyleChange={setOpenAiStyle}
                    openAiTransparent={openAiTransparent}
                    onOpenAiTransparentChange={setOpenAiTransparent}
                    sizePreset={sizePreset}
                    onSizePresetChange={setSizePreset}
                    qualityPreset={qualityPreset}
                    onQualityPresetChange={setQualityPreset}
                    onGeneratePrompt={handleGeneratePrompt}
                    onGenerate={handleGenerate}
                    isGenerating={isGenerating}
                    isGeneratingPrompt={isGeneratingPrompt}
                    status={isGenerating ? null : status}
                    onImportClick={() => importFileInputRef.current?.click()}
                    isImporting={isImporting}
                    importDisabled={!projectKey.trim()}
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
                    model={imageModel}
                    modelOptions={IMAGE_MODEL_OPTIONS}
                    onModelChange={setImageModel}
                    qualityPreset={qualityPreset}
                    onQualityPresetChange={setQualityPreset}
                    onGenerateCharacter={handleGenerateCharacter}
                    isGenerating={isGeneratingCharacter}
                    status={status}
                    onImportClick={() => importFileInputRef.current?.click()}
                    isImporting={isImporting}
                    importDisabled={!projectKey.trim()}
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
              <div className="sidebar-panel-content" style={{ marginTop: 16 }}>
                <div className="section-title" style={{ marginBottom: 8 }}>
                  Background Removal
                </div>
                <div className="sidebar-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                  <div className="imagegen-label-row">
                    <label className="imagegen-label" htmlFor="bg-model">
                      Model
                    </label>
                    <ImagegenTooltip text="Select the segmentation model. General models work for most images; portrait/anime models are specialized." />
                  </div>
                  <select
                    id="bg-model"
                    className="imagegen-select"
                    value={bgModel}
                    onChange={(e) => setBgModel(e.target.value)}
                  >
                    <option value="u2net">u2net</option>
                    <option value="isnet-general-use">isnet-general-use</option>
                    <option value="birefnet-general">birefnet-general</option>
                    <option value="birefnet-portrait">birefnet-portrait</option>
                    <option value="isnet-anime">isnet-anime</option>
                  </select>

                  <div className="imagegen-label-row">
                    <label className="imagegen-label" htmlFor="bg-alpha-matting">
                      Alpha matting
                    </label>
                    <ImagegenTooltip text="Enable alpha matting to refine soft edges like hair or fur. Can be slower." />
                  </div>
                  <select
                    id="bg-alpha-matting"
                    className="imagegen-select"
                    value={bgAlphaMatting ? "true" : "false"}
                    onChange={(e) => setBgAlphaMatting(e.target.value === "true")}
                  >
                    <option value="false">Off</option>
                    <option value="true">On</option>
                  </select>

                  <div className="imagegen-label-row">
                    <label className="imagegen-label" htmlFor="bg-fg-threshold">
                      Foreground threshold
                    </label>
                    <ImagegenTooltip text="Higher values keep more pixels as foreground. Lower values make the cutout tighter." />
                  </div>
                  <select
                    id="bg-fg-threshold"
                    className="imagegen-select"
                    value={String(bgFgThreshold)}
                    onChange={(e) => setBgFgThreshold(Number(e.target.value))}
                  >
                    {[50, 80, 100, 160, 200, 220, 240, 255].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>

                  <div className="imagegen-label-row">
                    <label className="imagegen-label" htmlFor="bg-bg-threshold">
                      Background threshold
                    </label>
                    <ImagegenTooltip text="Higher values treat more pixels as background. Lower values preserve more detail." />
                  </div>
                  <select
                    id="bg-bg-threshold"
                    className="imagegen-select"
                    value={String(bgBgThreshold)}
                    onChange={(e) => setBgBgThreshold(Number(e.target.value))}
                  >
                    {[0, 5, 10, 20, 30, 40, 60, 80].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="imagegen-delete-button"
                    onClick={() => {
                      setBgModel(BG_DEFAULTS.model);
                      setBgAlphaMatting(BG_DEFAULTS.alphaMatting);
                      setBgFgThreshold(BG_DEFAULTS.fgThreshold);
                      setBgBgThreshold(BG_DEFAULTS.bgThreshold);
                    }}
                  >
                    Reset to defaults
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="imagegen-right"
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: "min(70vh, 900px)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {(activeTab === "image" ||
            activeTab === "characters" ||
            isGenerating ||
            isEditImageGenerating) && (
            <ImageGenGenerateActivityBox
              activity={generateActivity}
              working={isGenerating || isEditImageGenerating}
            />
          )}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <ResultsPanel
              embedded
              images={visibleImages}
              imagesPerRow={imagesPerRow}
              onImagesPerRowChange={handleImagesPerRowChange}
              onImagesPerRowStep={setImagesPerRowClamped}
              onDeleteImage={(id) => setImages((prev) => prev.filter((img) => img.id !== id))}
              onToggleLocation={toggleImageLocation}
              onRemoveBackground={handleRemoveBackground}
              onEditImage={handleEditImage}
              emptyMessage="No images yet. Enter a prompt and click Generate."
            />
          </div>
        </div>
      </div>
    </main>
  );
}

export default ImageGenPageInner;
