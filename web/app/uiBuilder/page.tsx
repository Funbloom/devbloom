"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { API_BASE, STORAGE_KEY_PROJECT } from "../imageGen/config";
import {
  generateImageFromPrompt,
  getImageGenerated,
  getStyles,
  importImageFile,
  normalizeImageUrl,
  putImageGenerated,
  removeBackground,
  resolveReferenceForEditApi,
  uploadImageToCloud,
} from "../imageGen/client";
import { readImagegenMainStyleId, writeImagegenMainStyleId } from "../lib/imagegenMainStyle";
import { IMAGEGEN_DEFAULT_IMAGE_MODEL, IMAGE_MODEL_OPTIONS } from "../lib/imageModels";
import type { Style } from "../storyboard/types";
import { IMAGEGEN_EDIT_CONTEXT_KEY, IMAGEGEN_EDIT_RETURN_KEY } from "../imageGen/editKeys";
import { parseStoredImages, toPayload } from "../imageGen/persistence";
import { ResultsPanel } from "../imageGen/ResultsPanel";
import type { GeneratedImage, ImageLocation } from "../imageGen/types";
import type { DrawTool } from "./penPalette";
import { UI_PEN_TASKS } from "./penPalette";
import { SketchCanvas, type SketchCanvasHandle } from "./SketchCanvas";
import {
  buildStyleReferencePromptAppend,
  buildUiCanvasPolishPrompt,
  maxUiStyleReferenceImages,
} from "./uicanvasPrompt";

type BuilderTab = "generate" | "draw";

const UIBUILDER_IMAGE_MODEL_STORAGE_KEY = "uibuilder_image_model";
/** Per-project list of Images/ filenames for style-only references (max 3). */
const UIBUILDER_STYLE_REFS_STORAGE_PREFIX = "uibuilder_style_ref_filenames:";
const MAX_STYLE_REFS = maxUiStyleReferenceImages();

