"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { fetchApi } from "../../../lib/api";
import { IMAGE_MODEL_OPTIONS } from "../../../lib/imageModels";
import { getLocalProjectPath, isLocalAgentContext, localAgent } from "../../../lib/localAgentClient";
import { IMAGEGEN_EDIT_CONTEXT_KEY, IMAGEGEN_EDIT_RETURN_KEY } from "../../../imageGen/editKeys";
import { capturePanelSnapshot } from "../../../imageGen/imagegenPanelSnapshot";
import type { GeneratedImage } from "../../../imageGen/types";
import { deleteProjectRelativeFile } from "../../../imageGen/client";
import { solitaireCardsResizeFolder, solitaireCardsTrimBordersFolder } from "../lib/cardFolderApi";
import {
  CARD_RANK_IDS,
  CARD_SUIT_IDS,
  buildCardImagePrompt,
  cardOutputFilename,
  flavorSlugFromDestinationRelativePath,
  rankLabel,
  suitLabel,
  tryParseCardOutputFilename,
} from "../lib/cardCatalog";

const DEFAULT_DEST_RELATIVE = "Assets/StreamingAssets/Solitaire/Cards";

const SOLITAIRE_CARDS_TOOL_STORAGE_KEY = "solitaireCardsTool.v1";

const SOLITAIRE_IMAGE_MODEL_OPTIONS = IMAGE_MODEL_OPTIONS.filter((option) =>
  option.value.startsWith("gpt-image")
);

