"use client";

import { confirmGeminiImageIfNeeded } from "../lib/confirmGeminiImage";
import { fetchApi } from "../lib/api";
import type { Style } from "../storyboard/types";
import type { GeneratedImage } from "./types";
import { API_BASE } from "./config";

export type BackendImageResult = {
  url?: string;
  filename?: string;
};

type ErrorDetail =
  | string
  | { loc?: unknown[]; msg?: string }[];

function extractErrorMessage(status: number, detail: ErrorDetail | undefined): string {
  if (typeof detail === "string" && detail.trim() !== "") return detail;
  if (Array.isArray(detail) && detail.length > 0 && typeof detail[0]?.msg === "string") {
    return detail[0].msg;
  }
  return `Generate failed: ${status}`;
}

export function normalizeImageUrl(url: string): string {
  if (url.startsWith("http")) return url;
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Gen/Images/UI nested assets use `/images/ui_file?...&rel=<encoded>`.
 * Returns the decoded `rel` (e.g. `MyFolder/screen.png`) or null.
 */
export function parseNestedUiRelFromUrl(url: string): string | null {
  const u = (url || "").trim();
  if (!u) return null;
  try {
    const parsed = new URL(u, API_BASE);
    if (!parsed.pathname.includes("/ui_file")) return null;
    const rel = parsed.searchParams.get("rel");
    if (!rel?.trim()) return null;
    return rel.replace(/\\/g, "/").trim() || null;
  } catch {
    return null;
  }
}

/** Resolve reference for Nano Banana edit API: full HTTPS URL, bare Images/ filename, or Gen/Images/UI nested path. */
export function resolveReferenceForEditApi(img: GeneratedImage): string {
  const nested = img.nestedUiRelativePath?.trim();
  if (nested) return nested.replace(/\\/g, "/");
  const u = (img.url || "").trim();
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (img.filename?.trim()) return img.filename.trim();
  try {
    const parsed = new URL(u, API_BASE);
    const last = parsed.pathname.split("/").filter(Boolean).pop() || "";
    if (last && /^[a-zA-Z0-9._-]+$/.test(last)) return last;
  } catch {
    // ignore
  }
  throw new Error("This image needs a stored filename or full URL to use as an edit reference.");
}

export async function editImageNanobanana(params: {
  changes: string;
  reference: string;
  project_key?: string;
  width?: number;
  height?: number;
  /** Same model ids as Image Gen left tab / generate_image. */
  model?: string;
}): Promise<BackendImageResult[]> {
  confirmGeminiImageIfNeeded({ forceGemini: true });
  const body: Record<string, unknown> = {
    changes: params.changes.trim(),
    reference: params.reference.trim(),
  };
  if (params.project_key?.trim()) body.project_key = params.project_key.trim();
  if (typeof params.width === "number") body.width = params.width;
  if (typeof params.height === "number") body.height = params.height;
  if (params.model?.trim()) body.model = params.model.trim();
  const response = await fetchApi("/tools/edit_image_nanobanana", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { detail?: ErrorDetail };
    throw new Error(extractErrorMessage(response.status, errBody.detail));
  }
  const data = (await response.json()) as { images?: BackendImageResult[] };
  return (data.images ?? []).filter((img) => (img.url || img.filename || "") !== "");
}

export async function generateImageFromPrompt(
  prompt: string,
  options?: {
    negativePrompt?: string;
    width?: number;
    height?: number;
    numImages?: number;
    model?: string;
    quality?: string;
    style?: string;
    transparentBackground?: boolean;
    /** When set, images are saved under this project’s Images/ (same as remove background). */
    projectKey?: string;
    /** Reference images (project Images/ filenames or URLs); Gemini uses them for conditioning. */
    referenceImageFilenames?: string[];
  }
): Promise<BackendImageResult[]> {
  confirmGeminiImageIfNeeded({
    modelId: options?.model,
    referenceImageFilenames: options?.referenceImageFilenames,
  });
  const body: Record<string, unknown> = { prompt };
  if (options?.projectKey?.trim()) body.project_key = options.projectKey.trim();
  if (options?.negativePrompt?.trim()) {
    body.negative_prompt = options.negativePrompt.trim();
  }
  if (typeof options?.width === "number") body.width = options.width;
  if (typeof options?.height === "number") body.height = options.height;
  if (typeof options?.numImages === "number") body.num_images = options.numImages;
  if (options?.model) body.model = options.model;
  if (options?.quality) body.quality = options.quality;
  if (options?.style) body.style = options.style;
  if (typeof options?.transparentBackground === "boolean") {
    body.transparent_background = options.transparentBackground;
  }
  if (options?.referenceImageFilenames?.length) {
    body.reference_image_filenames = options.referenceImageFilenames.filter((s) => String(s).trim());
  }
  const response = await fetchApi("/tools/generate_image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { detail?: ErrorDetail };
    throw new Error(extractErrorMessage(response.status, errBody.detail));
  }
  const data = (await response.json()) as { images?: BackendImageResult[] };
  return (data.images ?? []).filter((img) => (img.url || img.filename || "") !== "");
}

/** UI Builder wireframe polish: server builds prompt from sketch + optional style id / snippet / ref filenames. */
export async function generateUiCanvasPolish(options: {
  projectKey: string;
  sketchFilename: string;
  sketchTitle?: string;
  styleId?: string | null;
  extraUserPrompt?: string;
  styleReferenceFilenames?: string[];
  model?: string;
  width?: number;
  height?: number;
  /** 0–100: wireframe placement vs creative layout (API default 75). */
  layoutFidelity?: number;
  /** OpenAI image models: API transparent background. Omitted defaults server-side True. */
  transparentBackground?: boolean;
  /** When true, caller already confirmed the expensive Gemini image step (e.g. batch polish). */
  skipGeminiConfirm?: boolean;
}): Promise<{ images: BackendImageResult[]; styleName?: string | null }> {
  if (!options.skipGeminiConfirm) {
    confirmGeminiImageIfNeeded({ modelId: options.model });
  }
  const body: Record<string, unknown> = {
    project_key: options.projectKey.trim(),
    sketch_filename: options.sketchFilename.trim(),
  };
  if (options.sketchTitle?.trim()) body.sketch_title = options.sketchTitle.trim();
  const sid = options.styleId?.trim();
  if (sid && sid !== "__none") body.style_id = sid;
  if (options.extraUserPrompt?.trim()) body.extra_user_prompt = options.extraUserPrompt.trim();
  if (options.styleReferenceFilenames?.length) {
    body.style_reference_filenames = options.styleReferenceFilenames.map((s) => String(s).trim()).filter(Boolean);
  }
  if (options.model) body.model = options.model;
  if (typeof options.width === "number") body.width = options.width;
  if (typeof options.height === "number") body.height = options.height;
  if (typeof options.layoutFidelity === "number") {
    body.layout_fidelity = Math.max(0, Math.min(100, Math.round(options.layoutFidelity)));
  }
  if (typeof options.transparentBackground === "boolean") {
    body.transparent_background = options.transparentBackground;
  }
  const response = await fetchApi("/tools/ui_canvas_polish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { detail?: ErrorDetail };
    throw new Error(extractErrorMessage(response.status, errBody.detail));
  }
  const data = (await response.json()) as {
    images?: BackendImageResult[];
    style_name?: string | null;
  };
  const images = (data.images ?? []).filter((img) => (img.url || img.filename || "") !== "");
  return { images, styleName: data.style_name ?? null };
}

export type UiBreakdownElement = {
  id: string;
  label: string;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  /** SAM mask as PNG (base64), from local agent — preview overlay and Process export alpha (non-rectangular crops). Not sent to detect API. */
  maskPngBase64?: string;
  /** Fraction of image pixels in this mask (from local agent SAM `area` / image pixels). Used for overlay draw order. */
  maskAreaFraction?: number;
};

/** SAM Automatic Mask Generator params (optional overrides; server merges with defaults). */
export type UiBreakdownSamParams = {
  points_per_side?: number;
  points_per_batch?: number;
  pred_iou_thresh?: number;
  stability_score_thresh?: number;
  stability_score_offset?: number;
  crop_n_layers?: number;
  crop_nms_thresh?: number;
  crop_overlap_ratio?: number;
  crop_n_points_downscale_factor?: number;
  min_mask_region_area?: number;
  box_nms_thresh?: number;
  /** Local agent: morphological open iterations (0–3) on each mask — removes speckle; needs OpenCV. */
  mask_morph_open?: number;
  /** Local agent: morphological close iterations (0–3) — fills pinholes; needs OpenCV. */
  mask_morph_close?: number;
};

/** SAM geometry comes from the local agent (`POST /ui_breakdown/sam`); the API only labels regions. */
export async function detectUiBreakdown(options: {
  projectKey: string;
  sourceFilename: string;
  prefetchedElements: UiBreakdownElement[];
  /** If true, skip Gemini labeling (keeps generic segment labels from SAM). */
  skipVlmLabel?: boolean;
  labelTemperature?: number;
  /** Gemini model id for labeling (optional; server default). */
  labelModel?: string;
}): Promise<{
  elements: UiBreakdownElement[];
  /** Canonical pixel size of the source image (after EXIF); optional. */
  imageWidth?: number;
  imageHeight?: number;
}> {
  const body: Record<string, unknown> = {
    project_key: options.projectKey.trim(),
    source_filename: options.sourceFilename.trim(),
    prefetched_elements: options.prefetchedElements.map((e) => ({
      id: e.id,
      label: e.label,
      x_min: e.x_min,
      y_min: e.y_min,
      x_max: e.x_max,
      y_max: e.y_max,
    })),
  };
  if (options.skipVlmLabel === true) body.skip_vlm_label = true;
  if (typeof options.labelTemperature === "number") body.label_temperature = options.labelTemperature;
  if (options.labelModel?.trim()) body.label_model = options.labelModel.trim();
  const response = await fetchApi("/tools/ui_breakdown_detect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { detail?: ErrorDetail };
    throw new Error(extractErrorMessage(response.status, errBody.detail));
  }
  const data = (await response.json()) as {
    elements?: UiBreakdownElement[];
    image_width?: number;
    image_height?: number;
  };
  return {
    elements: data.elements ?? [],
    imageWidth: typeof data.image_width === "number" ? data.image_width : undefined,
    imageHeight: typeof data.image_height === "number" ? data.image_height : undefined,
  };
}

export async function stripTextForBreakdown(options: {
  projectKey: string;
  sourceFilename: string;
  promptSuffix?: string;
  width?: number;
  height?: number;
  model?: string;
}): Promise<BackendImageResult> {
  confirmGeminiImageIfNeeded({ forceGemini: true });
  const body: Record<string, unknown> = {
    project_key: options.projectKey.trim(),
    source_filename: options.sourceFilename.trim(),
  };
  if (options.promptSuffix?.trim()) body.prompt_suffix = options.promptSuffix.trim();
  if (typeof options.width === "number") body.width = options.width;
  if (typeof options.height === "number") body.height = options.height;
  if (options.model) body.model = options.model;
  const response = await fetchApi("/tools/ui_breakdown_strip_text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { detail?: ErrorDetail };
    throw new Error(extractErrorMessage(response.status, errBody.detail));
  }
  const data = (await response.json()) as BackendImageResult;
  return data;
}

export type UiBreakdownProcessFile = {
  role: string;
  filename: string;
  relative_path?: string;
  url: string;
};

export async function processUiBreakdown(options: {
  projectKey: string;
  sourceFilename: string;
  exportFolder: string;
  elements: UiBreakdownElement[];
  cropPaddingPx?: number;
  backgroundPromptSuffix?: string;
  width?: number;
  height?: number;
  regenModel?: string;
  /** Default true: background plate uses GPT Image `background=transparent` (not Remove text). */
  transparentBackground?: boolean;
  /** If set, only this region’s widget PNG is written; background.png is not generated. */
  onlyElementId?: string | null;
}): Promise<{ folder: string; files: UiBreakdownProcessFile[] }> {
  if (!options.onlyElementId?.trim()) {
    confirmGeminiImageIfNeeded({ forceGemini: true });
  }
  const body: Record<string, unknown> = {
    project_key: options.projectKey.trim(),
    source_filename: options.sourceFilename.trim(),
    export_folder: options.exportFolder.trim(),
    elements: options.elements,
    transparent_background: options.transparentBackground !== false,
  };
  if (typeof options.cropPaddingPx === "number") body.crop_padding_px = options.cropPaddingPx;
  if (options.backgroundPromptSuffix?.trim()) body.background_prompt_suffix = options.backgroundPromptSuffix.trim();
  if (typeof options.width === "number") body.width = options.width;
  if (typeof options.height === "number") body.height = options.height;
  if (options.regenModel) body.regen_model = options.regenModel;
  if (options.onlyElementId?.trim()) body.only_element_id = options.onlyElementId.trim();
  const response = await fetchApi("/tools/ui_breakdown_process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { detail?: ErrorDetail };
    throw new Error(extractErrorMessage(response.status, errBody.detail));
  }
  return (await response.json()) as { folder: string; files: UiBreakdownProcessFile[] };
}

/** Upload a file and save it under the project Images/ folder (same as generated images). */
function filenameFromImportUrl(url: string): string {
  try {
    const u = new URL(url, API_BASE);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    return decodeURIComponent(last);
  } catch {
    return "";
  }
}

export async function importImageFile(
  file: File,
  projectKey: string,
  options?: { replaceFilename?: string; /** Save under project Gen/Images/UI (UI Builder). */ uiCanvas?: boolean },
): Promise<BackendImageResult[]> {
  const form = new FormData();
  const uploadName = file.name?.trim() || "upload.jpg";
  form.append("file", file, uploadName);
  form.append("project_key", projectKey.trim());
  const rf = options?.replaceFilename?.trim();
  if (rf) form.append("replace_filename", rf);
  if (options?.uiCanvas) form.append("ui_canvas", "true");
  const response = await fetchApi("/tools/import_image", {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { detail?: ErrorDetail };
    throw new Error(extractErrorMessage(response.status, errBody.detail));
  }
  const data = (await response.json()) as { images?: BackendImageResult[] };
  const raw = (data.images ?? []).map((img) => {
    const url = typeof img.url === "string" ? img.url : "";
    let filename = typeof img.filename === "string" ? img.filename.trim() : "";
    if (!filename && url) {
      filename = filenameFromImportUrl(url);
    }
    return { ...img, url, filename };
  });
  const list = raw.filter((img) => (img.url || img.filename || "") !== "");
  if (list.length === 0) {
    throw new Error("Import returned no image. Check the file format (PNG, JPEG, WebP, or GIF) and try again.");
  }
  return list;
}

export async function generateImagePrompt(conceptPrompt: string): Promise<string> {
  const response = await fetchApi("/tools/generate_image_prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: conceptPrompt }),
  });
  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(errBody.detail ?? `Generate failed: ${response.status}`);
  }
  const data = (await response.json()) as { prompt?: string };
  return data.prompt ?? conceptPrompt;
}

