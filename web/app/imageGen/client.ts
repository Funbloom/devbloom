"use client";

import type { Style } from "../storyboard/types";
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

export async function generateImageFromPrompt(
  prompt: string,
  options?: { negativePrompt?: string }
): Promise<BackendImageResult[]> {
  const body: Record<string, unknown> = { prompt };
  if (options?.negativePrompt?.trim()) {
    body.negative_prompt = options.negativePrompt.trim();
  }
  const response = await fetch(`${API_BASE}/tools/generate_image`, {
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

export async function generateImagePrompt(conceptPrompt: string): Promise<string> {
  const response = await fetch(`${API_BASE}/tools/generate_image_prompt`, {
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
  const response = await fetch(`${API_BASE}/storyboard/styles`);
  if (!response.ok) return [];
  const data = (await response.json()) as Style[] | unknown;
  return Array.isArray(data) ? data : [];
}

export async function addStyle(name: string, prompt: string): Promise<Style> {
  const response = await fetch(`${API_BASE}/storyboard/styles`, {
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
  const response = await fetch(`${API_BASE}/storyboard/styles/${styleId}`, { method: "DELETE" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `Delete failed: ${response.status}`);
  }
}

export async function getImageGenerated(projectKey: string): Promise<{ images: unknown[] }> {
  const response = await fetch(
    `${API_BASE}/tools/image_generated?project_key=${encodeURIComponent(projectKey)}`
  );
  if (!response.ok) return { images: [] };
  const data = (await response.json()) as { images?: unknown[] };
  const raw = data.images ?? [];
  return { images: Array.isArray(raw) ? raw : [] };
}

export async function putImageGenerated(
  projectKey: string,
  images: Record<string, unknown>[]
): Promise<void> {
  await fetch(`${API_BASE}/tools/image_generated`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_key: projectKey, images }),
  });
}

export type GenerateCharacterImageParams = {
  role?: string;
  physical_description?: string;
  age?: string;
  outfit?: string;
  negative_prompt?: string;
  style_id?: string | null;
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
  const response = await fetch(`${API_BASE}/tools/generate_character_image`, {
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
