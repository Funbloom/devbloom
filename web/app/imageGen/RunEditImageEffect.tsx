"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { API_BASE } from "./config";
import {
  editImageNanobanana,
  normalizeImageUrl,
  resolveReferenceForEditApi,
} from "./client";
import { IMAGEGEN_EDIT_JOB_KEY } from "./editKeys";
import type { GeneratedImage, ImageLocation, ImageTab } from "./types";

type Props = {
  projectKey: string;
  defaultLocation: ImageLocation;
  setImages: React.Dispatch<React.SetStateAction<GeneratedImage[]>>;
  setStatus: (s: string | null) => void;
  setIsEditImageGenerating: (v: boolean) => void;
  setActiveTab: (tab: ImageTab) => void;
};

export function RunEditImageEffect({
  projectKey,
  defaultLocation,
  setImages,
  setStatus,
  setIsEditImageGenerating,
  setActiveTab,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get("runEdit") !== "1") return;
    /** Capture before router.replace strips query (fallback if job JSON omits returnTo). */
    const returnToFromUrl = searchParams.get("returnTo")?.trim() || "";
    const raw = sessionStorage.getItem(IMAGEGEN_EDIT_JOB_KEY);
    if (!raw) return;
    sessionStorage.removeItem(IMAGEGEN_EDIT_JOB_KEY);
    router.replace("/imageGen");

    let job: { changes: string; image: GeneratedImage; returnTo?: string };
    try {
      job = JSON.parse(raw) as { changes: string; image: GeneratedImage; returnTo?: string };
    } catch {
      setStatus("Invalid edit job.");
      return;
    }

    const returnTo =
      job.returnTo?.trim() || returnToFromUrl || "";

    let reference: string;
    try {
      reference = resolveReferenceForEditApi(job.image);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Cannot resolve reference image.");
      return;
    }

    setIsEditImageGenerating(true);
    void (async () => {
      try {
        const results = await editImageNanobanana({
          changes: job.changes,
          reference,
          project_key: projectKey || undefined,
          width: 1024,
          height: 1024,
        });
        const now = new Date().toISOString();
        const promptLabel = `Edit: ${job.changes}\n\n(From: ${job.image.prompt.slice(0, 200)}${
          job.image.prompt.length > 200 ? "…" : ""
        })`;
        const newItems: GeneratedImage[] = results.map((img, index) => {
          const rawUrl = (img.url || img.filename || "") as string;
          const filename =
            img.filename ||
            (() => {
              try {
                const u = new URL(rawUrl, API_BASE);
                const pathname = u.pathname || "";
                const idx = pathname.lastIndexOf("/");
                return idx >= 0 ? pathname.slice(idx + 1) : "";
              } catch {
                return "";
              }
            })();
          return {
            id: `${now}-${index}-${Math.random().toString(36).slice(2)}`,
            url: rawUrl.startsWith("http") ? rawUrl : normalizeImageUrl(rawUrl),
            filename: filename || undefined,
            prompt: promptLabel,
            styleName: job.image.styleName,
            createdAt: now,
            tab: job.image.tab,
            location: defaultLocation,
          };
        });
        setImages((prev) => [...newItems, ...prev]);
        setStatus("Image edited.");
        const safeReturn =
          returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "";
        if (safeReturn) {
          window.setTimeout(() => {
            router.replace(safeReturn);
          }, 120);
        } else {
          setActiveTab(job.image.tab === "characters" ? "characters" : "image");
        }
      } catch (err) {
        setStatus(`Edit failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      } finally {
        setIsEditImageGenerating(false);
      }
    })();
  }, [
    searchParams,
    projectKey,
    defaultLocation,
    setImages,
    setStatus,
    setIsEditImageGenerating,
    router,
    setActiveTab,
  ]);

  return null;
}