export async function getStyles(): Promise<Style[]> {
  const response = await fetchApi("/storyboard/styles");
  if (!response.ok) return [];
  const data = (await response.json()) as Style[] | unknown;
  return Array.isArray(data) ? data : [];
}

export async function addStyle(name: string, prompt: string): Promise<Style> {
  const response = await fetchApi("/storyboard/styles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim(), prompt: prompt.trim() }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `Add failed: ${response.status}`);
  }
  const created = (await response.json()) as Style | unknown;
  if (!created || typeof (created as Style).id !== "string") {
    throw new Error("Invalid style response from server.");
  }
  return created as Style;
}

export async function deleteStyle(styleId: string): Promise<void> {
  const response = await fetchApi(`/storyboard/styles/${encodeURIComponent(styleId)}`, { method: "DELETE" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `Delete failed: ${response.status}`);
  }
}

export async function getImageGenerated(
  projectKey: string,
  options?: { private?: boolean }
): Promise<{ images: unknown[] }> {
  const params = new URLSearchParams({ project_key: projectKey });
  if (options?.private) params.set("private", "true");
  const response = await fetchApi(`/tools/image_generated?${params.toString()}`);
  if (!response.ok) return { images: [] };
  const data = (await response.json()) as { images?: unknown[] };
  const raw = data.images ?? [];
  return { images: Array.isArray(raw) ? raw : [] };
}

