"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { STORAGE_KEY_PROJECT } from "../imageGen/config";
import {
  getImageGenerated,
  importImageFile,
  normalizeImageUrl,
  putImageGenerated,
  removeBackground,
  resolveReferenceForEditApi,
  uploadImageToCloud,
} from "../imageGen/client";
import { IMAGEGEN_EDIT_CONTEXT_KEY, IMAGEGEN_EDIT_RETURN_KEY } from "../imageGen/editKeys";
import { parseStoredImages, toPayload } from "../imageGen/persistence";
import { ResultsPanel } from "../imageGen/ResultsPanel";
import type { GeneratedImage, ImageLocation } from "../imageGen/types";
import { SketchCanvas, type SketchCanvasHandle, type SketchTool } from "./SketchCanvas";

type BuilderTab = "generate" | "draw";

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
  const [tool, setTool] = useState<SketchTool>("pen");
  const [drawingName, setDrawingName] = useState("");
  const sketchRef = useRef<SketchCanvasHandle>(null);

  const [projectKey, setProjectKey] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [uiCanvasImages, setUiCanvasImages] = useState<GeneratedImage[]>([]);
  const [imagesPerRow, setImagesPerRow] = useState(3);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const key = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY_PROJECT) : null;
    setProjectKey(key?.trim() ?? "");
  }, []);

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
      const imported = await importImageFile(file, projectKey);
      const first = imported[0];
      if (!first?.filename) {
        setStatus("Upload did not return a filename.");
        return;
      }
      const all = await loadAllImages();
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
      };
      await persistFullList([newItem, ...all]);
      setStatus("Background removed.");
      await reloadUiCanvasImages();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Remove background failed.");
    }
  };

  const handleEditImage = (img: GeneratedImage) => {
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

  const handleImagesPerRowChange = (value: string) => {
    const n = parseInt(value, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 8) setImagesPerRow(n);
  };

  const setImagesPerRowClamped = (delta: number) => {
    const n = imagesPerRow + delta;
    if (n >= 1 && n <= 8) setImagesPerRow(n);
  };

  const saveDisabled = saving || !drawingName.trim() || !projectKey;

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
                  onClick={() => setTab("generate")}
                >
                  Generate
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "draw"}
                  className={tab === "draw" ? "sidebar-tab active" : "sidebar-tab"}
                  onClick={() => setTab("draw")}
                >
                  Draw
                </button>
              </div>

              <div className="sidebar-tab-content">
                {tab === "generate" && (
                  <p style={{ margin: 0, fontSize: 14, color: "var(--muted, #94a3b8)" }}>
                    Saved <strong style={{ color: "var(--foreground, #e2e8f0)" }}>UI Canvas</strong> images appear in
                    the preview. Use <strong>Draw</strong> to create a new sketch.
                  </p>
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
                        gap: "0.5rem",
                      }}
                    >
                      <legend style={{ fontSize: 12, color: "var(--muted, #94a3b8)", padding: "0 0.25rem" }}>
                        Tool
                      </legend>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="uibuilder-tool"
                          checked={tool === "pen"}
                          onChange={() => setTool("pen")}
                        />
                        Pen
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="uibuilder-tool"
                          checked={tool === "eraser"}
                          onChange={() => setTool("eraser")}
                        />
                        Eraser
                      </label>
                    </fieldset>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                      <button type="button" onClick={() => sketchRef.current?.clear()}>
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
