"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  detectUiBreakdown,
  normalizeImageUrl,
  processUiBreakdown,
  stripTextForBreakdown,
  type UiBreakdownElement,
  type UiBreakdownSamParams,
} from "../imageGen/client";
import {
  getLocalProjectPath,
  isLocalAgentContext,
  joinLocalProjectSubpath,
  localAgent,
} from "../lib/localAgentClient";
import { ImagegenTooltip } from "../imageGen/ImagegenTooltip";
import { IMAGE_MODEL_OPTIONS, IMAGEGEN_DEFAULT_IMAGE_MODEL } from "../lib/imageModels";
import type { GeneratedImage } from "../imageGen/types";

const TIP_EXPORT_FOLDER =
  "Subfolder created under the project’s Gen/Images/UI/ when you run Process. Widget crops and background.png are saved there. Use letters, numbers, dots, dashes, and underscores.";

const TIP_MAX_ELEMENTS =
  "After SAM, the server keeps the largest region boxes up to this count (then sends them to Gemini for labeling). Lower to reduce clutter and VLM prompt size.";

const TIP_MIN_BOX =
  "Minimum box area as a fraction of the full image (width×height). Filters tiny SAM masks. Try 0.008–0.03 to drop noise; lower if you lose small icons.";

const TIP_SAM_PARAMS =
  "Segment Anything automatic mask generator settings (same names as Meta’s SamAutomaticMaskGenerator). Lower pred_iou_thresh / stability_score_thresh → more masks; higher points_per_side → denser sampling (slower).";

const TIP_SKIP_VLM =
  "SAM-only: no Gemini call for labels (generic segment names). Use for offline tests or when GEMINI_API_KEY is unavailable.";

const TIP_LABEL_MODEL =
  "Gemini model id for naming each SAM region (default on server: gemini-2.5-flash). Leave empty to use the server default.";

const TIP_LABEL_TEMP = "Sampling temperature for the labeling JSON response (lower = more deterministic).";

const TIP_DETECTION_SERVER =
  "Local agent: SAM_CHECKPOINT_PATH and SAM_MODEL_TYPE (vit_b|vit_l|vit_h). Install: pip install -r requirements-sam.txt in local_agent/.venv. API: GEMINI_API_KEY for VLM labels; UI_BREAKDOWN_LABEL_MODEL optional. CUDA recommended for SAM.";

const TIP_CROP_PADDING =
  "Extra pixels added on every side when cutting out each widget for export. Helps avoid cutting off anti-aliased edges; 0 means tight to the box.";

const TIP_STRIP_SUFFIX =
  "Optional text appended to the server prompt for “Remove text”. Use it to steer how labels are removed or what should stay (e.g. keep logo, remove only body text).";

const TIP_BG_SUFFIX =
  "Optional text appended when generating the empty background plate (step 3). Use it to describe the desired shell (e.g. same gradient, no cards, flat gray).";

const TIP_GEN_SIZE =
  "Output size requested from the image model for Remove text and for the regenerated background. Must be an allowed size for the model (typically multiples of 64 in this range).";

const TIP_REGEN_MODEL =
  "Image generation model used for removing text and for the background pass. Gemini paths use your reference image; GPT Image uses the project’s Images settings where applicable.";

const TIP_BTN_DETECT =
  "Runs SAM on the local agent (same machine as the browser when using localhost), then sends boxes to the API for Gemini labeling (unless Skip VLM). Requires local project path (Admin), running local_agent, SAM checkpoint in the agent venv; labeling needs GEMINI_API_KEY on the API unless skipped.";

const TIP_BTN_STRIP =
  "Generates a new image with text/labels removed, saved under Gen/Images/UI. The preview switches to that file so Detect and Process can use it. Uses Width, Height, and Image model.";

const TIP_BTN_PROCESS =
  "Writes widget PNGs from the current boxes and generates background.png in the export folder. Requires at least one detected box. Uses Crop padding, Background instructions, size, and model.";