export async function putImageGenerated(
  projectKey: string,
  images: Record<string, unknown>[],
  options?: { private?: boolean }
): Promise<void> {
  await fetchApi("/tools/image_generated", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_key: projectKey,
      images,
      private: options?.private ?? false,
    }),
  });
}

export async function uploadImageToCloud(
  projectKey: string,
  filename: string
): Promise<string> {
  const response = await fetchApi("/tools/image_to_cloud", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_key: projectKey, filename }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `Upload failed: ${response.status}`);
  }
  const data = (await response.json()) as { url?: string };
  if (!data.url) {
    throw new Error("Upload succeeded but no URL was returned.");
  }
  return data.url;
}

export async function listUiCanvasNestedImages(
  projectKey: string,
  options?: { subfolder?: string | null }
): Promise<Array<{ relative_path: string; url: string }>> {
  const body: Record<string, unknown> = { project_key: projectKey.trim() };
  const sub = options?.subfolder?.trim();
  if (sub) body.subfolder = sub;
  const response = await fetchApi("/tools/list_ui_canvas_nested_images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { detail?: ErrorDetail };
    throw new Error(extractErrorMessage(response.status, errBody.detail));
  }
  const data = (await response.json()) as { files?: Array<{ relative_path: string; url: string }> };
  return data.files ?? [];
}

