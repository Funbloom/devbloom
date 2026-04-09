"use client";

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

/** Resolve reference for Nano Banana edit API: full HTTPS URL or bare Images/ filename. */
export function resolveReferenceForEditApi(img: GeneratedImage): string {
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
}): Promise<BackendImageResult[]> {
  const body: Record<string, unknown> = {
    changes: params.changes.trim(),
    reference: params.reference.trim(),
  };
  if (params.project_key?.trim()) body.project_key = params.project_key.trim();
  if (typeof params.width === "number") body.width = params.width;
  if (typeof params.height === "number") body.height = params.height;
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
  }
): Promise<BackendImageResult[]> {
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

/** Upload a file and save it under the project Images/ folder (same as generated images). */
export async function importImageFile(file: File, projectKey: string): Promise<BackendImageResult[]> {
  const form = new FormData();
  form.append("file", file);
  form.append("project_key", projectKey.trim());
  const response = await fetchApi("/tools/import_image", {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { detail?: ErrorDetail };
    throw new Error(extractErrorMessage(response.status, errBody.detail));
  }
  const data = (await response.json()) as { images?: BackendImageResult[] };
  return (data.images ?? []).filter((img) => (img.url || img.filename || "") !== "");
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

export async function removeBackground(
  inputFilename: string,
  projectKey: string,
  options?: {
    model?: string;
    alphaMatting?: boolean;
    alphaMattingForegroundThreshold?: number;
    alphaMattingBackgroundThreshold?: number;
  }
): Promise<BackendImageResult> {
  const body: Record<string, unknown> = {
    input_filename: inputFilename,
    project_key: projectKey,
  };
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