const TIP_PREVIEW =
  "Shows the image used for detection (after Remove text, the new file; otherwise the gallery image). Cyan outlines are the last Detect result (fractions of width/height, aligned to how the image is displayed).";

const TIP_DETECTED_REGIONS =
  "After Detect, remove regions you do not want exported as separate crops. Process uses the list as-is (fewer boxes = fewer widget PNGs; those areas stay on the background plate).";

/** Default subfolder under Gen/Images/UI from source metadata (also used by the page for scoped export listing). */
export function defaultExportFolder(img: GeneratedImage | null): string {
  if (!img) return "export";
  const p = (img.prompt || "").trim();
  if (p) {
    return p
      .slice(0, 48)
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "export";
  }
  const fn = img.filename?.trim() || "";
  if (fn) {
    const base = fn.replace(/\.[^.]+$/, "");
    return base.slice(0, 48).replace(/[^a-zA-Z0-9._-]+/g, "_") || "export";
  }
  return "export";
}

export type BreakdownActivityUpdate =
  | {
      message: string;
      isError: boolean;
      /** Present after Process when a local project path is known — full disk path + reveal target. */
      folderReveal?: { fullPath: string; projectRoot: string; relativePath: string };
    }
  | null;

type Props = {
  projectKey: string;
  sourceImage: GeneratedImage | null;
  /** After Remove text, preview uses this Images/ filename (owned by parent for persistence). */
  workingFilename: string | null;
  onWorkingFilenameChange: (filename: string | null) => void;
  /** Shown in the Activity box under the Breakdown title (progress + errors in red). */
  onActivityUpdate: (state: BreakdownActivityUpdate) => void;
  /** Fired when Detect / Remove text / Process starts or finishes (drives progress UI on the page). */
  onWorkingChange?: (working: boolean) => void;
  /** After a successful Process, parent may refresh Gen/Images/UI export listing. */
  onProcessComplete?: () => void;
  /** Controlled by parent so Breakdown exports list uses the same folder as Process. */
  exportFolderName: string;
  onExportFolderChange: (name: string) => void;
};

