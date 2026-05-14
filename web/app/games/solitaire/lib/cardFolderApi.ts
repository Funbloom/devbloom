"use client";

import { fetchApi } from "../../../lib/api";

type ErrorDetail = string | { loc?: unknown[]; msg?: string }[];

function extractErrorMessage(status: number, detail: ErrorDetail | undefined): string {
  if (typeof detail === "string" && detail.trim() !== "") return detail;
  if (Array.isArray(detail) && detail.length > 0 && typeof detail[0]?.msg === "string") {
    return detail[0].msg;
  }
  return `Generate failed: ${status}`;
}

export type SolitaireCardsFolderBatchResult = {
  folder: string;
  target_width?: number;
  processed: string[];
  skipped: string[];
  errors: Array<{ filename: string; error: string }>;
  missing_filenames?: string[];
};

/** Resize each PNG/JPEG/WebP in the folder to width 512px (height proportional). In-place on API project root. */
export async function solitaireCardsResizeFolder(
  projectKey: string,
  folderRelative: string,
  filenames?: string[] | null
): Promise<SolitaireCardsFolderBatchResult> {
  const body: Record<string, unknown> = {
    project_key: projectKey.trim(),
    folder_relative: folderRelative.trim().replace(/\\/g, "/"),
  };
  if (filenames != null && filenames.length > 0) {
    body.filenames = filenames;
  }
  const response = await fetchApi("/tools/solitaire_cards_resize_folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { detail?: ErrorDetail };
    throw new Error(extractErrorMessage(response.status, errBody.detail));
  }
  return (await response.json()) as SolitaireCardsFolderBatchResult;
}

/** Set outer near-white border to transparent (corner flood-fill; canvas unchanged). JPEG → PNG on API project root. */
export async function solitaireCardsTrimBordersFolder(
  projectKey: string,
  folderRelative: string,
  filenames?: string[] | null
): Promise<SolitaireCardsFolderBatchResult> {
  const body: Record<string, unknown> = {
    project_key: projectKey.trim(),
    folder_relative: folderRelative.trim().replace(/\\/g, "/"),
  };
  if (filenames != null && filenames.length > 0) {
    body.filenames = filenames;
  }
  const response = await fetchApi("/tools/solitaire_cards_trim_borders_folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { detail?: ErrorDetail };
    throw new Error(extractErrorMessage(response.status, errBody.detail));
  }
  return (await response.json()) as SolitaireCardsFolderBatchResult;
}
