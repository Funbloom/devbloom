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
import { isGeminiImageConfirmCancelled } from "../lib/confirmGeminiImage";
import { ImagegenTooltip } from "../imageGen/ImagegenTooltip";
import { IMAGE_MODEL_OPTIONS, IMAGEGEN_DEFAULT_IMAGE_MODEL } from "../lib/imageModels";
import type { GeneratedImage } from "../imageGen/types";

const TIP_EXPORT_FOLDER =
  "Subfolder created under the project’s Gen/Images/UI/ when you run Process. Widget crops and background.png are saved there. Use letters, numbers, dots, dashes, and underscores.";

const TIP_MAX_ELEMENTS =
  "After SAM, regions are sorted by mask area (largest first). Up to this many masks are kept (max 256). Raise for denser “segment everything” style; lower for faster Gemini labeling.";

const TIP_MIN_BOX =
  "Minimum SAM mask area as a fraction of the full image (true mask pixel count / width×height), not bbox size. Lower (e.g. 0.001–0.002) keeps small buttons/icons; higher reduces clutter.";

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
  "Writes widget PNGs from the current boxes and generates background.png in the export folder. Requires at least one detected box. Uses Crop padding, Background instructions, size, and model. With “Selection only” checked, only the selected region’s widget PNG is saved (no background.png).";

const TIP_SELECTION_ONLY_PROCESS =
  "When checked, Break Down Images exports a single widget PNG for the region selected in the preview or list (highlighted row). background.png is not generated. Select a region first, or the button stays disabled.";

const TIP_PREVIEW =
  "Shows the image used for detection (after Remove text, the new file; otherwise the gallery image). After Detect, SAM masks are drawn in distinct colors with a black outline (preview). Use Mask cleanup (open/close) under SAM parameters to reduce speckle and sharpen boundaries. Coordinates match the displayed image.";

/**
 * Distinct RGB colors per instance (panoptic overlay). Alpha is applied when compositing.
 * @see https://github.com/facebookresearch/segment-anything — SamAutomaticMaskGenerator visualization style.
 */
const BREAKDOWN_MASK_RGB: ReadonlyArray<readonly [number, number, number]> = [
  [34, 211, 238],
  [249, 115, 22],
  [168, 85, 247],
  [34, 197, 94],
  [236, 72, 153],
  [234, 179, 8],
  [59, 130, 246],
  [248, 113, 113],
  [14, 165, 233],
  [244, 63, 94],
  [52, 211, 153],
  [251, 146, 60],
];

const MASK_OVERLAY_BASE_ALPHA = 0.45;
/** Selected region: near-solid white so it reads clearly on top of other masks. */
const MASK_OVERLAY_SELECTED_WHITE_ALPHA = 0.92;
/** Black outline radius in CSS pixels (integer); 2 ≈ crisp SAM-demo style border. */
const MASK_OUTLINE_RADIUS_PX = 2;

const TIP_SAM_COhesive =
  "For ~4 clean regions (panel + icon + 2 cards): Max elements 6–10, Min box area ~0.03–0.06, points_per_side must be an integer 4–128 (e.g. 28–36). pred_iou_thresh 0.90–0.92, stability_score_thresh 0.95–0.98, min_mask_region_area 150–400. mask_morph_open 0–1; mask_morph_close 1–2. " +
  "Composite icons (e.g. wings + compass face): SAM often splits on color/edge boundaries—no single setting guarantees one mask. Try slightly lower pred_iou_thresh (0.85–0.88) and stability_score_thresh (0.90–0.93) for a larger inclusive mask; raise box_nms_thresh to 0.85–0.9; try mask_morph_close 2–3 only if wing and face almost touch in the binary mask. If two rows remain for one icon, remove the extra row in the list.";

const TIP_MASK_MORPH =
  "After SAM, each mask is cleaned with OpenCV morphology (3×3 ellipse). Open: removes isolated speckle outside the shape. Close: fills tiny holes. 1+1 is a good default; set to 0/0 for raw SAM bitmaps. Requires opencv in the local agent venv.";

const TIP_MIN_MASK_REGION =
  "SAM built-in postprocess (needs OpenCV): removes disconnected regions and holes smaller than this pixel area. Try 64–256 to drop dust; 0 disables.";

