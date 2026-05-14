"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { IMAGEGEN_DEFAULT_IMAGE_MODEL, IMAGE_MODEL_OPTIONS } from "../../lib/imageModels";
import { getStyles, normalizeImageUrl } from "../client";
import {
  IMAGEGEN_EDIT_CONTEXT_KEY,
  IMAGEGEN_EDIT_JOB_KEY,
  IMAGEGEN_EDIT_RETURN_KEY,
} from "../editKeys";
import { getEditDraft, getPanelSnapshot, setEditDraft } from "../imagegenPanelSnapshot";
import type { GeneratedImage } from "../types";
import type { Style } from "../../storyboard/types";

type SizePreset = "square" | "portrait" | "landscape";
type QualityPreset = "high" | "medium" | "low";
type PersistedEditOptions = {
  selectedStyleId: string;
  model: string;
  sizePreset: SizePreset;
  qualityPreset: QualityPreset;
};

const IMAGEGEN_EDIT_OPTIONS_STORAGE_KEY = "imagegen_edit_options_v1";

function dimensionsFromPresets(sizePreset: SizePreset, qualityPreset: QualityPreset): { width: number; height: number } {
  const sizeMap: Record<QualityPreset, number> = {
    high: 1024,
    medium: 512,
    low: 256,
  };
  const baseSize = sizeMap[qualityPreset] ?? 1024;
  let width = baseSize;
  let height = baseSize;
  if (sizePreset === "landscape") {
    width = baseSize;
    height = Math.max(1, Math.round((baseSize * 9) / 16));
  } else if (sizePreset === "portrait") {
    width = Math.max(1, Math.round((baseSize * 9) / 16));
    height = baseSize;
  }
  return { width, height };
}

