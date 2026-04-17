"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { API_BASE } from "./config";
import {
  editImageNanobanana,
  normalizeImageUrl,
  resolveReferenceForEditApi,
} from "./client";
import { IMAGEGEN_EDIT_JOB_KEY, UIBUILDER_PENDING_BREAKDOWN_EXPORTS_RELOAD_KEY } from "./editKeys";
import { isGeminiImageConfirmCancelled } from "../lib/confirmGeminiImage";
import { clearEditDraft } from "./imagegenPanelSnapshot";
import type { GeneratedImage, ImageLocation, ImageTab } from "./types";

type GenerateActivity = { message: string; isError: boolean } | null;

type Props = {
  projectKey: string;
  defaultLocation: ImageLocation;
  imageModel: string;
  setImages: React.Dispatch<React.SetStateAction<GeneratedImage[]>>;
  setStatus: (s: string | null) => void;
  setIsEditImageGenerating: (v: boolean) => void;
  setGenerateActivity: Dispatch<SetStateAction<GenerateActivity>>;
  setActiveTab: (tab: ImageTab) => void;
};

export function RunEditImageEffect({
  projectKey,
  defaultLocation,
  imageModel,
  setImages,
  setStatus,
  setIsEditImageGenerating,
  setGenerateActivity,
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

    let job: {
      changes: string;
      image: GeneratedImage;
      returnTo?: string;
      width?: number;
      height?: number;
      model?: string;
    };
    try {
      job = JSON.parse(raw) as {
        changes: string;
        image: GeneratedImage;
        returnTo?: string;
        width?: number;
        height?: number;
        model?: string;
      };
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

    const editW =
      typeof job.width === "number" && Number.isFinite(job.width) && job.width > 0 ? Math.round(job.width) : 1024;
    const editH =
      typeof job.height === "number" && Number.isFinite(job.height) && job.height > 0 ? Math.round(job.height) : 1024;
    const editModel = job.model?.trim() || imageModel;

    setIsEditImageGenerating(true);
    setGenerateActivity({
      message: `Editing image (${editModel}) at ${editW}×${editH} — this may take a while…`,
      isError: false,
    });
    void (async () => {
      try {
        const results = await editImageNanobanana({
          changes: job.changes,
          reference,
          project_key: projectKey || undefined,
          width: editW,
          height: editH,
          model: editModel,
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
        clearEditDraft(job.image.id);
        setGenerateActivity({
          message: "Finished — edited image added to results.",
          isError: false,
        });
        setStatus("Image edited.");
        const safeReturn =
          returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "";
        if (
          job.image.nestedUiRelativePath?.trim() &&
          safeReturn.includes("/uiBuilder")
        ) {
          try {
            sessionStorage.setItem(UIBUILDER_PENDING_BREAKDOWN_EXPORTS_RELOAD_KEY, "1");
          } catch {
            /* ignore */
          }
        }
        if (safeReturn) {
          window.setTimeout(() => {
            router.replace(safeReturn);
          }, 120);
        } else {
          setActiveTab(job.image.tab === "characters" ? "characters" : "image");
        }
      } catch (err) {
        if (isGeminiImageConfirmCancelled(err)) {
          setGenerateActivity({ message: "Cancelled.", isError: false });
          setStatus(null);
        } else {
          const detail = err instanceof Error ? err.message : "Unknown error";
          setGenerateActivity({
            message: detail,
            isError: true,
          });
          setStatus(`Edit failed: ${detail}`);
        }
      } finally {
        setIsEditImageGenerating(false);
      }
    })();
  }, [
    searchParams,
    projectKey,
    defaultLocation,
    imageModel,
    setImages,
    setStatus,
    setIsEditImageGenerating,
    setGenerateActivity,
    router,
    setActiveTab,
  ]);

  return null;
}