export function BreakdownPanel({
  projectKey,
  sourceImage,
  workingFilename,
  onWorkingFilenameChange,
  onActivityUpdate,
  onWorkingChange,
  onProcessComplete,
  exportFolderName,
  onExportFolderChange,
}: Props) {
  const [elements, setElements] = useState<UiBreakdownElement[]>([]);
  /** Highlighted box on the preview (click a region to select). */
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [maxElements, setMaxElements] = useState(10);
  const [minBoxFraction, setMinBoxFraction] = useState(0.008);
  const [samPointsPerSide, setSamPointsPerSide] = useState(32);
  const [samPredIouThresh, setSamPredIouThresh] = useState(0.88);
  const [samStabilityThresh, setSamStabilityThresh] = useState(0.95);
  const [samCropNLayers, setSamCropNLayers] = useState(0);
  const [samCropNmsThresh, setSamCropNmsThresh] = useState(0.7);
  const [samMinMaskRegionArea, setSamMinMaskRegionArea] = useState(0);
  const [samBoxNmsThresh, setSamBoxNmsThresh] = useState(0.7);
  const [skipVlmLabel, setSkipVlmLabel] = useState(false);
  const [labelTemperature, setLabelTemperature] = useState(0.2);
  const [labelModel, setLabelModel] = useState("");
  const [cropPadding, setCropPadding] = useState(4);
  const [stripSuffix, setStripSuffix] = useState("");
  const [bgSuffix, setBgSuffix] = useState("");
  const [regenModel, setRegenModel] = useState(IMAGEGEN_DEFAULT_IMAGE_MODEL);
  const [genWidth, setGenWidth] = useState(1024);
  const [genHeight, setGenHeight] = useState(1024);
  const [detecting, setDetecting] = useState(false);
  const [stripping, setStripping] = useState(false);
  const [processing, setProcessing] = useState(false);
  const previewImgRef = useRef<HTMLImageElement | null>(null);

  const working = detecting || stripping || processing;
  useEffect(() => {
    onWorkingChange?.(working);
  }, [working, onWorkingChange]);

  useEffect(() => {
    return () => {
      onWorkingChange?.(false);
    };
  }, [onWorkingChange]);
  const [previewLayout, setPreviewLayout] = useState<{ w: number; h: number } | null>(null);

  const updatePreviewLayout = useCallback(() => {
    const el = previewImgRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w > 0 && h > 0) setPreviewLayout({ w, h });
  }, []);

  useEffect(() => {
    setElements([]);
    setSelectedBoxId(null);
  }, [sourceImage?.id]);

  const removeBreakdownElement = useCallback((id: string) => {
    setElements((prev) => prev.filter((e) => e.id !== id));
    setSelectedBoxId((s) => (s === id ? null : s));
  }, []);

  useEffect(() => {
    if (!selectedBoxId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedBoxId(null);
      if (e.key === "Delete") {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        removeBreakdownElement(selectedBoxId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedBoxId, removeBreakdownElement]);

  const activeFilename = workingFilename || sourceImage?.filename?.trim() || "";

  const previewUrl = useMemo(() => {
    if (!projectKey || !activeFilename) return "";
    return normalizeImageUrl(`/images/${activeFilename}?project_key=${encodeURIComponent(projectKey)}`);
  }, [projectKey, activeFilename]);

  useLayoutEffect(() => {
    updatePreviewLayout();
  }, [updatePreviewLayout, previewUrl, activeFilename]);

  useLayoutEffect(() => {
    const el = previewImgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updatePreviewLayout());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updatePreviewLayout, previewUrl]);

  const handleDetect = useCallback(async () => {
    if (!projectKey?.trim() || !activeFilename) {
      onActivityUpdate({ message: "Select an image with a stored filename.", isError: true });
      return;
    }
    if (!isLocalAgentContext()) {
      onActivityUpdate({
        message:
          "Detect needs the local agent: open the app from http://localhost (or set NEXT_PUBLIC_LOCAL_AGENT_PAGE_HOSTS and agent CORS).",
        isError: true,
      });
      return;
    }
    const projectRoot = getLocalProjectPath(projectKey.trim());
    if (!projectRoot?.trim()) {
      onActivityUpdate({
        message: "Set a local project folder in Admin → Projects for this project (same as Mesh Gen).",
        isError: true,
      });
      return;
    }
    onActivityUpdate({ message: "Checking local agent…", isError: false });
    const agentUp = await localAgent.health();
    if (!agentUp) {
      onActivityUpdate({
        message: "Start the local agent (e.g. local_agent/run.bat) with SAM installed. See local_agent/README-SAM.md.",
        isError: true,
      });
      return;
    }
    const previousElements = elements;
    setDetecting(true);
    onActivityUpdate({ message: "Approving project folder…", isError: false });
    setElements([]);
    setSelectedBoxId(null);
    try {
      const samParams: UiBreakdownSamParams = {
        points_per_side: samPointsPerSide,
        points_per_batch: 64,
        pred_iou_thresh: samPredIouThresh,
        stability_score_thresh: samStabilityThresh,
        crop_n_layers: samCropNLayers,
        crop_nms_thresh: samCropNmsThresh,
        crop_overlap_ratio: 512 / 1500,
        crop_n_points_downscale_factor: 1,
        min_mask_region_area: samMinMaskRegionArea,
        box_nms_thresh: samBoxNmsThresh,
      };
      await localAgent.approveProjectRoot(projectRoot.trim());
      onActivityUpdate({ message: "Running SAM on local agent (this can take a while)…", isError: false });
      const samOut = await localAgent.uiBreakdownSam({
        project_root: projectRoot.trim(),
        filename: activeFilename,
        max_elements: maxElements,
        min_box_fraction: minBoxFraction,
        sam: samParams,
      });
      const prefetched: UiBreakdownElement[] = (samOut.elements ?? []).map((e) => ({
        id: e.id,
        label: e.label,
        x_min: e.x_min,
        y_min: e.y_min,
        x_max: e.x_max,
        y_max: e.y_max,
      }));
      onActivityUpdate({
        message: skipVlmLabel
          ? "Skipping Gemini — using segment geometry only…"
          : "Labeling regions with Gemini on the API…",
        isError: false,
      });
      const { elements: el } = await detectUiBreakdown({
        projectKey: projectKey.trim(),
        sourceFilename: activeFilename,
        prefetchedElements: prefetched,
        skipVlmLabel,
        labelTemperature,
        labelModel: labelModel.trim() || undefined,
      });
      setElements(el);
      setSelectedBoxId(null);
      queueMicrotask(() => updatePreviewLayout());
      onActivityUpdate({ message: `Detected ${el.length} element(s).`, isError: false });
    } catch (e) {
      setElements(previousElements);
      onActivityUpdate({ message: e instanceof Error ? e.message : "Detect failed.", isError: true });
    } finally {
      setDetecting(false);
    }
  }, [
    projectKey,
    activeFilename,
    maxElements,
    minBoxFraction,
    samPointsPerSide,
    samPredIouThresh,
    samStabilityThresh,
    samCropNLayers,
    samCropNmsThresh,
    samMinMaskRegionArea,
    samBoxNmsThresh,
    skipVlmLabel,
    labelTemperature,
    labelModel,
    elements,
    onActivityUpdate,
    updatePreviewLayout,
  ]);

  const handleStripText = useCallback(async () => {
    if (!projectKey?.trim() || !sourceImage?.filename?.trim()) {
      onActivityUpdate({ message: "Select an image with a stored filename.", isError: true });
      return;
    }
    const srcFn = workingFilename || sourceImage.filename!.trim();
    setStripping(true);
    onActivityUpdate({ message: "Removing text with the image model…", isError: false });
    try {
      const result = await stripTextForBreakdown({
        projectKey: projectKey.trim(),
        sourceFilename: srcFn,
        promptSuffix: stripSuffix || undefined,
        width: genWidth,
        height: genHeight,
        model: regenModel,
      });
      const fn = result.filename?.trim();
      if (fn) {
        onWorkingFilenameChange(fn);
        onActivityUpdate({ message: "Text removed — preview updated to the new file.", isError: false });
      } else {
        onActivityUpdate({ message: "Strip finished but no filename was returned.", isError: true });
      }
    } catch (e) {
      onActivityUpdate({ message: e instanceof Error ? e.message : "Remove text failed.", isError: true });
    } finally {
      setStripping(false);
    }
  }, [
    projectKey,
    sourceImage,
    workingFilename,
    stripSuffix,
    genWidth,
    genHeight,
    regenModel,
    onActivityUpdate,
    onWorkingFilenameChange,
  ]);

  const handleProcess = useCallback(async () => {
    if (!projectKey?.trim() || !activeFilename) {
      onActivityUpdate({ message: "Select an image with a stored filename.", isError: true });
      return;
    }
    if (!elements.length) {
      onActivityUpdate({ message: "Run Detect first (or no elements found).", isError: true });
      return;
    }
    const folder = exportFolderName.trim() || "export";
    setProcessing(true);
    onActivityUpdate({ message: "Cropping widgets and generating background…", isError: false });
    try {
      const out = await processUiBreakdown({
        projectKey: projectKey.trim(),
        sourceFilename: activeFilename,
        exportFolder: folder,
        elements,
        cropPaddingPx: cropPadding,
        backgroundPromptSuffix: bgSuffix || undefined,
        width: genWidth,
        height: genHeight,
        regenModel,
      });
      const projectRoot = getLocalProjectPath(projectKey.trim());
      const relativePath = `Gen/Images/UI/${out.folder}`.replace(/\\/g, "/");
      const fullPath = projectRoot
        ? joinLocalProjectSubpath(projectRoot, "Gen", "Images", "UI", out.folder)
        : "";
      onActivityUpdate({
        message: projectRoot
          ? `Saved to Gen/Images/UI/${out.folder}/`
          : `Saved to Gen/Images/UI/${out.folder}/ — set a local project folder in Admin to see the full disk path.`,
        isError: false,
        folderReveal:
          projectRoot && fullPath
            ? { fullPath, projectRoot: projectRoot.trim(), relativePath }
            : undefined,
      });
      onProcessComplete?.();
    } catch (e) {
      onActivityUpdate({ message: e instanceof Error ? e.message : "Process failed.", isError: true });
    } finally {
      setProcessing(false);
    }
  }, [
    projectKey,
    activeFilename,
    elements,
    exportFolderName,
    cropPadding,
    bgSuffix,
    genWidth,
    genHeight,
    regenModel,
    onActivityUpdate,
    onProcessComplete,
  ]);

  if (!sourceImage) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted, #94a3b8)" }}>
        Choose a UI Canvas image in the gallery and click <strong>Breakdown</strong>, or pick an image first.
      </p>
    );
  }

  /** Fits preview in viewport while keeping box overlay aligned (wrapper matches scaled img pixels). */
  const previewMaxHeight = "min(78vh, calc(100dvh - 11rem))";

  const previewBlock = (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        border: "1px solid #2a2f3a",
        borderRadius: 8,
        overflow: "hidden",
        background: "#0a0c10",
        padding: 12,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 8px", flexShrink: 0, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>Preview ({elements.length} boxes)</span>
        <ImagegenTooltip text={TIP_PREVIEW} />
        {elements.length > 0 && (
          <span style={{ fontSize: 11, color: "#64748b" }}>Click a box to highlight · Remove rows in the list →</span>
        )}
      </div>
      {previewUrl ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
        <div
          style={{
            position: "relative",
            display: "inline-block",
            maxWidth: "100%",
            margin: "0 auto",
            lineHeight: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={previewImgRef}
            src={previewUrl}
            alt="Breakdown preview"
            onLoad={updatePreviewLayout}
            onClick={() => setSelectedBoxId(null)}
            style={{
              display: "block",
              maxWidth: "100%",
              maxHeight: previewMaxHeight,
              width: "auto",
              height: "auto",
            }}
          />
          {elements.length > 0 &&
            elements.map((el) => {
              const L = previewLayout;
              const x0 = el.x_min;
              const y0 = el.y_min;
              const bw = Math.max(0.001, el.x_max - el.x_min);
              const bh = Math.max(0.001, el.y_max - el.y_min);
              const selected = selectedBoxId === el.id;
              return (
                <div
                  key={el.id}
                  role="button"
                  tabIndex={0}
                  title={`${el.label} — click Remove in the list to exclude from export`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBoxId(el.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedBoxId(el.id);
                    }
                  }}
                  style={{
                    position: "absolute",
                    left: L ? `${x0 * L.w}px` : `${x0 * 100}%`,
                    top: L ? `${y0 * L.h}px` : `${y0 * 100}%`,
                    width: L ? `${bw * L.w}px` : `${bw * 100}%`,
                    height: L ? `${bh * L.h}px` : `${bh * 100}%`,
                    boxSizing: "border-box",
                    border: selected
                      ? "2px solid rgba(250, 204, 21, 0.98)"
                      : "2px solid rgba(34, 211, 238, 0.95)",
                    borderRadius: 2,
                    pointerEvents: "auto",
                    cursor: "pointer",
                    outline: "none",
                  }}
                />
              );
            })}
        </div>
        </div>
      ) : (
        <span style={{ fontSize: 12, color: "#64748b" }}>No preview URL.</span>
      )}
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        gap: "1rem",
        flex: 1,
        minHeight: 0,
        alignItems: "stretch",
      }}
    >
      <div
        style={{
          width: "min(360px, 100%)",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          overflow: "auto",
          alignSelf: "stretch",
          maxHeight: "100%",
        }}
      >
      <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>
        Source: {(sourceImage.prompt || sourceImage.filename || "").slice(0, 120)}
        {workingFilename && (
          <span style={{ display: "block", marginTop: 4 }}>Working file (no text): {workingFilename}</span>
        )}
      </p>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, margin: 0 }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)", lineHeight: 1.45 }}>
          <strong style={{ color: "var(--foreground, #e2e8f0)" }}>Detect pipeline:</strong>{" "}
          <strong>SAM</strong> runs in the <strong>local agent</strong> on your PC; <strong>Gemini VLM</strong> on the API names each region (unless{" "}
          <strong>Skip VLM</strong>). Tune SAM parameters below. Strip/background <strong>Image model</strong> is only for steps
          2–3.
        </p>
        <ImagegenTooltip text={TIP_DETECTION_SERVER} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <label className="imagegen-label" htmlFor="uibreakdown-export-folder" style={{ margin: 0 }}>
          Export folder name
        </label>
        <ImagegenTooltip text={TIP_EXPORT_FOLDER} />
      </div>
      <input
        id="uibreakdown-export-folder"
        className="imagegen-select"
        value={exportFolderName}
        onChange={(e) => onExportFolderChange(e.target.value)}
        placeholder="MyScreen"
        style={{ maxWidth: "100%" }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 12 }}>Max elements</span>
            <ImagegenTooltip text={TIP_MAX_ELEMENTS} />
          </div>
          <input
            type="number"
            min={1}
            max={80}
            className="imagegen-select"
            style={{ width: "100%", marginTop: 4 }}
            value={maxElements}
            onChange={(e) => setMaxElements(Number(e.target.value))}
          />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <label style={{ fontSize: 12, margin: 0 }} htmlFor="uibreakdown-min-box">
              Min box area
            </label>
            <ImagegenTooltip text={TIP_MIN_BOX} />
          </div>
          <input
            id="uibreakdown-min-box"
            type="number"
            step={0.0001}
            min={0}
            max={1}
            className="imagegen-select"
            style={{ width: "100%", marginTop: 4 }}
            value={minBoxFraction}
            onChange={(e) => setMinBoxFraction(Number(e.target.value))}
          />
        </div>
      </div>

      <details style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
        <summary
          style={{
            cursor: "pointer",
            color: "var(--foreground, #e2e8f0)",
            marginBottom: 8,
            listStyle: "none",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <span>
            SAM parameters{" "}
            <span style={{ color: "var(--muted, #94a3b8)", fontWeight: "normal" }}>(automatic mask generator)</span>
          </span>
          <ImagegenTooltip text={TIP_SAM_PARAMS} />
        </summary>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={{ fontSize: 11 }}>
            points_per_side
            <input
              type="number"
              min={4}
              max={128}
              className="imagegen-select"
              style={{ width: "100%", marginTop: 4 }}
              value={samPointsPerSide}
              onChange={(e) => setSamPointsPerSide(Number(e.target.value))}
            />
          </label>
          <label style={{ fontSize: 11 }}>
            pred_iou_thresh
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              className="imagegen-select"
              style={{ width: "100%", marginTop: 4 }}
              value={samPredIouThresh}
              onChange={(e) => setSamPredIouThresh(Number(e.target.value))}
            />
          </label>
          <label style={{ fontSize: 11 }}>
            stability_score_thresh
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              className="imagegen-select"
              style={{ width: "100%", marginTop: 4 }}
              value={samStabilityThresh}
              onChange={(e) => setSamStabilityThresh(Number(e.target.value))}
            />
          </label>
          <label style={{ fontSize: 11 }}>
            crop_n_layers
            <input
              type="number"
              min={0}
              max={8}
              className="imagegen-select"
              style={{ width: "100%", marginTop: 4 }}
              value={samCropNLayers}
              onChange={(e) => setSamCropNLayers(Number(e.target.value))}
            />
          </label>
          <label style={{ fontSize: 11 }}>
            crop_nms_thresh
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              className="imagegen-select"
              style={{ width: "100%", marginTop: 4 }}
              value={samCropNmsThresh}
              onChange={(e) => setSamCropNmsThresh(Number(e.target.value))}
            />
          </label>
          <label style={{ fontSize: 11 }}>
            min_mask_region_area
            <input
              type="number"
              min={0}
              className="imagegen-select"
              style={{ width: "100%", marginTop: 4 }}
              value={samMinMaskRegionArea}
              onChange={(e) => setSamMinMaskRegionArea(Number(e.target.value))}
            />
          </label>
          <label style={{ fontSize: 11 }}>
            box_nms_thresh
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              className="imagegen-select"
              style={{ width: "100%", marginTop: 4 }}
              value={samBoxNmsThresh}
              onChange={(e) => setSamBoxNmsThresh(Number(e.target.value))}
            />
          </label>
        </div>
      </details>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={skipVlmLabel} onChange={(e) => setSkipVlmLabel(e.target.checked)} />
        Skip VLM labeling (SAM geometry only)
        <ImagegenTooltip text={TIP_SKIP_VLM} />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <label style={{ fontSize: 12, margin: 0 }} htmlFor="uibreakdown-label-temp">
              Label temperature
            </label>
            <ImagegenTooltip text={TIP_LABEL_TEMP} />
          </div>
          <input
            id="uibreakdown-label-temp"
            type="number"
            step={0.05}
            min={0}
            max={1}
            className="imagegen-select"
            style={{ width: "100%", marginTop: 4 }}
            value={labelTemperature}
            onChange={(e) => setLabelTemperature(Number(e.target.value))}
            disabled={skipVlmLabel}
          />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <label style={{ fontSize: 12, margin: 0 }} htmlFor="uibreakdown-label-model">
              Label model (Gemini id)
            </label>
            <ImagegenTooltip text={TIP_LABEL_MODEL} />
          </div>
          <input
            id="uibreakdown-label-model"
            type="text"
            className="imagegen-select"
            style={{ width: "100%", marginTop: 4 }}
            value={labelModel}
            onChange={(e) => setLabelModel(e.target.value)}
            placeholder="default on server"
            disabled={skipVlmLabel}
          />
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <label style={{ fontSize: 12, margin: 0 }} htmlFor="uibreakdown-crop-pad">
            Crop padding (px)
          </label>
          <ImagegenTooltip text={TIP_CROP_PADDING} />
        </div>
        <input
          id="uibreakdown-crop-pad"
          type="number"
          min={0}
          max={64}
          className="imagegen-select"
          style={{ width: "100%", marginTop: 4 }}
          value={cropPadding}
          onChange={(e) => setCropPadding(Number(e.target.value))}
        />
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <label style={{ fontSize: 12, margin: 0 }} htmlFor="uibreakdown-strip-suffix">
            Remove text — extra instructions
          </label>
          <ImagegenTooltip text={TIP_STRIP_SUFFIX} />
        </div>
        <textarea
          id="uibreakdown-strip-suffix"
          value={stripSuffix}
          onChange={(e) => setStripSuffix(e.target.value)}
          rows={2}
          placeholder="Optional hints for the strip-text step"
          style={{
            width: "100%",
            marginTop: 4,
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid #2a2f3a",
            background: "#0f1115",
            color: "inherit",
            fontSize: 12,
            resize: "vertical",
          }}
        />
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <label style={{ fontSize: 12, margin: 0 }} htmlFor="uibreakdown-bg-suffix">
            Background regen — extra instructions
          </label>
          <ImagegenTooltip text={TIP_BG_SUFFIX} />
        </div>
        <textarea
          id="uibreakdown-bg-suffix"
          value={bgSuffix}
          onChange={(e) => setBgSuffix(e.target.value)}
          rows={2}
          placeholder="Optional hints for empty background plate"
          style={{
            width: "100%",
            marginTop: 4,
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid #2a2f3a",
            background: "#0f1115",
            color: "inherit",
            fontSize: 12,
            resize: "vertical",
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 12 }}>Strip / background output size</span>
        <ImagegenTooltip text={TIP_GEN_SIZE} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={{ fontSize: 12 }}>
          Width
          <input
            type="number"
            min={256}
            max={2048}
            step={64}
            className="imagegen-select"
            style={{ width: "100%", marginTop: 4 }}
            value={genWidth}
            onChange={(e) => setGenWidth(Number(e.target.value))}
          />
        </label>
        <label style={{ fontSize: 12 }}>
          Height
          <input
            type="number"
            min={256}
            max={2048}
            step={64}
            className="imagegen-select"
            style={{ width: "100%", marginTop: 4 }}
            value={genHeight}
            onChange={(e) => setGenHeight(Number(e.target.value))}
          />
        </label>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <label style={{ fontSize: 12, margin: 0 }} htmlFor="uibreakdown-regen-model">
            Image model (strip + background)
          </label>
          <ImagegenTooltip text={TIP_REGEN_MODEL} />
        </div>
        <select
          id="uibreakdown-regen-model"
          className="imagegen-select"
          style={{ width: "100%", marginTop: 4 }}
          value={regenModel}
          onChange={(e) => setRegenModel(e.target.value)}
        >
          {IMAGE_MODEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <button type="button" className="imagegen-generate-button" disabled={detecting || !activeFilename} onClick={() => void handleDetect()}>
            {detecting ? "Detecting…" : "Detect UI boxes"}
          </button>
          <ImagegenTooltip text={TIP_BTN_DETECT} />
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <button type="button" className="imagegen-generate-button" disabled={stripping || !sourceImage?.filename} onClick={() => void handleStripText()}>
            {stripping ? "Removing text…" : "Remove text"}
          </button>
          <ImagegenTooltip text={TIP_BTN_STRIP} />
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            className="imagegen-generate-button"
            disabled={processing || !elements.length}
            onClick={() => void handleProcess()}
          >
            {processing ? "Processing…" : "Break Down Images"}
          </button>
          <ImagegenTooltip text={TIP_BTN_PROCESS} />
        </span>
      </div>

      {elements.length > 0 && (
        <div style={{ marginTop: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "var(--foreground, #e2e8f0)" }}>Detected regions</span>
            <ImagegenTooltip text={TIP_DETECTED_REGIONS} />
          </div>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              maxHeight: 200,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {elements.map((el) => (
              <li
                key={el.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 6,
                  border:
                    selectedBoxId === el.id ? "1px solid rgba(250, 204, 121, 0.55)" : "1px solid #2a2f3a",
                  background: selectedBoxId === el.id ? "rgba(250, 204, 121, 0.07)" : "#0f1115",
                  cursor: "pointer",
                }}
                onClick={() => setSelectedBoxId(el.id)}
              >
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 11,
                    color: "var(--foreground, #e2e8f0)",
                  }}
                  title={el.label}
                >
                  {el.label}
                </span>
                <button
                  type="button"
                  className="imagegen-delete-button"
                  style={{ flexShrink: 0, fontSize: 11, padding: "4px 8px" }}
                  aria-label={`Remove region ${el.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeBreakdownElement(el.id);
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>{previewBlock}</div>
    </div>
  );
}