export async function deleteUiCanvasNestedImage(
  projectKey: string,
  relativePath: string
): Promise<void> {
  const response = await fetchApi("/tools/delete_ui_canvas_nested_image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_key: projectKey.trim(),
      relative_path: relativePath.trim().replace(/\\/g, "/"),
    }),
  });
  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { detail?: ErrorDetail };
    throw new Error(extractErrorMessage(response.status, errBody.detail));
  }
}

/** Delete Gen/Images/UI/<subfolder>/ and all files inside (single folder segment). */
export async function deleteUiCanvasExportFolder(
  projectKey: string,
  subfolder: string
): Promise<void> {
  const response = await fetchApi("/tools/delete_ui_canvas_export_folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_key: projectKey.trim(),
      subfolder: subfolder.trim(),
    }),
  });
  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { detail?: ErrorDetail };
    throw new Error(extractErrorMessage(response.status, errBody.detail));
  }
}

export async function removeBackground(
  inputFilename: string,
  projectKey: string,
  options?: {
    model?: string;
    alphaMatting?: boolean;
    alphaMattingForegroundThreshold?: number;
    alphaMattingBackgroundThreshold?: number;
    /** Gen/Images/UI relative path (e.g. export/widget.png); use instead of bare filename. */
    inputUiNestedRel?: string;
  }
): Promise<BackendImageResult> {
  const body: Record<string, unknown> = {
    project_key: projectKey,
  };
  if (options?.inputUiNestedRel?.trim()) {
    body.input_ui_nested_rel = options.inputUiNestedRel.trim().replace(/\\/g, "/");
    body.input_filename = "";
  } else {
    body.input_filename = inputFilename;
  }
  if (options?.model) body.model = options.model;
  if (typeof options?.alphaMatting === "boolean") body.alpha_matting = options.alphaMatting;
  if (typeof options?.alphaMattingForegroundThreshold === "number") {
    body.alpha_matting_foreground_threshold = options.alphaMattingForegroundThreshold;
  }
  if (typeof options?.alphaMattingBackgroundThreshold === "number") {
    body.alpha_matting_background_threshold = options.alphaMattingBackgroundThreshold;
  }
  const response = await fetchApi("/tools/remove_background", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `Remove background failed: ${response.status}`);
  }
  const data = (await response.json()) as BackendImageResult | unknown;
  if (!data || typeof (data as BackendImageResult).url !== "string") {
    throw new Error("Remove background succeeded but no URL was returned.");
  }
  return data as BackendImageResult;
}