function readPersistedStyleRefFilenames(projectKey: string): string[] {
  if (typeof window === "undefined" || !projectKey.trim()) return [];
  try {
    const raw = window.localStorage.getItem(`${UIBUILDER_STYLE_REFS_STORAGE_PREFIX}${projectKey.trim()}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim())
      .slice(0, MAX_STYLE_REFS);
  } catch {
    return [];
  }
}

function writePersistedStyleRefFilenames(projectKey: string, filenames: string[]) {
  if (typeof window === "undefined" || !projectKey.trim()) return;
  try {
    window.localStorage.setItem(
      `${UIBUILDER_STYLE_REFS_STORAGE_PREFIX}${projectKey.trim()}`,
      JSON.stringify(filenames.slice(0, MAX_STYLE_REFS)),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

const BG_DEFAULTS = {
  model: "isnet-general-use" as const,
  alphaMatting: false,
  fgThreshold: 240,
  bgThreshold: 10,
};

/**
 * UI Builder — studio tool (all projects). Layout mirrors Image Gen: fixed-width left panel + flexible right panel.
 */
export default function UIBuilderPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<BuilderTab>("generate");
  const [brushSize, setBrushSize] = useState(4);
  const [tool, setTool] = useState<DrawTool>("background");
  const [drawingName, setDrawingName] = useState("");
  const sketchRef = useRef<SketchCanvasHandle>(null);

  const [projectKey, setProjectKey] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [uiCanvasImages, setUiCanvasImages] = useState<GeneratedImage[]>([]);
  const [imagesPerRow, setImagesPerRow] = useState(3);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generatingPolish, setGeneratingPolish] = useState(false);
  const [selectedSketchIds, setSelectedSketchIds] = useState<string[]>([]);
  const [extraPolishPrompt, setExtraPolishPrompt] = useState("");
  /** Filenames in project Images/ — used only for visual style (max MAX_STYLE_REFS), passed after the wireframe ref. */
  const [styleReferenceFilenames, setStyleReferenceFilenames] = useState<string[]>([]);
  const [styleRefUploadError, setStyleRefUploadError] = useState<string | null>(null);
  const [uploadingStyleRefs, setUploadingStyleRefs] = useState(false);
  const styleRefFileInputRef = useRef<HTMLInputElement>(null);
  /** When set, Save overwrites this file and updates the same gallery entry. */
  const [sketchEditTarget, setSketchEditTarget] = useState<{
    id: string;
    filename: string;
    location: ImageLocation;
  } | null>(null);
  const [pendingSketchRestore, setPendingSketchRestore] = useState<{ url: string } | null>(null);
  /** Skip one persist write right after hydrating style refs from localStorage (avoids wiping with []). */
  const skipNextStyleRefPersist = useRef(false);

  const setBuilderTab = useCallback(
    (t: BuilderTab) => {
      if (tab === "draw" && t === "generate" && sketchEditTarget) {
        setSketchEditTarget(null);
        setPendingSketchRestore(null);
      }
      setTab(t);
    },
    [tab, sketchEditTarget],
  );

  const [styles, setStyles] = useState<Style[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string>("__none");
  const [imageModel, setImageModel] = useState(IMAGEGEN_DEFAULT_IMAGE_MODEL);
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
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(UIBUILDER_IMAGE_MODEL_STORAGE_KEY)?.trim();
    if (raw && IMAGE_MODEL_OPTIONS.some((o) => o.value === raw)) {
      setImageModel(raw);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(UIBUILDER_IMAGE_MODEL_STORAGE_KEY, imageModel);
  }, [imageModel]);

  useEffect(() => {
    const key = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY_PROJECT) : null;
    setProjectKey(key?.trim() ?? "");
  }, []);

  useEffect(() => {
    skipNextStyleRefPersist.current = true;
    setStyleReferenceFilenames(readPersistedStyleRefFilenames(projectKey));
    setStyleRefUploadError(null);
  }, [projectKey]);

  useEffect(() => {
    if (!projectKey.trim()) return;
    if (skipNextStyleRefPersist.current) {
      skipNextStyleRefPersist.current = false;
      return;
    }
    writePersistedStyleRefFilenames(projectKey, styleReferenceFilenames);
  }, [projectKey, styleReferenceFilenames]);

  useEffect(() => {
    const onProject = () => {
      const key = window.localStorage.getItem(STORAGE_KEY_PROJECT)?.trim() ?? "";
      setProjectKey(key);
    };
    window.addEventListener("activeProjectChanged", onProject);
    window.addEventListener("storage", onProject);
    return () => {
      window.removeEventListener("activeProjectChanged", onProject);
      window.removeEventListener("storage", onProject);
    };
  }, []);

  const reloadUiCanvasImages = useCallback(async () => {
    if (!projectKey) {
      setUiCanvasImages([]);
      return;
    }
    try {
      const { images: raw } = await getImageGenerated(projectKey, { private: isPrivate });
      const all = parseStoredImages(raw);
      setUiCanvasImages(all.filter((img) => img.tab === "ui_canvas"));
    } catch {
      setUiCanvasImages([]);
    }
  }, [projectKey, isPrivate]);

  useEffect(() => {
    void reloadUiCanvasImages();
  }, [reloadUiCanvasImages, pathname]);

  useEffect(() => {
    const valid = new Set(
      uiCanvasImages.filter((img) => img.fromSketch && img.filename?.trim()).map((img) => img.id),
    );
    setSelectedSketchIds((prev) => prev.filter((id) => valid.has(id)));
  }, [uiCanvasImages]);

  useEffect(() => {
    if (tab !== "draw" || !pendingSketchRestore) return;
    let cancelled = false;
    const run = async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const ok = await sketchRef.current?.loadFromUrl(pendingSketchRestore.url);
      if (cancelled) return;
      setPendingSketchRestore(null);
      if (!ok) setStatus("Could not load the sketch into the canvas.");
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [tab, pendingSketchRestore]);

  const persistFullList = useCallback(
    async (next: GeneratedImage[]) => {
      if (!projectKey) return;
      await putImageGenerated(projectKey, next.map(toPayload), { private: isPrivate });
    },
    [projectKey, isPrivate],
  );

  const loadAllImages = useCallback(async (): Promise<GeneratedImage[]> => {
    if (!projectKey) return [];
    const { images: raw } = await getImageGenerated(projectKey, { private: isPrivate });
    return parseStoredImages(raw);
  }, [projectKey, isPrivate]);

  const handleSaveDrawing = async () => {
    const name = drawingName.trim();
    if (!name) {
      setStatus("Enter a name for your drawing.");
      return;
    }
    if (!projectKey) {
      setStatus("Set an active project in Admin first.");
      return;
    }
    const blob = await sketchRef.current?.getPngBlob();
    if (!blob) {
      setStatus("Could not read the sketch.");
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const file = new File([blob], "uicanvas-sketch.png", { type: "image/png" });
      const all = await loadAllImages();

      if (sketchEditTarget) {
        const imported = await importImageFile(file, projectKey, {
          replaceFilename: sketchEditTarget.filename,
        });
        const first = imported[0];
        if (!first?.filename) {
          setStatus("Upload did not return a filename.");
          return;
        }
        let finalUrl = first.url?.startsWith("http") ? first.url : normalizeImageUrl(first.url || "");
        if (sketchEditTarget.location === "cloud") {
          setStatus("Updating cloud copy…");
          finalUrl = await uploadImageToCloud(projectKey, sketchEditTarget.filename);
        }
        const now = new Date().toISOString();
        const next = all.map((img) =>
          img.id === sketchEditTarget.id
            ? {
                ...img,
                url: finalUrl,
                filename: sketchEditTarget.filename,
                prompt: name,
                createdAt: now,
                fromSketch: true,
              }
            : img,
        );
        await persistFullList(next);
        await reloadUiCanvasImages();
        setSketchEditTarget(null);
        setPendingSketchRestore(null);
        setDrawingName("");
        setTab("generate");
        setStatus("Drawing saved.");
        return;
      }

      const imported = await importImageFile(file, projectKey);
      const first = imported[0];
      if (!first?.filename) {
        setStatus("Upload did not return a filename.");
        return;
      }
      const now = new Date().toISOString();
      const newItem: GeneratedImage = {
        id: `${now}-${Math.random().toString(36).slice(2)}`,
        url: first.url?.startsWith("http") ? first.url : normalizeImageUrl(first.url || ""),
        filename: first.filename,
        prompt: name,
        styleName: "UI Canvas",
        createdAt: now,
        tab: "ui_canvas",
        location: "local",
        fromSketch: true,
      };
      await persistFullList([...all, newItem]);
      await reloadUiCanvasImages();
      setDrawingName("");
      setTab("generate");
      setStatus("Drawing saved.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteImage = async (id: string) => {
    if (!projectKey) return;
    try {
      const all = await loadAllImages();
      await persistFullList(all.filter((img) => img.id !== id));
      if (sketchEditTarget?.id === id) setSketchEditTarget(null);
      await reloadUiCanvasImages();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const handleToggleLocation = async (imageId: string) => {
    if (!projectKey) {
      setStatus("Set an active project in Admin.");
      return;
    }
    const all = await loadAllImages();
    const target = all.find((img) => img.id === imageId);
    if (!target?.filename) {
      setStatus("Cannot determine filename for this image.");
      return;
    }
    try {
      if (target.location === "cloud") {
        const localUrl = normalizeImageUrl(`/images/${target.filename}?project_key=${encodeURIComponent(projectKey)}`);
        const next = all.map((img) =>
          img.id === imageId ? { ...img, url: localUrl, location: "local" as ImageLocation } : img,
        );
        await persistFullList(next);
        setStatus("Switched image to use local copy.");
      } else {
        setStatus("Uploading image to cloud...");
        const cloudUrl = await uploadImageToCloud(projectKey, target.filename);
        const next = all.map((img) =>
          img.id === imageId ? { ...img, url: cloudUrl, location: "cloud" as ImageLocation } : img,
        );
        await persistFullList(next);
        setStatus("Image uploaded to cloud.");
      }
      await reloadUiCanvasImages();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Location update failed.");
    }
  };

  const handleRemoveBackground = async (imageId: string) => {
    if (!projectKey) {
      setStatus("Set an active project in Admin.");
      return;
    }
    const all = await loadAllImages();
    const target = all.find((img) => img.id === imageId);
    if (!target?.filename) {
      setStatus("Cannot determine filename for this image.");
      return;
    }
    try {
      setStatus("Removing background...");
      const result = await removeBackground(target.filename, projectKey, {
        model: BG_DEFAULTS.model,
        alphaMatting: BG_DEFAULTS.alphaMatting,
        alphaMattingForegroundThreshold: BG_DEFAULTS.fgThreshold,
        alphaMattingBackgroundThreshold: BG_DEFAULTS.bgThreshold,
      });
      const now = new Date().toISOString();
      let url = typeof result.url === "string" ? result.url : "";
      if (url && !url.startsWith("http")) url = normalizeImageUrl(url);
      let location: ImageLocation = target.location ?? "local";
      let finalUrl = url;
      if (location === "cloud") {
        finalUrl = await uploadImageToCloud(projectKey, result.filename || target.filename);
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
        ...(target.fromSketch ? { fromSketch: true } : {}),
      };
      await persistFullList([newItem, ...all]);
      setStatus("Background removed.");
      await reloadUiCanvasImages();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Remove background failed.");
    }
  };

  const handleEditImage = (img: GeneratedImage) => {
    if (img.tab === "ui_canvas" && img.fromSketch && img.filename?.trim()) {
      setSketchEditTarget({
        id: img.id,
        filename: img.filename.trim(),
        location: img.location ?? "local",
      });
      setDrawingName(img.prompt || "");
      setPendingSketchRestore({ url: normalizeImageUrl(img.url) });
      setTab("draw");
      setStatus(null);
      return;
    }
    try {
      resolveReferenceForEditApi(img);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Cannot edit this image.");
      return;
    }
    try {
      sessionStorage.setItem(IMAGEGEN_EDIT_RETURN_KEY, "/uiBuilder");
      sessionStorage.setItem(IMAGEGEN_EDIT_CONTEXT_KEY, JSON.stringify(img));
    } catch {
      setStatus("Could not store image context.");
      return;
    }
    router.push("/imageGen/edit");
  };

  const removeStyleReferenceAt = useCallback((index: number) => {
    setStyleReferenceFilenames((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addStyleReferencesFromFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      if (!projectKey?.trim()) {
        const msg = "Select a project in Admin before adding reference images from disk.";
        setStyleRefUploadError(msg);
        setStatus(msg);
        return;
      }
      const pk = projectKey.trim();
      setStyleRefUploadError(null);
      setUploadingStyleRefs(true);
      try {
        const newFns: string[] = [];
        for (const file of files) {
          if (newFns.length >= MAX_STYLE_REFS) break;
          const imported = await importImageFile(file, pk);
          const fn = imported[0]?.filename?.trim();
          if (!fn) {
            const line = `Could not save "${file.name}" — no filename in the server response.`;
            setStyleRefUploadError(line);
            setStatus(line);
            continue;
          }
          if (!newFns.includes(fn)) newFns.push(fn);
        }
        if (newFns.length === 0) {
          return;
        }
        setStyleReferenceFilenames((prev) => {
          const merged = [...prev];
          for (const fn of newFns) {
            if (merged.length >= MAX_STYLE_REFS) break;
            if (!merged.includes(fn)) merged.push(fn);
          }
          return merged.slice(0, MAX_STYLE_REFS);
        });
        setStyleRefUploadError(null);
        setStatus(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Reference upload failed.";
        setStyleRefUploadError(msg);
        setStatus(msg);
      } finally {
        setUploadingStyleRefs(false);
      }
    },
    [projectKey],
  );

  const onStyleRefFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const picked = input.files?.length ? Array.from(input.files) : [];
    input.value = "";
    void addStyleReferencesFromFiles(picked);
  };

  const handleSketchSelectionChange = useCallback((id: string, selected: boolean) => {
    setSelectedSketchIds((prev) => {
      if (selected) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  }, []);

  const selectedSketchesForPolish = useMemo(
    () =>
      uiCanvasImages.filter(
        (img) => img.fromSketch && selectedSketchIds.includes(img.id) && img.filename?.trim(),
      ),
    [uiCanvasImages, selectedSketchIds],
  );

  const handleBatchWireframeGenerate = async () => {
    if (!projectKey?.trim()) {
      setStatus("Set an active project in Admin first.");
      return;
    }
    if (selectedSketchesForPolish.length === 0) {
      setStatus("Select at least one sketch with a saved file.");
      return;
    }
    setGeneratingPolish(true);
    setStatus(null);
    const style =
      selectedStyleId !== "__none" ? styles.find((s) => s.id === selectedStyleId) ?? null : null;
    const extra = extraPolishPrompt.trim();
    try {
      for (let i = 0; i < selectedSketchesForPolish.length; i++) {
        const img = selectedSketchesForPolish[i];
        const fn = img.filename!.trim();
        setStatus(`Generating ${i + 1} of ${selectedSketchesForPolish.length}…`);
        let promptBody = buildUiCanvasPolishPrompt(img.prompt || "UI sketch");
        if (style?.prompt?.trim()) {
          promptBody = `${style.prompt.trim()}\n\n${promptBody}`;
        }
        if (extra) {
          promptBody = `${promptBody}\n\nAdditional instructions from the user:\n${extra}`;
        }
        const styleRefs = styleReferenceFilenames.slice(0, MAX_STYLE_REFS);
        if (styleRefs.length > 0) {
          promptBody = `${promptBody}\n\n${buildStyleReferencePromptAppend(styleRefs.length)}`;
        }
        const refList = [fn, ...styleRefs.filter((s) => s !== fn)];
        const results = await generateImageFromPrompt(promptBody, {
          projectKey: projectKey.trim(),
          model: imageModel,
          width: 1024,
          height: 1024,
          numImages: 1,
          referenceImageFilenames: refList,
        });
        const first = results[0];
        if (!first) {
          setStatus(`Generation returned no image for "${(img.prompt || "").trim() || "sketch"}".`);
          return;
        }
        const rawUrl = (first.url || first.filename || "") as string;
        const filename =
          typeof first.filename === "string" && first.filename
            ? first.filename
            : (() => {
                try {
                  const u = new URL(rawUrl, API_BASE);
                  const pathname = u.pathname || "";
                  const idx = pathname.lastIndexOf("/");
                  return idx >= 0 ? pathname.slice(idx + 1) : "";
                } catch {
                  return "";
                }
              })();
        const all = await loadAllImages();
        const now = new Date().toISOString();
        const sketchLabel = (img.prompt || "").trim() || "sketch";
        const newItem: GeneratedImage = {
          id: `${now}-${Math.random().toString(36).slice(2)}`,
          url: rawUrl.startsWith("http") ? rawUrl : normalizeImageUrl(rawUrl),
          filename: filename || undefined,
          prompt: `UI polish from wireframe: "${sketchLabel}"`,
          styleName: style?.name ?? img.styleName ?? "UI Canvas",
          createdAt: now,
          tab: "ui_canvas",
          location: "local",
        };
        await persistFullList([newItem, ...all]);
        await reloadUiCanvasImages();
      }
      setSelectedSketchIds([]);
      setStatus(`Generated ${selectedSketchesForPolish.length} polished image(s).`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Generate failed.");
    } finally {
      setGeneratingPolish(false);
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

  const saveDisabled = saving || !drawingName.trim() || !projectKey;

  const polishGenerateDisabled =
    generatingPolish ||
    !projectKey?.trim() ||
    selectedSketchesForPolish.length === 0;

  const clearSketchCanvas = () => {
    sketchRef.current?.clear();
    setSketchEditTarget(null);
  };

  return (
    <main>
      <div className="imagegen-shell">
        <div className="imagegen-left">
          <div className="imagegen-panel">
            <h2 className="imagegen-panel-title">Tools</h2>
            <div className="imagegen-panel-body" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                />
                <span>Private (save under my account)</span>
              </label>
              {!projectKey && (
                <p style={{ margin: 0, fontSize: 12, color: "#fbbf24" }}>Select a project in Admin to save sketches.</p>
              )}

              <div className="sidebar-tabs" role="tablist" aria-label="UI Builder mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "generate"}
                  className={tab === "generate" ? "sidebar-tab active" : "sidebar-tab"}
                  onClick={() => setBuilderTab("generate")}
                >
                  Generate
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "draw"}
                  className={tab === "draw" ? "sidebar-tab active" : "sidebar-tab"}
                  onClick={() => setBuilderTab("draw")}
                >
                  Draw
                </button>
              </div>

              <div className="sidebar-tab-content">
                {tab === "generate" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <p style={{ margin: 0, fontSize: 14, color: "var(--muted, #94a3b8)" }}>
                      Saved <strong style={{ color: "var(--foreground, #e2e8f0)" }}>UI Canvas</strong> images appear in
                      the preview. Use the <strong>Select</strong> checkbox on sketch tiles. Optionally add up to{" "}
                      {MAX_STYLE_REFS} <strong>style reference</strong> images (look only, not content). Then set Style,
                      Image model, optional extra prompt, and <strong>Generate polished UI</strong>.
                    </p>
                    <fieldset
                      style={{
                        margin: 0,
                        padding: "0.65rem 0.75rem",
                        border: "1px solid #2a2f3a",
                        borderRadius: 8,
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                      }}
                    >
                      <legend style={{ fontSize: 13, color: "var(--foreground, #e2e8f0)", padding: "0 0.25rem" }}>
                        Style references (max {MAX_STYLE_REFS})
                      </legend>
                      <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                        Use for palette, typography, and surface style — not layout or subject matter. Shown to the
                        model after your wireframe sketch.
                      </p>
                      {styleRefUploadError && (
                        <p style={{ margin: 0, fontSize: 12, color: "#f87171" }} role="alert">
                          {styleRefUploadError}
                        </p>
                      )}
                      {uploadingStyleRefs && (
                        <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>Uploading…</p>
                      )}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                          gap: "0.5rem",
                        }}
                        aria-label="Style reference slots"
                      >
                        {Array.from({ length: MAX_STYLE_REFS }, (_, slotIndex) => {
                          const fn = styleReferenceFilenames[slotIndex];
                          const hasImage = Boolean(fn && projectKey?.trim());
                          return (
                            <div
                              key={slotIndex}
                              style={{
                                position: "relative",
                                aspectRatio: "1",
                                maxHeight: 96,
                                borderRadius: 8,
                                border: `1px ${fn ? "solid" : "dashed"} #3d4554`,
                                background: "#0a0c10",
                                overflow: "hidden",
                              }}
                            >
                              {hasImage ? (
                                <>
                                  <img
                                    src={normalizeImageUrl(
                                      `/images/${encodeURIComponent(fn!)}?project_key=${encodeURIComponent(projectKey)}`,
                                    )}
                                    alt=""
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover",
                                      display: "block",
                                    }}
                                  />
                                  <span
                                    style={{
                                      position: "absolute",
                                      bottom: 0,
                                      left: 0,
                                      right: 0,
                                      padding: "2px 4px",
                                      fontSize: 9,
                                      color: "#cbd5e1",
                                      background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                    title={fn!}
                                  >
                                    {fn}
                                  </span>
                                  <button
                                    type="button"
                                    aria-label={`Remove style reference ${slotIndex + 1}`}
                                    title="Remove"
                                    disabled={generatingPolish || uploadingStyleRefs}
                                    onClick={() => removeStyleReferenceAt(slotIndex)}
                                    style={{
                                      position: "absolute",
                                      top: 4,
                                      right: 4,
                                      zIndex: 2,
                                      width: 26,
                                      height: 26,
                                      borderRadius: 6,
                                      border: "1px solid rgba(255,255,255,0.2)",
                                      background: "rgba(15,17,21,0.85)",
                                      color: "#f1f5f9",
                                      cursor: generatingPolish ? "not-allowed" : "pointer",
                                      fontSize: 16,
                                      lineHeight: 1,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      padding: 0,
                                    }}
                                  >
                                    ×
                                  </button>
                                </>
                              ) : (
                                <div
                                  style={{
                                    height: "100%",
                                    minHeight: 56,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 4,
                                    padding: 6,
                                    fontSize: 11,
                                    color: "var(--muted, #64748b)",
                                    textAlign: "center",
                                  }}
                                >
                                  <span
                                    aria-hidden
                                    style={{
                                      fontSize: 20,
                                      opacity: 0.45,
                                      lineHeight: 1,
                                    }}
                                  >
                                    +
                                  </span>
                                  <span>Empty</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <input
                        ref={styleRefFileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        style={{ display: "none" }}
                        onChange={onStyleRefFileInputChange}
                      />
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                        <button
                          type="button"
                          className="imagegen-import-button"
                          disabled={
                            generatingPolish ||
                            uploadingStyleRefs ||
                            !projectKey?.trim() ||
                            styleReferenceFilenames.length >= MAX_STYLE_REFS
                          }
                          onClick={() => styleRefFileInputRef.current?.click()}
                        >
                          {uploadingStyleRefs ? "Uploading…" : "Add from disk"}
                        </button>
                        <label htmlFor="uibuilder-style-ref-gallery" className="imagegen-label" style={{ margin: 0 }}>
                          From UI Canvas
                        </label>
                        <select
                          id="uibuilder-style-ref-gallery"
                          className="imagegen-select"
                          style={{ flex: 1, minWidth: 160 }}
                          value=""
                          disabled={
                            generatingPolish ||
                            uploadingStyleRefs ||
                            !projectKey?.trim() ||
                            styleReferenceFilenames.length >= MAX_STYLE_REFS
                          }
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            e.target.value = "";
                            if (!v) return;
                            setStyleReferenceFilenames((prev) => {
                              if (prev.length >= MAX_STYLE_REFS || prev.includes(v)) return prev;
                              return [...prev, v];
                            });
                            setStyleRefUploadError(null);
                          }}
                        >
                          <option value="">Choose an image…</option>
                          {uiCanvasImages
                            .filter(
                              (img) =>
                                img.filename?.trim() &&
                                !styleReferenceFilenames.includes(img.filename.trim()),
                            )
                            .map((img) => {
                              const fn = img.filename!.trim();
                              const label = (img.prompt || fn).trim();
                              const short = label.length > 52 ? `${label.slice(0, 52)}…` : label;
                              return (
                                <option key={img.id} value={fn}>
                                  {short}
                                </option>
                              );
                            })}
                        </select>
                      </div>
                    </fieldset>
                    <label className="imagegen-label" htmlFor="uibuilder-style">
                      Style
                    </label>
                    <select
                      id="uibuilder-style"
                      className="imagegen-select"
                      value={selectedStyleId}
                      onChange={(e) => setSelectedStyleId(e.target.value)}
                    >
                      <option value="__none">(No style)</option>
                      {styles.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <label className="imagegen-label" htmlFor="uibuilder-image-model">
                      Image model
                    </label>
                    <select
                      id="uibuilder-image-model"
                      className="imagegen-select"
                      value={imageModel}
                      onChange={(e) => setImageModel(e.target.value)}
                    >
                      {IMAGE_MODEL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                      Same style bank as Image Gen. Image model is saved in the browser for UI Builder.
                    </p>
                    <label className="imagegen-label" htmlFor="uibuilder-extra-polish-prompt">
                      Extra prompt (optional)
                    </label>
                    <textarea
                      id="uibuilder-extra-polish-prompt"
                      value={extraPolishPrompt}
                      onChange={(e) => setExtraPolishPrompt(e.target.value)}
                      placeholder="Appended to the wireframe polish prompt — e.g. dark theme, high contrast, large tap targets."
                      rows={4}
                      disabled={generatingPolish}
                      style={{
                        width: "100%",
                        resize: "vertical",
                        minHeight: 88,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #2a2f3a",
                        background: "#0f1115",
                        color: "var(--foreground, #e2e8f0)",
                        fontSize: 13,
                        fontFamily: "inherit",
                      }}
                    />
                    <button
                      type="button"
                      className="imagegen-generate-button"
                      style={{ width: "100%", marginTop: 0 }}
                      disabled={polishGenerateDisabled}
                      onClick={() => void handleBatchWireframeGenerate()}
                    >
                      {generatingPolish
                        ? "Generating…"
                        : `Generate polished UI${selectedSketchesForPolish.length ? ` (${selectedSketchesForPolish.length})` : ""}`}
                    </button>
                  </div>
                )}

                {tab === "draw" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <label style={{ display: "grid", gap: "0.35rem", fontSize: 13 }}>
                      <span>Drawing name</span>
                      <input
                        type="text"
                        value={drawingName}
                        onChange={(e) => setDrawingName(e.target.value)}
                        placeholder="e.g. HUD wireframe v1"
                        autoComplete="off"
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #2a2f3a",
                          background: "#0f1115",
                          color: "var(--foreground, #e2e8f0)",
                          fontSize: 14,
                        }}
                      />
                    </label>

                    <label style={{ display: "grid", gap: "0.35rem", fontSize: 13 }}>
                      <span>Brush size ({brushSize}px)</span>
                      <input
                        type="range"
                        min={1}
                        max={48}
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                      />
                    </label>

                    <fieldset
                      style={{
                        margin: 0,
                        padding: "0.5rem 0.75rem",
                        border: "1px solid #2a2f3a",
                        borderRadius: 8,
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.4rem",
                      }}
                    >
                      <legend style={{ fontSize: 12, color: "var(--muted, #94a3b8)", padding: "0 0.25rem" }}>
                        Pens (by UI task)
                      </legend>
                      {UI_PEN_TASKS.map((p) => (
                        <label
                          key={p.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            cursor: "pointer",
                            fontSize: 13,
                          }}
                        >
                          <input
                            type="radio"
                            name="uibuilder-draw-tool"
                            checked={tool === p.id}
                            onChange={() => setTool(p.id)}
                          />
                          <span
                            aria-hidden
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 4,
                              background: p.color,
                              border: "1px solid rgba(255,255,255,0.25)",
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <strong style={{ color: "var(--foreground, #e2e8f0)" }}>{p.label}</strong>
                            <span style={{ color: "var(--muted, #94a3b8)", fontSize: 11, marginLeft: 6 }}>
                              ({p.shortLabel})
                            </span>
                          </span>
                        </label>
                      ))}
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          cursor: "pointer",
                          fontSize: 13,
                          marginTop: 4,
                          paddingTop: 6,
                          borderTop: "1px solid #2a2f3a",
                        }}
                      >
                        <input
                          type="radio"
                          name="uibuilder-draw-tool"
                          checked={tool === "eraser"}
                          onChange={() => setTool("eraser")}
                        />
                        <span style={{ flex: 1 }}>Eraser</span>
                      </label>
                    </fieldset>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                      <button type="button" onClick={clearSketchCanvas}>
                        Clear
                      </button>
                      <button type="button" disabled={saveDisabled} onClick={() => void handleSaveDrawing()}>
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {status && (
                <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }} role="status">
                  {status}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="imagegen-right">
          <div
            className="imagegen-panel"
            style={{
              flex: 1,
              minHeight: "min(70vh, 900px)",
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            {tab === "draw" ? (
              <>
                <h2 className="imagegen-panel-title">Sketch</h2>
                <div
                  className="imagegen-panel-body"
                  style={{
                    flex: 1,
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <SketchCanvas ref={sketchRef} brushSize={brushSize} tool={tool} />
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                <ResultsPanel
                  embedded
                  panelTitle="UI Canvas"
                  images={uiCanvasImages}
                  imagesPerRow={imagesPerRow}
                  onImagesPerRowChange={handleImagesPerRowChange}
                  onImagesPerRowStep={setImagesPerRowClamped}
                  onDeleteImage={(id) => void handleDeleteImage(id)}
                  onToggleLocation={(id) => void handleToggleLocation(id)}
                  onRemoveBackground={(id) => void handleRemoveBackground(id)}
                  onEditImage={handleEditImage}
                  showSketchCheckboxes
                  selectedSketchIds={selectedSketchIds}
                  onSketchSelectionChange={handleSketchSelectionChange}
                  sketchSelectionDisabled={generatingPolish}
                  emptyMessage="No UI Canvas images yet. Open the Draw tab, name your sketch, and click Save."
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