export default function ImageGenEditPage() {
  const router = useRouter();
  const [source, setSource] = useState<GeneratedImage | null>(null);
  const [changes, setChanges] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [styles, setStyles] = useState<Style[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string>("__none");
  const [model, setModel] = useState<string>(IMAGEGEN_DEFAULT_IMAGE_MODEL);
  const [sizePreset, setSizePreset] = useState<SizePreset>("square");
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>("high");
  const [optionsHydrated, setOptionsHydrated] = useState(false);
  const [hasPersistedOptions, setHasPersistedOptions] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(IMAGEGEN_EDIT_OPTIONS_STORAGE_KEY);
      if (!raw) {
        setHasPersistedOptions(false);
        return;
      }
      setHasPersistedOptions(true);
      const parsed = JSON.parse(raw) as Partial<PersistedEditOptions>;
      if (typeof parsed.selectedStyleId === "string" && parsed.selectedStyleId.trim()) {
        setSelectedStyleId(parsed.selectedStyleId.trim());
      }
      if (typeof parsed.model === "string" && parsed.model.trim()) {
        setModel(parsed.model.trim());
      }
      if (parsed.sizePreset === "square" || parsed.sizePreset === "portrait" || parsed.sizePreset === "landscape") {
        setSizePreset(parsed.sizePreset);
      }
      if (parsed.qualityPreset === "high" || parsed.qualityPreset === "medium" || parsed.qualityPreset === "low") {
        setQualityPreset(parsed.qualityPreset);
      }
    } catch {
      // ignore invalid storage payload
      setHasPersistedOptions(false);
    } finally {
      setOptionsHydrated(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getStyles().then((items) => {
      if (!cancelled) {
        setStyles(items);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!optionsHydrated) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const payload: PersistedEditOptions = {
      selectedStyleId,
      model,
      sizePreset,
      qualityPreset,
    };
    try {
      window.localStorage.setItem(IMAGEGEN_EDIT_OPTIONS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore quota / private mode
    }
  }, [selectedStyleId, model, sizePreset, qualityPreset, optionsHydrated]);

  useEffect(() => {
    if (!optionsHydrated) {
      return;
    }
    try {
      const raw = sessionStorage.getItem(IMAGEGEN_EDIT_CONTEXT_KEY);
      if (!raw) {
        setError("No image context. Use Edit on a tile from the Image Generation page.");
        return;
      }
      const parsed = JSON.parse(raw) as GeneratedImage;
      if (!parsed?.id || !parsed?.url) {
        setError("Invalid image context.");
        return;
      }
      setSource(parsed);
      const draft = getEditDraft(parsed.id);
      if (draft !== undefined) {
        setChanges(draft);
      }
      if (!hasPersistedOptions) {
        const snap = getPanelSnapshot();
        if (snap) {
          const nextModel = snap.imageModel?.trim();
          if (nextModel) {
            setModel(nextModel);
          }
          setSizePreset(snap.sizePreset);
          setQualityPreset(snap.imageDefaultsQuality || snap.qualityPreset);
        } else {
          setModel(IMAGEGEN_DEFAULT_IMAGE_MODEL);
          setSizePreset("square");
          setQualityPreset("high");
        }
      }
    } catch {
      setError("Could not load image context.");
    }
  }, [hasPersistedOptions, optionsHydrated]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!source || !changes.trim()) return;
    const selectedStyle = selectedStyleId !== "__none" ? styles.find((style) => style.id === selectedStyleId) ?? null : null;
    const baseChanges = changes.trim();
    const finalChanges = selectedStyle?.prompt?.trim() ? `${selectedStyle.prompt.trim()}\n\n${baseChanges}` : baseChanges;
    const dims =
      source &&
      typeof source.editWidth === "number" &&
      typeof source.editHeight === "number" &&
      Number.isFinite(source.editWidth) &&
      Number.isFinite(source.editHeight) &&
      source.editWidth > 0 &&
      source.editHeight > 0
        ? { width: Math.round(source.editWidth), height: Math.round(source.editHeight) }
        : dimensionsFromPresets(sizePreset, qualityPreset);
    sessionStorage.removeItem(IMAGEGEN_EDIT_CONTEXT_KEY);
    const returnTo = sessionStorage.getItem(IMAGEGEN_EDIT_RETURN_KEY);
    sessionStorage.removeItem(IMAGEGEN_EDIT_RETURN_KEY);
    sessionStorage.setItem(
      IMAGEGEN_EDIT_JOB_KEY,
      JSON.stringify({
        changes: finalChanges,
        image: source,
        width: dims.width,
        height: dims.height,
        model,
        sizePreset,
        qualityPreset,
        styleName: selectedStyle?.name ?? null,
        ...(returnTo?.trim() ? { returnTo: returnTo.trim() } : {}),
      }),
    );
    const qs = new URLSearchParams();
    qs.set("runEdit", "1");
    const rt = returnTo?.trim();
    if (rt) qs.set("returnTo", rt);
    const safeReturnTo = rt && rt.startsWith("/") && !rt.startsWith("//") ? rt : "";
    if (safeReturnTo.startsWith("/uiBuilder")) {
      const sep = safeReturnTo.includes("?") ? "&" : "?";
      router.push(`${safeReturnTo}${sep}${qs.toString()}`);
      return;
    }
    router.push(`/imageGen?${qs.toString()}`);
  };

  return (
    <main
      className="imagegen-edit-page"
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        margin: 0,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "0.6rem",
        overflow: "hidden",
        alignSelf: "stretch",
        alignItems: "stretch",
        justifyContent: "flex-start",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "row",
          gap: "0.75rem",
          overflow: "hidden",
          alignItems: "stretch",
        }}
      >
        <aside className="imagegen-left" style={{ width: 340, minWidth: 300, maxWidth: 380, flexShrink: 0 }}>
          <div
            className="imagegen-panel"
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
            }}
          >
            <h2 className="imagegen-panel-title">Edit Options</h2>
            <div className="imagegen-panel-body" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <label className="imagegen-label" htmlFor="edit-style">Style</label>
              <select
                id="edit-style"
                className="imagegen-select"
                value={selectedStyleId}
                onChange={(e) => setSelectedStyleId(e.target.value)}
              >
                <option value="__none">(No style)</option>
                {styles.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.name}
                  </option>
                ))}
              </select>

              <label className="imagegen-label" htmlFor="edit-model">Model</label>
              <select
                id="edit-model"
                className="imagegen-select"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                {IMAGE_MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <label className="imagegen-label" htmlFor="edit-size">Size</label>
              <select
                id="edit-size"
                className="imagegen-select"
                value={sizePreset}
                onChange={(e) => setSizePreset(e.target.value as SizePreset)}
              >
                <option value="square">Square</option>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>

              <label className="imagegen-label" htmlFor="edit-quality">Quality</label>
              <select
                id="edit-quality"
                className="imagegen-select"
                value={qualityPreset}
                onChange={(e) => setQualityPreset(e.target.value as QualityPreset)}
              >
                <option value="high">High (1024)</option>
                <option value="medium">Medium (512)</option>
                <option value="low">Low (256)</option>
              </select>
            </div>
          </div>
        </aside>

        <section className="imagegen-right" style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="imagegen-panel" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.75rem",
                flexShrink: 0,
                paddingTop: "0.25rem",
              }}
            >
              <button
                type="button"
                className="imagegen-delete-button"
                onClick={() => {
                  const rt = sessionStorage.getItem(IMAGEGEN_EDIT_RETURN_KEY)?.trim();
                  if (rt?.startsWith("/") && !rt.startsWith("//")) {
                    router.push(rt);
                  } else {
                    router.push("/imageGen");
                  }
                }}
              >
                Back
              </button>
              <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>Edit image</h1>
            </div>
            <div
              className="imagegen-panel-body"
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
                overflow: "hidden",
              }}
            >
              {error && (
                <div className="status" style={{ flexShrink: 0, textAlign: "center" }}>
                  {error}
                </div>
              )}
              {source && !error && (
                <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "0.5rem", overflow: "hidden", alignItems: "center", width: "100%" }}>
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(15, 23, 42, 0.45)",
                      borderRadius: 12,
                      border: "1px solid rgba(148, 163, 184, 0.2)",
                      padding: "8px",
                      boxSizing: "border-box",
                      overflow: "hidden",
                    }}
                  >
                    <img
                      src={
                        source.url.startsWith("blob:") || source.url.startsWith("data:")
                          ? source.url
                          : normalizeImageUrl(source.url)
                      }
                      alt=""
                      style={{
                        maxWidth: "100%",
                        maxHeight: "100%",
                        width: "auto",
                        height: "auto",
                        objectFit: "contain",
                        borderRadius: 8,
                      }}
                    />
                  </div>
                  <form
                    onSubmit={handleSubmit}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                      width: "100%",
                      maxWidth: "min(560px, 100%)",
                      flexShrink: 0,
                      alignItems: "stretch",
                      alignSelf: "center",
                    }}
                  >
                    <label className="imagegen-label" htmlFor="edit-changes" style={{ margin: 0, textAlign: "center" }}>
                      Changes
                    </label>
                    <textarea
                      id="edit-changes"
                      className="imagegen-textarea"
                      value={changes}
                      onChange={(e) => {
                        const value = e.target.value;
                        setChanges(value);
                        if (source?.id) {
                          setEditDraft(source.id, value);
                        }
                      }}
                      rows={4}
                      placeholder="Describe what to change (e.g. add a red hat, make the background darker)"
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        resize: "none",
                        maxHeight: "26vh",
                        minHeight: 0,
                      }}
                    />
                    <button type="submit" className="imagegen-generate-button" disabled={!changes.trim()}>
                      Submit
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