export type GenerateCharacterImageParams = {
  role?: string;
  physical_description?: string;
  age?: string;
  outfit?: string;
  negative_prompt?: string;
  style_id?: string | null;
  model?: string;
  width?: number;
  height?: number;
  /** OpenAI image output quality (low / medium / high). */
  quality?: string;
  /** OpenAI image style (natural / vivid). */
  style?: string;
  transparent_background?: boolean;
  project_key?: string;
};

export type GenerateCharacterImageResult = {
  images: BackendImageResult[];
  prompt: string;
  style_name?: string;
};

export async function generateCharacterImage(
  params: GenerateCharacterImageParams
): Promise<GenerateCharacterImageResult> {
  confirmGeminiImageIfNeeded({ modelId: params.model });
  const body: Record<string, unknown> = {
    role: params.role?.trim() || null,
    physical_description: params.physical_description?.trim() || null,
    age: params.age?.trim() || null,
    outfit: params.outfit?.trim() || null,
    negative_prompt: params.negative_prompt?.trim() || null,
    style_id: params.style_id?.trim() && params.style_id !== "__none" ? params.style_id.trim() : null,
  };
  if (params.model?.trim()) body.model = params.model.trim();
  if (typeof params.width === "number") body.width = params.width;
  if (typeof params.height === "number") body.height = params.height;
  if (params.quality?.trim()) body.quality = params.quality.trim();
  if (params.style?.trim()) body.style = params.style.trim();
  if (typeof params.transparent_background === "boolean") {
    body.transparent_background = params.transparent_background;
  }
  if (params.project_key?.trim()) body.project_key = params.project_key.trim();
  const response = await fetchApi("/tools/generate_character_image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { detail?: ErrorDetail };
    throw new Error(extractErrorMessage(response.status, errBody.detail));
  }
  const data = (await response.json()) as {
    images?: BackendImageResult[];
    prompt?: string;
    style_name?: string;
  };
  const images = (data.images ?? []).filter((img) => (img.url || img.filename || "") !== "");
  return {
    images,
    prompt: data.prompt ?? "",
    style_name: data.style_name,
  };
}