/**
 * Where the preview image is actually drawn inside the img element box (CSS px).
 * When max-width and max-height both apply, the bitmap is letterboxed: clientWidth by clientHeight
 * can be larger than the drawn image; masks must be scaled into (ox,oy,dw,dh) only.
 */
type PreviewContentRect = {
  cw: number;
  ch: number;
  ox: number;
  oy: number;
  dw: number;
  dh: number;
  /** Intrinsic image pixels (after browser decode / EXIF), same space as SAM mask PNGs. */
  nw: number;
  nh: number;
};

function computePreviewContentRect(img: HTMLImageElement): PreviewContentRect | null {
  const cw = img.clientWidth;
  const ch = img.clientHeight;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (cw <= 0 || ch <= 0 || nw <= 0 || nh <= 0) {
    return null;
  }
  const scale = Math.min(cw / nw, ch / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  const ox = (cw - dw) / 2;
  const oy = (ch - dh) / 2;
  return { cw, ch, ox, oy, dw, dh, nw, nh };
}

function maskOverlaySortKey(el: UiBreakdownElement): number {
  const f = el.maskAreaFraction;
  if (typeof f === "number" && f > 0) {
    return f;
  }
  const bw = Math.max(0, el.x_max - el.x_min);
  const bh = Math.max(0, el.y_max - el.y_min);
  return bw * bh;
}

function maskPixelFg(data: Uint8ClampedArray, p: number): boolean {
  return Math.max(data[p], data[p + 1], data[p + 2]) >= 6;
}

function paintBlackOutlineDisc(
  od: Uint8ClampedArray,
  cw: number,
  ch: number,
  x: number,
  y: number,
  radius: number,
): void {
  for (let dy = -radius; dy <= radius; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= ch) {
      continue;
    }
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) {
        continue;
      }
      const xx = x + dx;
      if (xx < 0 || xx >= cw) {
        continue;
      }
      const p = (yy * cw + xx) * 4;
      od[p] = 0;
      od[p + 1] = 0;
      od[p + 2] = 0;
      od[p + 3] = 255;
    }
  }
}

/**
 * Draw a full-image mask PNG into tctx mapped to (ox,oy,dw,dh). If the PNG's intrinsic size matches
 * (nh, nw) while the preview image is (nw, nh), the bitmap was saved with H/W swapped vs the UI image
 * — transpose pixels so horizontal UI lines align with horizontal masks.
 */
function drawMaskAlignedToContentRect(
  tctx: CanvasRenderingContext2D,
  im: HTMLImageElement,
  ox: number,
  oy: number,
  dw: number,
  dh: number,
  nw: number,
  nh: number,
): void {
  const sw = im.naturalWidth > 0 ? im.naturalWidth : im.width;
  const sh = im.naturalHeight > 0 ? im.naturalHeight : im.height;
  if (sw <= 0 || sh <= 0 || nw <= 0 || nh <= 0) {
    return;
  }
  const cw2 = tctx.canvas.width;
  const ch2 = tctx.canvas.height;
  tctx.clearRect(0, 0, cw2, ch2);
  if (sw === nw && sh === nh) {
    tctx.drawImage(im, 0, 0, sw, sh, ox, oy, dw, dh);
    return;
  }
  if (sw === nh && sh === nw) {
    const tc = document.createElement("canvas");
    tc.width = sw;
    tc.height = sh;
    const tx = tc.getContext("2d");
    if (!tx) {
      return;
    }
    tx.drawImage(im, 0, 0);
    const src = tx.getImageData(0, 0, sw, sh);
    const dst = tctx.createImageData(nw, nh);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const si = (x * sw + y) * 4;
        const di = (y * nw + x) * 4;
        dst.data[di] = src.data[si];
        dst.data[di + 1] = src.data[si + 1];
        dst.data[di + 2] = src.data[si + 2];
        dst.data[di + 3] = src.data[si + 3];
      }
    }
    const tc2 = document.createElement("canvas");
    tc2.width = nw;
    tc2.height = nh;
    const tx2 = tc2.getContext("2d");
    if (!tx2) {
      return;
    }
    tx2.putImageData(dst, 0, 0);
    tctx.drawImage(tc2, 0, 0, nw, nh, ox, oy, dw, dh);
    return;
  }
  tctx.drawImage(im, 0, 0, sw, sh, ox, oy, dw, dh);
}