type PersistedSolitaireCardsToolV1 = {
  v: 1;
  destRelative: string;
  imageModel: string;
  referencePathDisplay: string;
  referenceBase64: string;
  referenceMimeType?: string;
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function normalizeProjectRelativePath(input: string): string {
  return input.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

function relativeFolderFromPickedProject(projectRoot: string, pickedFolder: string): string | null {
  const rootNorm = projectRoot.replace(/[/\\]+$/, "").replace(/\\/g, "/");
  const pickNorm = pickedFolder.replace(/[/\\]+$/, "").replace(/\\/g, "/");
  const rootLower = rootNorm.toLowerCase();
  const pickLower = pickNorm.toLowerCase();
  if (pickLower === rootLower) {
    return "";
  }
  if (!pickLower.startsWith(rootLower + "/")) {
    return null;
  }
  return pickNorm.slice(rootNorm.length).replace(/^\/+/, "");
}

function joinRelativePath(dir: string, file: string): string {
  const base = normalizeProjectRelativePath(dir).replace(/\/+$/, "");
  const name = file.replace(/^\/+/, "");
  return base ? `${base}/${name}` : name;
}

/** Expected output basenames for checked ranks/suits and current destination folder flavor. */
function basenamesForSelectedCards(destRel: string, ranks: Record<string, boolean>, suits: Record<string, boolean>): string[] | null {
  const ranksOn: string[] = CARD_RANK_IDS.filter((id) => ranks[id]);
  const suitsOn: string[] = CARD_SUIT_IDS.filter((id) => suits[id]);
  if (ranksOn.length === 0 || suitsOn.length === 0) {
    return null;
  }
  const outDir: string = normalizeProjectRelativePath(destRel);
  if (!outDir) {
    return null;
  }
  const flavorSlug: string = flavorSlugFromDestinationRelativePath(outDir);
  const names: string[] = [];
  for (const suitId of suitsOn) {
    for (const rankId of ranksOn) {
      names.push(cardOutputFilename(flavorSlug, rankId, suitId));
    }
  }
  return names;
}

function isProbablyImageFilename(name: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name);
}

type DestFolderFilePreview = {
  key: string;
  filename: string;
  projectRelativePath: string;
  url: string | null;
  isImage: boolean;
  rankId: string | null;
  suitId: string | null;
  loadError?: boolean;
};

export function CardsToolPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [eligible, setEligible] = useState<boolean>(false);
  const [localAgentOk, setLocalAgentOk] = useState<boolean>(false);
  const [activeProjectKey, setActiveProjectKey] = useState<string>("");
  const [referencePathDisplay, setReferencePathDisplay] = useState<string>("");
  const [referenceBase64, setReferenceBase64] = useState<string | null>(null);
  const [referenceMimeType, setReferenceMimeType] = useState<string>("image/png");
  const [referenceObjectUrl, setReferenceObjectUrl] = useState<string | null>(null);
  const [selectedRanks, setSelectedRanks] = useState<Record<string, boolean>>({});
  const [selectedSuits, setSelectedSuits] = useState<Record<string, boolean>>({});
  const [destRelative, setDestRelative] = useState<string>(DEFAULT_DEST_RELATIVE);
  const [imageModel, setImageModel] = useState<string>("gpt-image-1.5");
  const [generating, setGenerating] = useState<boolean>(false);
  const [cardFolderBusy, setCardFolderBusy] = useState<"resize" | "trim" | null>(null);
  const [previewDeletingKey, setPreviewDeletingKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [destFolderPreviews, setDestFolderPreviews] = useState<DestFolderFilePreview[]>([]);
  const destPreviewUrlsRef = useRef<string[]>([]);
  const [settingsHydrated, setSettingsHydrated] = useState<boolean>(false);

  const appendLog = useCallback((line: string) => {
    const stamp = new Date().toISOString();
    setLogLines((prev) => {
      const next = [`[${stamp}] ${line}`, ...prev];
      return next.slice(0, 200);
    });
  }, []);

  const replaceDestPreviews = useCallback((next: DestFolderFilePreview[]) => {
    const nextUrls = new Set(
      next.map((item) => item.url).filter((u): u is string => typeof u === "string" && u.length > 0)
    );
    for (const url of destPreviewUrlsRef.current) {
      if (!nextUrls.has(url)) {
        URL.revokeObjectURL(url);
      }
    }
    destPreviewUrlsRef.current = [...nextUrls];
    setDestFolderPreviews(next);
  }, []);

  const fetchDestFolderFilePreviews = useCallback(async (): Promise<DestFolderFilePreview[]> => {
    const projectRoot: string | null = activeProjectKey ? getLocalProjectPath(activeProjectKey) : null;
    if (!eligible || !localAgentOk || !projectRoot) {
      return [];
    }
    const outDir: string = normalizeProjectRelativePath(destRelative);
    if (!outDir) {
      return [];
    }
    const blobUrlsCreated: string[] = [];
    try {
      await localAgent.approveProjectRoot(projectRoot);
      const listing = await localAgent.listDir(projectRoot, outDir);
      const names: string[] = listing.entries
        .filter((e) => e.is_file && !e.name.toLowerCase().endsWith(".meta"))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));
      const next: DestFolderFilePreview[] = [];
      for (const filename of names) {
        const relPath: string = joinRelativePath(outDir, filename);
        const parsed: { rankId: string; suitId: string } | null = tryParseCardOutputFilename(filename);
        if (!isProbablyImageFilename(filename)) {
          next.push({
            key: relPath,
            filename,
            projectRelativePath: relPath,
            url: null,
            isImage: false,
            rankId: null,
            suitId: null,
          });
          continue;
        }
        try {
          const blob: Blob = await localAgent.readBinary(projectRoot, relPath);
          const url: string = URL.createObjectURL(blob);
          blobUrlsCreated.push(url);
          next.push({
            key: relPath,
            filename,
            projectRelativePath: relPath,
            url,
            isImage: true,
            rankId: parsed?.rankId ?? null,
            suitId: parsed?.suitId ?? null,
          });
        } catch {
          next.push({
            key: relPath,
            filename,
            projectRelativePath: relPath,
            url: null,
            isImage: true,
            rankId: parsed?.rankId ?? null,
            suitId: parsed?.suitId ?? null,
            loadError: true,
          });
        }
      }
      return next;
    } catch {
      for (const u of blobUrlsCreated) {
        URL.revokeObjectURL(u);
      }
      return [];
    }
  }, [activeProjectKey, eligible, localAgentOk, destRelative]);

  useEffect(() => {
    setEligible(isLocalAgentContext());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const syncActiveProject = () => {
      setActiveProjectKey(window.localStorage.getItem("activeProjectKey") || "");
    };
    syncActiveProject();
    window.addEventListener("activeProjectChanged", syncActiveProject);
    return () => {
      window.removeEventListener("activeProjectChanged", syncActiveProject);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(SOLITAIRE_CARDS_TOOL_STORAGE_KEY);
      if (!raw) {
        setSettingsHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw) as Partial<PersistedSolitaireCardsToolV1>;
      if (parsed.v !== 1) {
        setSettingsHydrated(true);
        return;
      }
      if (typeof parsed.destRelative === "string" && parsed.destRelative.trim()) {
        setDestRelative(parsed.destRelative.trim());
      }
      if (typeof parsed.imageModel === "string" && parsed.imageModel.trim()) {
        const nextModel: string = parsed.imageModel.trim();
        if (SOLITAIRE_IMAGE_MODEL_OPTIONS.some((option) => option.value === nextModel)) {
          setImageModel(nextModel);
        }
      }
      if (typeof parsed.referencePathDisplay === "string") {
        setReferencePathDisplay(parsed.referencePathDisplay);
      }
      const b64: string | undefined =
        typeof parsed.referenceBase64 === "string" && parsed.referenceBase64.trim()
          ? parsed.referenceBase64.trim()
          : undefined;
      const mime: string =
        typeof parsed.referenceMimeType === "string" && parsed.referenceMimeType.trim().startsWith("image/")
          ? parsed.referenceMimeType.trim()
          : "image/png";
      if (b64) {
        setReferenceBase64(b64);
        setReferenceMimeType(mime);
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: mime });
        const url = URL.createObjectURL(blob);
        setReferenceObjectUrl((prev) => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return url;
        });
      }
    } catch {
      // ignore invalid storage
    }
    setSettingsHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !settingsHydrated) {
      return;
    }
    const payload: PersistedSolitaireCardsToolV1 = {
      v: 1,
      destRelative,
      imageModel,
      referencePathDisplay,
      referenceBase64: referenceBase64 ?? "",
      referenceMimeType: referenceMimeType || "image/png",
    };
    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem(SOLITAIRE_CARDS_TOOL_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        try {
          window.localStorage.setItem(
            SOLITAIRE_CARDS_TOOL_STORAGE_KEY,
            JSON.stringify({
              ...payload,
              referenceBase64: "",
              referenceMimeType: "image/png",
            } satisfies PersistedSolitaireCardsToolV1)
          );
        } catch {
          // ignore quota / private mode
        }
      }
    }, 400);
    return () => {
      window.clearTimeout(id);
    };
  }, [settingsHydrated, destRelative, imageModel, referencePathDisplay, referenceBase64, referenceMimeType]);

  useEffect(() => {
    if (!eligible) {
      return;
    }
    let cancelled = false;
    const ping = async () => {
      try {
        const ok = await localAgent.health();
        if (!cancelled) {
          setLocalAgentOk(ok);
        }
      } catch {
        if (!cancelled) {
          setLocalAgentOk(false);
        }
      }
    };
    void ping();
    const id = window.setInterval(() => void ping(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [eligible]);

  useEffect(() => {
    return () => {
      if (referenceObjectUrl) {
        URL.revokeObjectURL(referenceObjectUrl);
      }
    };
  }, [referenceObjectUrl]);

  useEffect(() => {
    return () => {
      for (const url of destPreviewUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      destPreviewUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        const previews = await fetchDestFolderFilePreviews();
        if (!active) {
          for (const p of previews) {
            if (p.url) {
              URL.revokeObjectURL(p.url);
            }
          }
          return;
        }
        replaceDestPreviews(previews);
      })();
    }, 400);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [fetchDestFolderFilePreviews, replaceDestPreviews]);

  const projectRoot = activeProjectKey ? getLocalProjectPath(activeProjectKey) : null;

  const handlePickReferenceClick = () => {
    fileInputRef.current?.click();
  };

  const handleReferenceFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const b64 = arrayBufferToBase64(buffer);
      setReferenceBase64(b64);
      const mime: string = file.type && file.type.startsWith("image/") ? file.type : "image/png";
      setReferenceMimeType(mime);
      setReferencePathDisplay(file.name);
      if (referenceObjectUrl) {
        URL.revokeObjectURL(referenceObjectUrl);
      }
      const blob = new Blob([buffer], { type: file.type || "image/png" });
      const url = URL.createObjectURL(blob);
      setReferenceObjectUrl(url);
      setStatus(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to read file.";
      setStatus(`Error: ${message}`);
    }
  };

  const toggleRank = (rankId: string) => {
    setSelectedRanks((prev) => ({ ...prev, [rankId]: !prev[rankId] }));
  };

  const toggleSuit = (suitId: string) => {
    setSelectedSuits((prev) => ({ ...prev, [suitId]: !prev[suitId] }));
  };

  const selectAllRanks = () => {
    const next: Record<string, boolean> = {};
    for (const id of CARD_RANK_IDS) {
      next[id] = true;
    }
    setSelectedRanks(next);
  };

  const clearRanks = () => {
    setSelectedRanks({});
  };

  const selectAllSuits = () => {
    const next: Record<string, boolean> = {};
    for (const id of CARD_SUIT_IDS) {
      next[id] = true;
    }
    setSelectedSuits(next);
  };

  const clearSuits = () => {
    setSelectedSuits({});
  };

  const handleBrowseDestination = async () => {
    if (!eligible) {
      setStatus("Local agent is not available on this host.");
      return;
    }
    if (!projectRoot) {
      setStatus("Set an active Studio project and map its local folder (Admin / project settings).");
      return;
    }
    try {
      const picked = await localAgent.pickDirectory();
      if (picked.cancelled || !picked.path) {
        return;
      }
      const rel = relativeFolderFromPickedProject(projectRoot, picked.path);
      if (rel === null) {
        setStatus("Pick a folder inside the active local project root.");
        return;
      }
      setDestRelative(rel);
      setStatus(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${message}`);
    }
  };

  const handleGenerate = async () => {
    setStatus(null);
    if (!eligible) {
      setStatus("Local agent is not enabled for this page host.");
      return;
    }
    if (!localAgentOk) {
      setStatus("Start the local agent on this machine (port 8765).");
      return;
    }
    if (!projectRoot) {
      setStatus("Missing local project path for the active Studio project.");
      return;
    }
    if (!referenceBase64) {
      setStatus("Pick a reference image file.");
      return;
    }
    const ranks = CARD_RANK_IDS.filter((id) => selectedRanks[id]);
    const suits = CARD_SUIT_IDS.filter((id) => selectedSuits[id]);
    if (ranks.length === 0 || suits.length === 0) {
      setStatus("Select at least one rank and one suit.");
      return;
    }
    const outDir = normalizeProjectRelativePath(destRelative);
    if (!outDir) {
      setStatus("Enter a destination folder relative to the project (e.g. Assets/StreamingAssets/Solitaire/Cards).");
      return;
    }

    setGenerating(true);
    try {
      const combinations: Array<{ rankId: string; suitId: string }> = [];
      for (const suitId of suits) {
        for (const rankId of ranks) {
          combinations.push({ rankId, suitId });
        }
      }
      const flavorSlug: string = flavorSlugFromDestinationRelativePath(outDir);
      appendLog(`Generating ${combinations.length} card(s) with model ${imageModel} (portrait 1024×1536), flavor "${flavorSlug}".`);
      for (let i = 0; i < combinations.length; i += 1) {
        const { rankId, suitId } = combinations[i];
        const filename = cardOutputFilename(flavorSlug, rankId, suitId);
        const prompt = buildCardImagePrompt(rankId, suitId);
        const relPath = joinRelativePath(outDir, filename);
        const res = await fetchApi("/tools/generate_image_bytes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            width: 1024,
            height: 1536,
            quality: "low",
            model: imageModel,
            project_key: activeProjectKey.trim() || null,
            reference_image_base64: referenceBase64,
          }),
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { detail?: string };
          const detail =
            typeof errBody.detail === "string"
              ? errBody.detail
              : typeof errBody.detail === "object" && errBody.detail !== null
                ? JSON.stringify(errBody.detail)
                : `HTTP ${res.status}`;
          throw new Error(`${filename}: ${detail}`);
        }
        const payload = (await res.json()) as { content_base64?: string };
        if (!payload.content_base64) {
          throw new Error(`${filename}: response missing image bytes.`);
        }
        await localAgent.writeBinary(projectRoot, relPath, payload.content_base64);
        appendLog(`Wrote ${relPath}`);
      }
      setStatus(`Done. Wrote ${combinations.length} file(s) under ${outDir}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${message}`);
      appendLog(`FAILED: ${message}`);
    } finally {
      setGenerating(false);
      try {
        const previews = await fetchDestFolderFilePreviews();
        replaceDestPreviews(previews);
      } catch {
        // ignore refresh errors
      }
    }
  };

  const handleEditDestPreview = useCallback(
    (preview: DestFolderFilePreview) => {
      if (typeof window === "undefined") {
        return;
      }
      if (!preview.url || !preview.isImage) {
        return;
      }
      if (!activeProjectKey.trim()) {
        setStatus("Set an active Studio project before editing (needed for the image API).");
        return;
      }
      capturePanelSnapshot({
        sizePreset: "portrait",
        qualityPreset: "high",
        imageDefaultsQuality: "high",
        imageModel,
        openAiQuality: "low",
        openAiStyle: "natural",
        openAiTransparent: false,
      });
      const prompt: string =
        preview.rankId && preview.suitId
          ? buildCardImagePrompt(preview.rankId, preview.suitId)
          : `Project image: ${preview.filename}`;
      const img: GeneratedImage = {
        id: `solitaire-${preview.key}`,
        url: preview.url,
        prompt,
        createdAt: new Date().toISOString(),
        tab: "image",
        projectRelativeImagePath: preview.projectRelativePath,
        editWidth: 1024,
        editHeight: 1536,
      };
      try {
        sessionStorage.setItem(IMAGEGEN_EDIT_RETURN_KEY, "/games/solitaire/pipelines/cards");
        sessionStorage.setItem(IMAGEGEN_EDIT_CONTEXT_KEY, JSON.stringify(img));
      } catch {
        setStatus("Error: could not store edit context.");
        return;
      }
      router.push("/imageGen/edit");
    },
    [activeProjectKey, imageModel, router],
  );

  const handleDeleteDestPreview = useCallback(
    async (preview: DestFolderFilePreview) => {
      if (typeof window === "undefined") {
        return;
      }
      if (!activeProjectKey.trim()) {
        setStatus("Set an active Studio project before deleting (API needs project_key).");
        return;
      }
      if (!window.confirm(`Delete "${preview.filename}" from the project? This cannot be undone.`)) {
        return;
      }
      setPreviewDeletingKey(preview.key);
      setStatus(null);
      try {
        await deleteProjectRelativeFile(activeProjectKey.trim(), preview.projectRelativePath);
        appendLog(`Deleted ${preview.projectRelativePath}`);
        const previews = await fetchDestFolderFilePreviews();
        replaceDestPreviews(previews);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus(`Error: ${message}`);
      } finally {
        setPreviewDeletingKey(null);
      }
    },
    [activeProjectKey, appendLog, fetchDestFolderFilePreviews, replaceDestPreviews],
  );

  const handleResizeCardsFolder = useCallback(async () => {
    if (!activeProjectKey.trim()) {
      setStatus("Set an active Studio project first.");
      return;
    }
    const folder: string = normalizeProjectRelativePath(destRelative);
    if (!folder) {
      setStatus("Enter a destination folder.");
      return;
    }
    const selectedNames: string[] | null = basenamesForSelectedCards(destRelative, selectedRanks, selectedSuits);
    if (!selectedNames) {
      setStatus("Select at least one rank and one suit (batch uses the same selection as Generate).");
      return;
    }
    setCardFolderBusy("resize");
    setStatus(null);
    try {
      const out = await solitaireCardsResizeFolder(activeProjectKey.trim(), folder, selectedNames);
      const missing: string[] = out.missing_filenames ?? [];
      const missHint: string =
        missing.length > 0
          ? ` ${missing.length} selected file(s) not found in folder (check flavor / path).`
          : "";
      const errHint: string =
        out.errors.length > 0
          ? ` ${out.errors.length} error(s); see Log.`
          : "";
      setStatus(
        `Resize: ${out.processed.length} of ${selectedNames.length} selected file(s) → ${out.target_width ?? 512}px wide.` +
          (out.skipped.length ? ` Skipped ${out.skipped.length} (already 512px).` : "") +
          missHint +
          errHint,
      );
      if (missing.length > 0) {
        appendLog(`Resize: not in folder: ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? " …" : ""}`);
      }
      for (const e of out.errors.slice(0, 8)) {
        appendLog(`Resize failed: ${e.filename}: ${e.error}`);
      }
      if (out.errors.length > 8) {
        appendLog(`Resize: …and ${out.errors.length - 8} more error(s).`);
      }
      appendLog(
        `Resize cards (selected): processed ${out.processed.length}, skipped ${out.skipped.length}, errors ${out.errors.length}, missing ${missing.length}.`,
      );
      const previews = await fetchDestFolderFilePreviews();
      replaceDestPreviews(previews);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${message}`);
    } finally {
      setCardFolderBusy(null);
    }
  }, [activeProjectKey, appendLog, destRelative, fetchDestFolderFilePreviews, replaceDestPreviews, selectedRanks, selectedSuits]);

  const handleFixTransparencyFolder = useCallback(async () => {
    if (!activeProjectKey.trim()) {
      setStatus("Set an active Studio project first.");
      return;
    }
    const folder: string = normalizeProjectRelativePath(destRelative);
    if (!folder) {
      setStatus("Enter a destination folder.");
      return;
    }
    const selectedNames: string[] | null = basenamesForSelectedCards(destRelative, selectedRanks, selectedSuits);
    if (!selectedNames) {
      setStatus("Select at least one rank and one suit (batch uses the same selection as Generate).");
      return;
    }
    setCardFolderBusy("trim");
    setStatus(null);
    try {
      const out = await solitaireCardsTrimBordersFolder(activeProjectKey.trim(), folder, selectedNames);
      const missing: string[] = out.missing_filenames ?? [];
      const missHint: string =
        missing.length > 0
          ? ` ${missing.length} selected file(s) not found in folder (check flavor / path).`
          : "";
      const errHint: string =
        out.errors.length > 0
          ? ` ${out.errors.length} error(s); see Log.`
          : "";
      setStatus(
        `Fix transparency: updated ${out.processed.length} of ${selectedNames.length} selected file(s) (border → transparent).` +
          (out.skipped.length ? ` ${out.skipped.length} unchanged (border already transparent or none).` : "") +
          missHint +
          errHint,
      );
      if (missing.length > 0) {
        appendLog(`Fix transparency: not in folder: ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? " …" : ""}`);
      }
      for (const e of out.errors.slice(0, 8)) {
        appendLog(`Fix transparency failed: ${e.filename}: ${e.error}`);
      }
      if (out.errors.length > 8) {
        appendLog(`Fix transparency: …and ${out.errors.length - 8} more error(s).`);
      }
      appendLog(
        `Fix transparency (selected): processed ${out.processed.length}, skipped ${out.skipped.length}, errors ${out.errors.length}, missing ${missing.length}.`,
      );
      const previews = await fetchDestFolderFilePreviews();
      replaceDestPreviews(previews);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${message}`);
    } finally {
      setCardFolderBusy(null);
    }
  }, [activeProjectKey, appendLog, destRelative, fetchDestFolderFilePreviews, replaceDestPreviews, selectedRanks, selectedSuits]);

  return (
    <main>
      <div
        className="imagegen-shell"
        style={{ maxWidth: "calc(100vw - 24px)", marginLeft: "auto", marginRight: "auto" }}
      >
        <div className="imagegen-left">
          <div className="imagegen-panel">
            <h2 className="imagegen-panel-title">Cards</h2>
            <div className="imagegen-panel-body">
              {!eligible && (
                <p style={{ margin: 0, color: "#fbbf24", fontSize: 13 }}>
                  Local agent is only available on localhost (or hosts listed in NEXT_PUBLIC_LOCAL_AGENT_PAGE_HOSTS).
                </p>
              )}
              {eligible && !localAgentOk && (
                <p style={{ margin: 0, color: "#fca5a5", fontSize: 13 }}>
                  Local agent offline — start it (e.g. local_agent/run.bat).
                </p>
              )}
              <div style={{ fontSize: 12, color: "#9aa3b2" }}>Active project: {activeProjectKey || "—"}</div>

              <div>
                <div className="imagegen-label">Reference image</div>
                <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
                  <input
                    readOnly
                    className="imagegen-input-number"
                    value={referencePathDisplay}
                    placeholder="No file selected"
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <button type="button" className="imagegen-import-button" onClick={handlePickReferenceClick}>
                    Pick file
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="imagegen-hidden-file-input"
                  aria-hidden
                  onChange={(e) => void handleReferenceFileChange(e)}
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span className="imagegen-label" style={{ marginBottom: 0 }}>
                    Ranks
                  </span>
                  <span style={{ display: "flex", gap: "6px" }}>
                    <button type="button" className="sidebar-tab" onClick={selectAllRanks}>
                      All
                    </button>
                    <button type="button" className="sidebar-tab" onClick={clearRanks}>
                      Clear
                    </button>
                  </span>
                </div>
                <div
                  style={{
                    border: "1px solid #2a2f3a",
                    borderRadius: 8,
                    background: "#0f1115",
                    maxHeight: 180,
                    overflow: "auto",
                    padding: "8px 10px",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  {CARD_RANK_IDS.map((rankId) => (
                    <label
                      key={rankId}
                      style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "#e6e6e6", fontSize: 13 }}
                    >
                      <input type="checkbox" checked={Boolean(selectedRanks[rankId])} onChange={() => toggleRank(rankId)} />
                      <span>{rankLabel(rankId)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span className="imagegen-label" style={{ marginBottom: 0 }}>
                    Suits
                  </span>
                  <span style={{ display: "flex", gap: "6px" }}>
                    <button type="button" className="sidebar-tab" onClick={selectAllSuits}>
                      All
                    </button>
                    <button type="button" className="sidebar-tab" onClick={clearSuits}>
                      Clear
                    </button>
                  </span>
                </div>
                <div
                  style={{
                    border: "1px solid #2a2f3a",
                    borderRadius: 8,
                    background: "#0f1115",
                    maxHeight: 140,
                    overflow: "auto",
                    padding: "8px 10px",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  {CARD_SUIT_IDS.map((suitId) => (
                    <label
                      key={suitId}
                      style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "#e6e6e6", fontSize: 13 }}
                    >
                      <input type="checkbox" checked={Boolean(selectedSuits[suitId])} onChange={() => toggleSuit(suitId)} />
                      <span>{suitLabel(suitId)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="imagegen-label" htmlFor="solitaire-cards-model">
                  Image model
                </label>
                <select
                  id="solitaire-cards-model"
                  className="imagegen-select"
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                >
                  {SOLITAIRE_IMAGE_MODEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="imagegen-label">Destination folder (relative to project)</div>
                <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
                  <input
                    className="imagegen-input-number"
                    style={{ flex: 1, minWidth: 0 }}
                    value={destRelative}
                    onChange={(e) => setDestRelative(e.target.value)}
                    placeholder={DEFAULT_DEST_RELATIVE}
                  />
                  <button type="button" className="imagegen-import-button" onClick={() => void handleBrowseDestination()}>
                    Browse
                  </button>
                </div>
              </div>

              <div>
                <div className="imagegen-label">Batch on selected cards</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    type="button"
                    className="imagegen-import-button"
                    onClick={() => void handleResizeCardsFolder()}
                    disabled={generating || cardFolderBusy !== null}
                  >
                    {cardFolderBusy === "resize" ? "Resizing…" : "Resize Cards"}
                  </button>
                  <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.35 }}>
                    Only files matching checked ranks/suits and the current folder flavor (same names as Generate). Scales each to{" "}
                    <span style={{ color: "#94a3b8" }}>512px</span> wide on the API project path.
                  </div>
                  <button
                    type="button"
                    className="imagegen-import-button"
                    onClick={() => void handleFixTransparencyFolder()}
                    disabled={generating || cardFolderBusy !== null}
                  >
                    {cardFolderBusy === "trim" ? "Applying…" : "Fix Transparency"}
                  </button>
                  <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.35 }}>
                    Same selection: corner-connected <span style={{ color: "#94a3b8" }}>near-white</span> border becomes transparent (image size unchanged; interior white kept).
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="imagegen-generate-button"
                onClick={() => void handleGenerate()}
                disabled={generating || cardFolderBusy !== null}
              >
                {generating ? "Generating…" : "Generate"}
              </button>

              {status && (
                <p
                  className="status"
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: status.startsWith("Error") ? "#f87171" : "#94a3b8",
                  }}
                >
                  {status}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="imagegen-right">
          <div className="imagegen-panel" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div className="imagegen-results-header">
              <h2 className="imagegen-panel-title">Preview</h2>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                Files in <span style={{ color: "#94a3b8" }}>{destRelative.trim() || "—"}</span>
              </div>
            </div>
            <div className="imagegen-panel-body" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              <div
                className="imagegen-grid"
                style={{ paddingTop: 0, gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}
              >
                <div className="imagegen-card">
                  <div style={{ padding: "8px 10px", fontSize: 12, color: "#9aa3b2", borderBottom: "1px solid #222836" }}>
                    Reference
                  </div>
                  <div className="imagegen-card-image-wrap">
                    {referenceObjectUrl ? (
                      <img src={referenceObjectUrl} alt="Reference" className="imagegen-card-image" />
                    ) : (
                      <div style={{ fontSize: 12, color: "#9aa3b2", padding: "8px 0", textAlign: "center" }}>None</div>
                    )}
                  </div>
                </div>
                {destFolderPreviews.map((item) => (
                  <div key={item.key} className="imagegen-card">
                    <div className="imagegen-card-meta" style={{ fontSize: 11, wordBreak: "break-all" }}>
                      {item.filename}
                    </div>
                    <div className="imagegen-card-image-wrap">
                      {item.url ? (
                        <img src={item.url} alt={item.filename} className="imagegen-card-image" />
                      ) : item.loadError ? (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#f87171",
                            padding: "12px 8px",
                            textAlign: "center",
                          }}
                        >
                          Could not load preview
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#9aa3b2",
                            padding: "16px 10px",
                            textAlign: "center",
                            wordBreak: "break-all",
                          }}
                        >
                          {item.isImage ? "Loading failed" : "Non-image file"}
                        </div>
                      )}
                    </div>
                    <div
                      className="imagegen-card-actions"
                      style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 8 }}
                    >
                      {item.url && item.isImage ? (
                        <button
                          type="button"
                          className="imagegen-action-button"
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "none",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          onClick={() => handleEditDestPreview(item)}
                        >
                          Edit
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="imagegen-action-button"
                        disabled={previewDeletingKey === item.key}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "none",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: previewDeletingKey === item.key ? "not-allowed" : "pointer",
                          background: "#3f1515",
                          color: "#fecaca",
                        }}
                        onClick={() => void handleDeleteDestPreview(item)}
                      >
                        {previewDeletingKey === item.key ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: 4,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #2a2f3a",
                  background: "#0f1115",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#94a3b8",
                    marginBottom: 8,
                  }}
                >
                  Log
                </div>
                <pre
                  style={{
                    margin: 0,
                    maxHeight: 220,
                    overflow: "auto",
                    fontSize: 11,
                    lineHeight: 1.45,
                    color: "#e2e8f0",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {logLines.length === 0 ? "—" : logLines.join("\n")}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