/** Composite SAM mask PNGs (panoptic-style fill + black edges, like the SAM notebook / train demo). */
function paintSamMasksOnCanvas(
  canvas: HTMLCanvasElement,
  elements: UiBreakdownElement[],
  selectedId: string | null,
  content: PreviewContentRect,
  paintGen: number,
  getCurrentPaintGen: () => number,
): void {
  const { cw, ch, ox, oy, dw, dh, nw, nh } = content;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || cw <= 0 || ch <= 0 || dw <= 0 || dh <= 0) {
    return;
  }
  canvas.width = cw;
  canvas.height = ch;
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  ctx.clearRect(0, 0, cw, ch);

  const withMask = elements.filter((e) => e.maskPngBase64?.trim());
  /** When SAM masks are missing, show bbox fallback only (no real SAM geometry). */
  if (withMask.length === 0 && elements.length > 0) {
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const [r0, g0, b0] = BREAKDOWN_MASK_RGB[i % BREAKDOWN_MASK_RGB.length];
      const sel = selectedId === el.id;
      const a = sel ? MASK_OVERLAY_SELECTED_WHITE_ALPHA : 0.3;
      ctx.fillStyle = sel ? `rgba(255,255,255,${a})` : `rgba(${r0},${g0},${b0},${a})`;
      const x = ox + el.x_min * dw;
      const y = oy + el.y_min * dh;
      const rw = Math.max(1, (el.x_max - el.x_min) * dw);
      const rh = Math.max(1, (el.y_max - el.y_min) * dh);
      ctx.fillRect(x, y, rw, rh);
    }
    return;
  }

  if (withMask.length === 0) {
    return;
  }

  /** Non-selected masks first (by area), then the selected mask on top in solid white. */
  const sortedMask = [...withMask].sort((a, b) => {
    const aSel = a.id === selectedId ? 1 : 0;
    const bSel = b.id === selectedId ? 1 : 0;
    if (aSel !== bSel) {
      return aSel - bSel;
    }
    return maskOverlaySortKey(b) - maskOverlaySortKey(a);
  });

  const pixelCount = cw * ch;
  const pr = new Float32Array(pixelCount * 4);
  const tmp = document.createElement("canvas");
  tmp.width = cw;
  tmp.height = ch;
  const tctx = tmp.getContext("2d");
  if (!tctx) {
    return;
  }

  const loadMaskImage = (b64: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("mask decode"));
      im.src = `data:image/png;base64,${b64}`;
    });

  void (async () => {
    try {
      const loaded = new Map<string, HTMLImageElement>();
      for (let i = 0; i < sortedMask.length; i++) {
        if (getCurrentPaintGen() !== paintGen) {
          return;
        }
        const el = sortedMask[i];
        const im = await loadMaskImage(el.maskPngBase64!);
        loaded.set(el.id, im);
      }

      for (let mi = 0; mi < sortedMask.length; mi++) {
        if (getCurrentPaintGen() !== paintGen) {
          return;
        }
        const el = sortedMask[mi];
        const im = loaded.get(el.id);
        if (!im) {
          continue;
        }
        const idx = elements.findIndex((x) => x.id === el.id);
        const colorIdx = idx >= 0 ? idx : mi;
        const [r0, g0, b0] = BREAKDOWN_MASK_RGB[colorIdx % BREAKDOWN_MASK_RGB.length];
        const isSel = selectedId === el.id;
        const r = isSel ? 1 : r0 / 255;
        const g = isSel ? 1 : g0 / 255;
        const b = isSel ? 1 : b0 / 255;
        const baseA = isSel ? MASK_OVERLAY_SELECTED_WHITE_ALPHA : MASK_OVERLAY_BASE_ALPHA;

        tctx.clearRect(0, 0, cw, ch);
        const sw = im.naturalWidth > 0 ? im.naturalWidth : im.width;
        const sh = im.naturalHeight > 0 ? im.naturalHeight : im.height;
        if (sw <= 0 || sh <= 0) {
          continue;
        }
        drawMaskAlignedToContentRect(tctx, im, ox, oy, dw, dh, nw, nh);
        const idata = tctx.getImageData(0, 0, cw, ch);
        const d = idata.data;
        for (let p = 0; p < d.length; p += 4) {
          const lum = Math.max(d[p], d[p + 1], d[p + 2]);
          if (lum < 6) {
            continue;
          }
          const sa = (lum / 255) * baseA;
          if (sa < 0.0001) {
            continue;
          }
          const sPr = r * sa;
          const sPg = g * sa;
          const sPb = b * sa;
          const dPr = pr[p];
          const dPg = pr[p + 1];
          const dPb = pr[p + 2];
          const dPa = pr[p + 3];
          pr[p] = sPr + dPr * (1 - sa);
          pr[p + 1] = sPg + dPg * (1 - sa);
          pr[p + 2] = sPb + dPb * (1 - sa);
          pr[p + 3] = sa + dPa * (1 - sa);
        }
      }

      if (getCurrentPaintGen() !== paintGen) {
        return;
      }
      const out = ctx.createImageData(cw, ch);
      const od = out.data;
      for (let p = 0; p < pr.length; p += 4) {
        const pa = pr[p + 3];
        if (pa < 1e-5) {
          continue;
        }
        od[p] = Math.min(255, Math.round((pr[p] / pa) * 255));
        od[p + 1] = Math.min(255, Math.round((pr[p + 1] / pa) * 255));
        od[p + 2] = Math.min(255, Math.round((pr[p + 2] / pa) * 255));
        od[p + 3] = Math.min(255, Math.round(pa * 255));
      }

      for (let mi = 0; mi < sortedMask.length; mi++) {
        if (getCurrentPaintGen() !== paintGen) {
          return;
        }
        const el = sortedMask[mi];
        const im = loaded.get(el.id);
        if (!im) {
          continue;
        }
        if (el.id === selectedId) {
          continue;
        }
        tctx.clearRect(0, 0, cw, ch);
        const sw = im.naturalWidth > 0 ? im.naturalWidth : im.width;
        const sh = im.naturalHeight > 0 ? im.naturalHeight : im.height;
        if (sw <= 0 || sh <= 0) {
          continue;
        }
        drawMaskAlignedToContentRect(tctx, im, ox, oy, dw, dh, nw, nh);
        const idata = tctx.getImageData(0, 0, cw, ch);
        const d = idata.data;
        const bx0 = Math.max(0, Math.floor(ox + el.x_min * dw) - 1);
        const by0 = Math.max(0, Math.floor(oy + el.y_min * dh) - 1);
        const bx1 = Math.min(cw, Math.ceil(ox + el.x_max * dw) + 1);
        const by1 = Math.min(ch, Math.ceil(oy + el.y_max * dh) + 1);
        for (let y = by0; y < by1; y++) {
          for (let x = bx0; x < bx1; x++) {
            const p = (y * cw + x) * 4;
            if (!maskPixelFg(d, p)) {
              continue;
            }
            const nL = x > 0 && maskPixelFg(d, p - 4);
            const nR = x + 1 < cw && maskPixelFg(d, p + 4);
            const nU = y > 0 && maskPixelFg(d, p - 4 * cw);
            const nD = y + 1 < ch && maskPixelFg(d, p + 4 * cw);
            if (nL && nR && nU && nD) {
              continue;
            }
            paintBlackOutlineDisc(od, cw, ch, x, y, MASK_OUTLINE_RADIUS_PX);
          }
        }
      }

      if (getCurrentPaintGen() !== paintGen) {
        return;
      }
      ctx.putImageData(out, 0, 0);
    } catch {
      if (getCurrentPaintGen() === paintGen) {
        ctx.clearRect(0, 0, cw, ch);
      }
    }
  })();
}

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
  /** Highlighted region on the preview (click to select; hit target is bbox-sized). */
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [maxElements, setMaxElements] = useState(10);
  const [minBoxFraction, setMinBoxFraction] = useState(0.001);
  const [samPointsPerSide, setSamPointsPerSide] = useState(25);
  const [samPredIouThresh, setSamPredIouThresh] = useState(0.88);
  const [samStabilityThresh, setSamStabilityThresh] = useState(0.92);
  const [samCropNLayers, setSamCropNLayers] = useState(0);
  const [samCropNmsThresh, setSamCropNmsThresh] = useState(0.7);
  const [samMinMaskRegionArea, setSamMinMaskRegionArea] = useState(0);
  const [samBoxNmsThresh, setSamBoxNmsThresh] = useState(0.7);
  /** Post-process each SAM mask with OpenCV morphology before PNG (0–3 iterations each). */
  const [maskMorphOpen, setMaskMorphOpen] = useState(1);
  const [maskMorphClose, setMaskMorphClose] = useState(2);
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
  /** Export only the selected region’s widget PNG (no background plate). */
  const [selectionOnlyProcess, setSelectionOnlyProcess] = useState(false);
  const previewImgRef = useRef<HTMLImageElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskPaintGenRef = useRef(0);

  const working = detecting || stripping || processing;
  useEffect(() => {
    onWorkingChange?.(working);
  }, [working, onWorkingChange]);

  useEffect(() => {
    return () => {
      onWorkingChange?.(false);
    };
  }, [onWorkingChange]);
  const [previewLayout, setPreviewLayout] = useState<PreviewContentRect | null>(null);

  const updatePreviewLayout = useCallback(() => {
    const el = previewImgRef.current;
    if (!el) return;
    const rect = computePreviewContentRect(el);
    if (rect) {
      setPreviewLayout(rect);
    }
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
    const img = previewImgRef.current;
    const canvas = maskCanvasRef.current;
    if (!img || !canvas || !previewUrl || !previewLayout) {
      return;
    }
    maskPaintGenRef.current += 1;
    const gen = maskPaintGenRef.current;
    paintSamMasksOnCanvas(canvas, elements, selectedBoxId, previewLayout, gen, () => maskPaintGenRef.current);
  }, [elements, previewLayout, selectedBoxId, previewUrl]);

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
        mask_morph_open: maskMorphOpen,
        mask_morph_close: maskMorphClose,
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
      const maskById = new Map<string, string>();
      const maskAreaById = new Map<string, number>();
      for (const e of samOut.elements ?? []) {
        const raw = e as { mask_png_base64?: string; mask_area_fraction?: number };
        const b64 = raw.mask_png_base64?.trim();
        if (b64) {
          maskById.set(e.id, b64);
        }
        if (typeof raw.mask_area_fraction === "number") {
          maskAreaById.set(e.id, raw.mask_area_fraction);
        }
      }
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
      setElements(
        el.map((row) => {
          const fromId = row.id ? maskById.get(row.id)?.trim() : undefined;
          const area = row.id ? maskAreaById.get(row.id) : undefined;
          return {
            ...row,
            maskPngBase64: fromId,
            maskAreaFraction: area,
          };
        }),
      );
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
    maskMorphOpen,
    maskMorphClose,
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
      if (isGeminiImageConfirmCancelled(e)) {
        onActivityUpdate({ message: "Cancelled.", isError: false });
      } else {
        onActivityUpdate({ message: e instanceof Error ? e.message : "Remove text failed.", isError: true });
      }
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
    if (selectionOnlyProcess && !selectedBoxId?.trim()) {
      onActivityUpdate({ message: "Select a region in the preview or list (Selection only).", isError: true });
      return;
    }
    const folder = exportFolderName.trim() || "export";
    setProcessing(true);
    onActivityUpdate({
      message: selectionOnlyProcess ? "Exporting selected widget…" : "Cropping widgets and generating background…",
      isError: false,
    });
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
        onlyElementId: selectionOnlyProcess ? selectedBoxId : null,
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
      if (isGeminiImageConfirmCancelled(e)) {
        onActivityUpdate({ message: "Cancelled.", isError: false });
      } else {
        onActivityUpdate({ message: e instanceof Error ? e.message : "Process failed.", isError: true });
      }
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
    selectionOnlyProcess,
    selectedBoxId,
  ]);

  if (!sourceImage) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted, #94a3b8)" }}>
        Choose a UI Canvas image in the gallery and click <strong>Breakdown</strong>, or pick an image first.
      </p>
    );
  }

  /** Fits preview in viewport while keeping mask/bbox overlays aligned (wrapper matches scaled img pixels). */
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
        <span style={{ fontSize: 12, color: "#94a3b8" }}>Preview ({elements.length} regions)</span>
        <ImagegenTooltip text={TIP_PREVIEW} />
        {elements.length > 0 && (
          <span style={{ fontSize: 11, color: "#64748b" }}>Click a region to highlight · Remove rows in the list →</span>
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
            onLoad={() => {
              updatePreviewLayout();
            }}
            onClick={() => setSelectedBoxId(null)}
            style={{
              display: "block",
              maxWidth: "100%",
              maxHeight: previewMaxHeight,
              width: "auto",
              height: "auto",
              position: "relative",
              zIndex: 0,
            }}
          />
          <canvas
            ref={maskCanvasRef}
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              pointerEvents: "none",
              zIndex: 1,
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
              const hasMask = Boolean(el.maskPngBase64);
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
                    left: L ? `${L.ox + x0 * L.dw}px` : `${x0 * 100}%`,
                    top: L ? `${L.oy + y0 * L.dh}px` : `${y0 * 100}%`,
                    width: L ? `${bw * L.dw}px` : `${bw * 100}%`,
                    height: L ? `${bh * L.dh}px` : `${bh * 100}%`,
                    boxSizing: "border-box",
                    /* Canvas draws the real SAM shape; avoid a second rectangular outline when a mask exists. */
                    border: hasMask
                      ? "none"
                      : selected
                        ? "2px solid rgba(250, 204, 21, 0.98)"
                        : "2px solid rgba(34, 211, 238, 0.95)",
                    borderRadius: hasMask ? 0 : 2,
                    pointerEvents: "auto",
                    cursor: "pointer",
                    outline: "none",
                    zIndex: 2,
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
            max={256}
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
        <p style={{ fontSize: 11, color: "var(--muted, #94a3b8)", margin: "0 0 8px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Fewer duplicate masks (panel, icon, 2 cards)
            <ImagegenTooltip text={TIP_SAM_COhesive} />
          </span>
        </p>
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
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              min_mask_region_area
              <ImagegenTooltip text={TIP_MIN_MASK_REGION} />
            </span>
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
          <div style={{ gridColumn: "1 / -1", marginTop: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11 }}>Mask cleanup (OpenCV, after SAM)</span>
              <ImagegenTooltip text={TIP_MASK_MORPH} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={{ fontSize: 11 }}>
                mask_morph_open
                <input
                  type="number"
                  min={0}
                  max={3}
                  className="imagegen-select"
                  style={{ width: "100%", marginTop: 4 }}
                  value={maskMorphOpen}
                  onChange={(e) => setMaskMorphOpen(Number(e.target.value))}
                />
              </label>
              <label style={{ fontSize: 11 }}>
                mask_morph_close
                <input
                  type="number"
                  min={0}
                  max={3}
                  className="imagegen-select"
                  style={{ width: "100%", marginTop: 4 }}
                  value={maskMorphClose}
                  onChange={(e) => setMaskMorphClose(Number(e.target.value))}
                />
              </label>
            </div>
          </div>
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
            {detecting ? "Detecting…" : "Detect UI regions (SAM)"}
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
            disabled={
              processing ||
              !elements.length ||
              (selectionOnlyProcess && !selectedBoxId?.trim())
            }
            onClick={() => void handleProcess()}
          >
            {processing ? "Processing…" : "Break Down Images"}
          </button>
          <ImagegenTooltip text={TIP_BTN_PROCESS} />
        </span>
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          cursor: "pointer",
          marginTop: 10,
          color: "var(--foreground, #e2e8f0)",
        }}
      >
        <input
          type="checkbox"
          checked={selectionOnlyProcess}
          onChange={(e) => setSelectionOnlyProcess(e.target.checked)}
        />
        Selection only
        <ImagegenTooltip text={TIP_SELECTION_ONLY_PROCESS} />
      </label>

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
