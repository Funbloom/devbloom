"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { API_BASE, STORAGE_KEY_PROJECT } from "../imageGen/config";
import {
  editImageNanobanana,
  generateUiCanvasPolish,
  getImageGenerated,
  getStyles,
  importImageFile,
  deleteUiCanvasExportFolder,
  deleteUiCanvasNestedImage,
  listUiCanvasNestedImages,
  normalizeImageUrl,
  parseNestedUiRelFromUrl,
  putImageGenerated,
  removeBackground,
  resolveReferenceForEditApi,
  uploadImageToCloud,
} from "../imageGen/client";
import { readImagegenMainStyleId, writeImagegenMainStyleId } from "../lib/imagegenMainStyle";
import { IMAGEGEN_DEFAULT_IMAGE_MODEL, IMAGE_MODEL_OPTIONS } from "../lib/imageModels";
import { capturePanelSnapshot } from "../imageGen/imagegenPanelSnapshot";
import type { Style } from "../storyboard/types";
import {
  IMAGEGEN_EDIT_CONTEXT_KEY,
  IMAGEGEN_EDIT_JOB_KEY,
  IMAGEGEN_EDIT_RETURN_KEY,
  UIBUILDER_PENDING_BREAKDOWN_EXPORTS_RELOAD_KEY,
} from "../imageGen/editKeys";
import { clearEditDraft } from "../imageGen/imagegenPanelSnapshot";
import { parseStoredImages, toPayload } from "../imageGen/persistence";
import { ImagegenTooltip } from "../imageGen/ImagegenTooltip";
import { ResultsPanel } from "../imageGen/ResultsPanel";
import type { GeneratedImage, ImageLocation } from "../imageGen/types";
import type { DrawTool } from "./penPalette";
import { UI_PEN_TASKS } from "./penPalette";
import { SketchCanvas, type SketchCanvasHandle } from "./SketchCanvas";
import { BreakdownExportsSection } from "./BreakdownExportsSection";
import { BreakdownPanel, defaultExportFolder, type BreakdownActivityUpdate } from "./BreakdownPanel";
import {
  getLocalProjectPath,
  isLocalAgentContext,
  joinLocalProjectSubpath,
  localAgent,
} from "../lib/localAgentClient";
import { maxUiStyleReferenceImages } from "./uicanvasPrompt";

type BuilderTab = "generate" | "draw" | "breakdown";

const UIBUILDER_IMAGE_MODEL_STORAGE_KEY = "uibuilder_image_model";
const UIBUILDER_LAYOUT_FIDELITY_STORAGE_KEY = "uibuilder_layout_fidelity";
const UIBUILDER_TRANSPARENT_BG_STORAGE_KEY = "uibuilder_transparent_bg";
const UIBUILDER_DRAW_ORIENTATION_STORAGE_KEY = "uibuilder_draw_orientation";
/** Per-project list of Images/ filenames for style-only references (max 3). */
const UIBUILDER_STYLE_REFS_STORAGE_PREFIX = "uibuilder_style_ref_filenames:";
const MAX_STYLE_REFS = maxUiStyleReferenceImages();

const TIP_UIBUILDER_WORKFLOW =
  "The preview lists drawings only until you select one (then that sketch and its polish results). Use Show all to list every UI Canvas image. Click drawing thumbnails to choose sketch(es) for Generate polished UI. Optionally add style references. Then set Style, model, fidelity, and generate.";

const TIP_STYLE_REF_IMAGES =
  "Use for palette, typography, and surface style — not layout or subject matter. Shown to the model after your wireframe sketch.";

const TIP_STYLE_BANK = "Same style bank as Image Gen. Pick a saved look for the polish, or (No style).";

const TIP_IMAGE_MODEL = "Which model generates the polished image. Saved in this browser for UI Builder.";

const TIP_LAYOUT_FIDELITY =
  "100 = match wireframe placement closely (still polished; style refs inform look only). 0 = same elements and copy, creative layout. Saved in the browser.";

const TIP_TRANSPARENT_BG =
  "For OpenAI GPT Image models, the API can output a transparent background. Other providers ignore this flag; the polish prompt still requests transparency where appropriate. Saved in the browser.";

const TIP_EXTRA_POLISH =
  "Optional text appended to the server-built polish prompt. Examples: dark theme, high contrast, large tap targets.";

const TIP_DRAW_PENS =
  "Label box: drag a rectangle. Text: click to place literal copy. Paste: copy an image, then Ctrl+V (⌘V) on the page.";
const TIP_DRAW_ORIENTATION =
  "Sets the sketch canvas aspect ratio and output PNG orientation used for polish generation.";

const TIP_SHOW_ALL =
  "Off: Only saved drawings are listed until you select one; then you see that sketch and its polished outputs. On: Every UI Canvas image is listed.";

function readPersistedStyleRefFilenames(projectKey: string): string[] {
  if (typeof window === "undefined" || !projectKey.trim()) return [];
  try {
    const raw = window.localStorage.getItem(`${UIBUILDER_STYLE_REFS_STORAGE_PREFIX}${projectKey.trim()}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim())
      .slice(0, MAX_STYLE_REFS);
  } catch {
    return [];
  }
}

function writePersistedStyleRefFilenames(projectKey: string, filenames: string[]) {
  if (typeof window === "undefined" || !projectKey.trim()) return;
  try {
    window.localStorage.setItem(
      `${UIBUILDER_STYLE_REFS_STORAGE_PREFIX}${projectKey.trim()}`,
      JSON.stringify(filenames.slice(0, MAX_STYLE_REFS)),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

const BG_DEFAULTS = {
  model: "isnet-general-use" as const,
  alphaMatting: false,
  fgThreshold: 240,
  bgThreshold: 10,
};

/** sessionStorage: per active project, Breakdown source image + optional strip (no-text) filename. */
const UIBUILDER_BREAKDOWN_BY_PROJECT_KEY = "uibuilder_breakdown_by_project";

type UIBreakdownPersist = {
  sourceImage?: GeneratedImage;
  workingFilename?: string | null;
  /** Top-level folder under Gen/Images/UI — scope Breakdown exports list; kept even when source is cleared. */
  exportFolderName?: string | null;
};

/** Parse `Gen/Images/UI/MyFolder` or disk path → `MyFolder`. */
function parseGenImagesUiSubfolder(relativePath: string): string | null {
  const r = relativePath.replace(/\\/g, "/").trim();
  const m = r.match(/Gen\/Images\/UI\/([^/]+)/i);
  return m?.[1]?.trim() || null;
}

/** `folder/file.png` → `folder`; root-only path → null. */
function folderFromNestedUiPath(nested: string | undefined | null): string | null {
  const t = nested?.replace(/\\/g, "/").trim();
  if (!t || !t.includes("/")) return null;
  return t.split("/")[0]?.trim() || null;
}

function readBreakdownForProject(projectKey: string): UIBreakdownPersist | null {
  if (typeof window === "undefined" || !projectKey.trim()) return null;
  try {
    const raw = sessionStorage.getItem(UIBUILDER_BREAKDOWN_BY_PROJECT_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw) as Record<string, UIBreakdownPersist>;
    return all[projectKey.trim()] ?? null;
  } catch {
    return null;
  }
}

function writeBreakdownForProject(projectKey: string, data: UIBreakdownPersist | null) {
  if (typeof window === "undefined" || !projectKey.trim()) return;
  try {
    const raw = sessionStorage.getItem(UIBUILDER_BREAKDOWN_BY_PROJECT_KEY);
    const all = (raw ? JSON.parse(raw) : {}) as Record<string, UIBreakdownPersist>;
    const pk = projectKey.trim();
    if (data) all[pk] = data;
    else delete all[pk];
    sessionStorage.setItem(UIBUILDER_BREAKDOWN_BY_PROJECT_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/**
 * UI Builder — studio tool (all projects). Layout mirrors Image Gen: fixed-width left panel + flexible right panel.
 */
export default function UIBuilderPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<BuilderTab>("generate");
  /** Image selected for Breakdown tab (from gallery). */
  const [breakdownImage, setBreakdownImage] = useState<GeneratedImage | null>(null);
  /** Shown in the Activity box under “Breakdown” (Detect / Remove text / Process). */
  const [breakdownActivity, setBreakdownActivity] = useState<BreakdownActivityUpdate>(null);
  /** True while any of the three Breakdown operations is in flight (drives progress UI). */
  const [breakdownWorking, setBreakdownWorking] = useState(false);
  /** Images under Gen/Images/UI/... (from API list; breakdown exports). */
  const [breakdownExportImages, setBreakdownExportImages] = useState<GeneratedImage[]>([]);
  /** Strip / “no text” working file under Images/ (Remove text); persisted with breakdown source. */
  const [breakdownWorkingFilename, setBreakdownWorkingFilename] = useState<string | null>(null);
  /** Scope Breakdown exports to this folder under Gen/Images/UI (from Process or nested source). */
  const [breakdownExportFolderName, setBreakdownExportFolderName] = useState<string | null>(null);
  const [breakdownExportDeleteAllBusy, setBreakdownExportDeleteAllBusy] = useState(false);

  const [projectKey, setProjectKey] = useState("");

  /** Restore Breakdown source + strip file before paint so session persist effect doesn’t clear storage. */
  useLayoutEffect(() => {
    const pk = projectKey.trim();
    if (!pk) return;
    const saved = readBreakdownForProject(pk);
    if (saved?.sourceImage?.id) {
      setBreakdownImage(saved.sourceImage);
      setBreakdownWorkingFilename(saved.workingFilename ?? null);
      setBreakdownExportFolderName(
        saved.exportFolderName ??
          folderFromNestedUiPath(
            saved.sourceImage.nestedUiRelativePath ??
              parseNestedUiRelFromUrl(saved.sourceImage.url) ??
              undefined,
          ),
      );
    } else {
      setBreakdownImage(null);
      setBreakdownWorkingFilename(null);
      setBreakdownExportFolderName(saved?.exportFolderName?.trim() ?? null);
    }
  }, [projectKey]);

  useEffect(() => {
    const pk = projectKey.trim();
    if (!pk) return;
    if (breakdownImage) {
      writeBreakdownForProject(pk, {
        sourceImage: breakdownImage,
        workingFilename: breakdownWorkingFilename,
        exportFolderName: breakdownExportFolderName,
      });
    } else if (breakdownExportFolderName?.trim()) {
      writeBreakdownForProject(pk, {
        exportFolderName: breakdownExportFolderName,
        workingFilename: null,
      });
    } else {
      writeBreakdownForProject(pk, null);
    }
  }, [projectKey, breakdownImage, breakdownWorkingFilename, breakdownExportFolderName]);

  /**
   * After Process, remember export folder when the source is not under a Gen/Images/UI subfolder
   * (otherwise the list/path follow the source image directory).
   */
  useEffect(() => {
    const fr = breakdownActivity?.folderReveal;
    if (fr && !breakdownActivity?.isError) {
      const folder = parseGenImagesUiSubfolder(fr.relativePath);
      if (!folder) return;
      const nestedRel =
        breakdownImage?.nestedUiRelativePath?.trim() ||
        parseNestedUiRelFromUrl(breakdownImage?.url || "");
      if (folderFromNestedUiPath(nestedRel)) return;
      setBreakdownExportFolderName(folder);
    }
  }, [breakdownActivity, breakdownImage]);

  /** Seed or reset export folder when the breakdown source changes (keep session/restored folder on first bind only). */
  const prevBreakdownImageIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = breakdownImage?.id ?? null;
    if (!id) {
      prevBreakdownImageIdRef.current = null;
      return;
    }
    const prev = prevBreakdownImageIdRef.current;
    prevBreakdownImageIdRef.current = id;
    if (prev === null) {
      setBreakdownExportFolderName((f) => (f?.trim() ? f : defaultExportFolder(breakdownImage)));
      return;
    }
    if (prev !== id) {
      setBreakdownExportFolderName(defaultExportFolder(breakdownImage));
    }
  }, [breakdownImage]);

  /** Default export folder when opening the Breakdown tab (or first paint on that tab) if still empty. */
  const prevTabForExportFolderRef = useRef<BuilderTab | null>(null);
  useEffect(() => {
    const prev = prevTabForExportFolderRef.current;
    prevTabForExportFolderRef.current = tab;
    if (tab !== "breakdown" || !breakdownImage) return;
    const enteredFromOtherTab = prev !== null && prev !== "breakdown";
    const firstMountOnBreakdown = prev === null && tab === "breakdown";
    if (!enteredFromOtherTab && !firstMountOnBreakdown) return;
    setBreakdownExportFolderName((f) => (f?.trim() ? f : defaultExportFolder(breakdownImage)));
  }, [tab, breakdownImage]);

  /** After Image Gen edit (Nano Banana), return URL can be `/uiBuilder?tab=breakdown` — apply once then strip query. */
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "breakdown" || t === "draw" || t === "generate") {
      setTab(t);
      router.replace(pathname, { scroll: false });
    }
  }, [searchParams, pathname, router]);


  const [brushSize, setBrushSize] = useState(4);
  const [tool, setTool] = useState<DrawTool>("background");
  const [drawOrientation, setDrawOrientation] = useState<"landscape" | "portrait">("landscape");
  const [drawingName, setDrawingName] = useState("");
  const sketchRef = useRef<SketchCanvasHandle>(null);

  const [isPrivate, setIsPrivate] = useState(false);
  const [uiCanvasImages, setUiCanvasImages] = useState<GeneratedImage[]>([]);
  const [imagesPerRow, setImagesPerRow] = useState(3);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generatingPolish, setGeneratingPolish] = useState(false);
  const [editingUiCanvas, setEditingUiCanvas] = useState(false);
  const [selectedSketchIds, setSelectedSketchIds] = useState<string[]>([]);
  const [extraPolishPrompt, setExtraPolishPrompt] = useState("");
  /** 0 = creative layout; 100 = match sketch placement closely. */
  const [layoutFidelity, setLayoutFidelity] = useState(75);
  /** Same option as Image Gen: OpenAI GPT Image API alpha; default off to match Image Gen. */
  const [uiCanvasTransparentBg, setUiCanvasTransparentBg] = useState(() => {
    if (typeof window === "undefined") return false;
    const raw = window.localStorage.getItem(UIBUILDER_TRANSPARENT_BG_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return false;
  });
  /** When false (default), gallery shows only drawings until one is selected, then that sketch + its polishes. When true, show every UI Canvas image. */
  const [showAllUiCanvas, setShowAllUiCanvas] = useState(false);
  /** Filenames in project Images/ — used only for visual style (max MAX_STYLE_REFS), passed after the wireframe ref. */
  const [styleReferenceFilenames, setStyleReferenceFilenames] = useState<string[]>([]);
  const [styleRefUploadError, setStyleRefUploadError] = useState<string | null>(null);
  const [uploadingStyleRefs, setUploadingStyleRefs] = useState(false);
  const styleRefFileInputRef = useRef<HTMLInputElement>(null);
  /** When set, Save overwrites this file and updates the same gallery entry. */
  const [sketchEditTarget, setSketchEditTarget] = useState<{
    id: string;
    filename: string;
    location: ImageLocation;
  } | null>(null);
  const [pendingSketchRestore, setPendingSketchRestore] = useState<{ url: string } | null>(null);
  /** Skip one persist write right after hydrating style refs from localStorage (avoids wiping with []). */
  const skipNextStyleRefPersist = useRef(false);

  /** True after the user edits the sketch (strokes, paste, text) until save, clear, or successful load. */
  const [sketchDirty, setSketchDirty] = useState(false);
  const markSketchDirty = useCallback(() => setSketchDirty(true), []);

  const handleRevealBreakdownFolder = useCallback(async () => {
    const fr = breakdownActivity?.folderReveal;
    if (!fr || breakdownActivity?.isError) return;
    if (!isLocalAgentContext()) return;
    try {
      await localAgent.approveProjectRoot(fr.projectRoot);
      await localAgent.revealFolder(fr.projectRoot, fr.relativePath);
    } catch {
      // Path is still visible for manual open
    }
  }, [breakdownActivity?.folderReveal, breakdownActivity?.isError]);

  const applyBuilderTab = useCallback(
    (next: BuilderTab) => {
      if (tab === "draw" && next === "generate" && sketchEditTarget) {
        setSketchEditTarget(null);
        setPendingSketchRestore(null);
      }
      setTab(next);
    },
    [tab, sketchEditTarget],
  );

  const [styles, setStyles] = useState<Style[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string>("__none");
  const [imageModel, setImageModel] = useState(IMAGEGEN_DEFAULT_IMAGE_MODEL);
  const imageTabStylePrefHydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getStyles().then((data) => {
      if (!cancelled) setStyles(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (styles.length === 0) return;
    if (!imageTabStylePrefHydrated.current) {
      imageTabStylePrefHydrated.current = true;
      const saved = readImagegenMainStyleId();
      if (saved && styles.some((s) => s.id === saved)) {
        setSelectedStyleId(saved);
        return;
      }
    }
    writeImagegenMainStyleId(selectedStyleId);
  }, [styles, selectedStyleId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(UIBUILDER_IMAGE_MODEL_STORAGE_KEY)?.trim();
    if (raw && IMAGE_MODEL_OPTIONS.some((o) => o.value === raw)) {
      setImageModel(raw);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(UIBUILDER_LAYOUT_FIDELITY_STORAGE_KEY);
    if (raw == null) return;
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 0 && n <= 100) setLayoutFidelity(n);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(UIBUILDER_DRAW_ORIENTATION_STORAGE_KEY);
    if (raw === "portrait" || raw === "landscape") {
      setDrawOrientation(raw);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(UIBUILDER_LAYOUT_FIDELITY_STORAGE_KEY, String(layoutFidelity));
  }, [layoutFidelity]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(UIBUILDER_TRANSPARENT_BG_STORAGE_KEY, String(uiCanvasTransparentBg));
  }, [uiCanvasTransparentBg]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(UIBUILDER_IMAGE_MODEL_STORAGE_KEY, imageModel);
  }, [imageModel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(UIBUILDER_DRAW_ORIENTATION_STORAGE_KEY, drawOrientation);
  }, [drawOrientation]);

  useEffect(() => {
    const key = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY_PROJECT) : null;
    setProjectKey(key?.trim() ?? "");
  }, []);

  useEffect(() => {
    skipNextStyleRefPersist.current = true;
    setStyleReferenceFilenames(readPersistedStyleRefFilenames(projectKey));
    setStyleRefUploadError(null);
  }, [projectKey]);

  useEffect(() => {
    if (!projectKey.trim()) return;
    if (skipNextStyleRefPersist.current) {
      skipNextStyleRefPersist.current = false;
      return;
    }
    writePersistedStyleRefFilenames(projectKey, styleReferenceFilenames);
  }, [projectKey, styleReferenceFilenames]);

  useEffect(() => {
    const onProject = () => {
      const key = window.localStorage.getItem(STORAGE_KEY_PROJECT)?.trim() ?? "";
      setProjectKey(key);
    };
    window.addEventListener("activeProjectChanged", onProject);
    window.addEventListener("storage", onProject);
    return () => {
      window.removeEventListener("activeProjectChanged", onProject);
      window.removeEventListener("storage", onProject);
    };
  }, []);

  const reloadUiCanvasImages = useCallback(async () => {
    if (!projectKey) {
      setUiCanvasImages([]);
      return;
    }
    try {
      const { images: raw } = await getImageGenerated(projectKey, { private: isPrivate });
      const all = parseStoredImages(raw);
      setUiCanvasImages(all.filter((img) => img.tab === "ui_canvas"));
    } catch {
      setUiCanvasImages([]);
    }
  }, [projectKey, isPrivate]);

  useEffect(() => {
    void reloadUiCanvasImages();
  }, [reloadUiCanvasImages, pathname]);

  /** Prefer gallery row for the breakdown source so nested path/url match persisted JSON after parseStoredImages. */
  const resolvedBreakdownSource = useMemo(() => {
    if (!breakdownImage?.id) return breakdownImage;
    const match = uiCanvasImages.find((img) => img.id === breakdownImage.id);
    return match ?? breakdownImage;
  }, [breakdownImage, uiCanvasImages]);

  /** Folder for Breakdown exports list + path: source UI subfolder if any, else Process/persisted folder (survives without source). */
  const effectiveBreakdownExportFolder = useMemo(() => {
    if (resolvedBreakdownSource) {
      const nestedRel =
        resolvedBreakdownSource.nestedUiRelativePath?.trim() ||
        parseNestedUiRelFromUrl(resolvedBreakdownSource.url || "");
      const fromSource = folderFromNestedUiPath(nestedRel);
      if (fromSource) return fromSource;
    }
    return breakdownExportFolderName?.trim() || null;
  }, [resolvedBreakdownSource, breakdownExportFolderName]);

  const reloadBreakdownExports = useCallback(async () => {
    const pk = projectKey.trim();
    if (!pk) {
      setBreakdownExportImages([]);
      return;
    }
    const sub = effectiveBreakdownExportFolder?.trim();
    if (!sub) {
      setBreakdownExportImages([]);
      return;
    }
    try {
      const files = await listUiCanvasNestedImages(pk, { subfolder: sub });
      const now = new Date().toISOString();
      setBreakdownExportImages(
        files.map((f) => ({
          id: `breakdown-export-${f.relative_path.replace(/[^a-zA-Z0-9._-]+/g, "_")}`,
          url: f.url.startsWith("http") ? f.url : normalizeImageUrl(f.url),
          filename: f.relative_path.split("/").pop() || f.relative_path,
          nestedUiRelativePath: f.relative_path,
          prompt: f.relative_path,
          createdAt: now,
          tab: "ui_canvas" as const,
          location: "local" as const,
        }))
      );
    } catch {
      setBreakdownExportImages([]);
    }
  }, [projectKey, effectiveBreakdownExportFolder]);

  useEffect(() => {
    if (tab !== "breakdown") return;
    void reloadBreakdownExports();
  }, [tab, projectKey, pathname, reloadBreakdownExports]);

  /** After editing a breakdown export (Nano Banana), Image Gen sets a flag — reload nested file list. */
  useEffect(() => {
    if (tab !== "breakdown" || !projectKey.trim()) return;
    try {
      if (sessionStorage.getItem(UIBUILDER_PENDING_BREAKDOWN_EXPORTS_RELOAD_KEY) === "1") {
        sessionStorage.removeItem(UIBUILDER_PENDING_BREAKDOWN_EXPORTS_RELOAD_KEY);
        void reloadBreakdownExports();
      }
    } catch {
      /* ignore */
    }
  }, [tab, projectKey, reloadBreakdownExports]);

  /** Full disk path + reveal — same folder as Breakdown exports (source UI subfolder or Process output). */
  const breakdownExportsFolderReveal = useMemo(() => {
    const pk = projectKey.trim();
    const folder = effectiveBreakdownExportFolder?.trim();
    if (!pk || !folder) return null;
    const root = getLocalProjectPath(pk);
    if (!root) return null;
    const relativePath = `Gen/Images/UI/${folder}`.replace(/\\/g, "/");
    const fullPath = joinLocalProjectSubpath(root, "Gen", "Images", "UI", folder);
    return { fullPath, projectRoot: root.trim(), relativePath };
  }, [projectKey, effectiveBreakdownExportFolder]);

  const breakdownExportsRelativeHint = useMemo(() => {
    if (breakdownExportsFolderReveal) return null;
    const folder = effectiveBreakdownExportFolder?.trim();
    if (!folder) return null;
    return `Gen/Images/UI/${folder}/`;
  }, [breakdownExportsFolderReveal, effectiveBreakdownExportFolder]);

  const handleRevealBreakdownExportsFolder = useCallback(async () => {
    const fr = breakdownExportsFolderReveal;
    if (!fr) return;
    if (!isLocalAgentContext()) return;
    try {
      await localAgent.approveProjectRoot(fr.projectRoot);
      await localAgent.revealFolder(fr.projectRoot, fr.relativePath);
    } catch {
      // Path still visible for manual open
    }
  }, [breakdownExportsFolderReveal]);

  useEffect(() => {
    const valid = new Set(
      uiCanvasImages.filter((img) => img.fromSketch && img.filename?.trim()).map((img) => img.id),
    );
    setSelectedSketchIds((prev) => prev.filter((id) => valid.has(id)));
  }, [uiCanvasImages]);

  /** useLayoutEffect: run after SketchCanvas has laid out (child layout effects run first) so the canvas has size before load. */
  useLayoutEffect(() => {
    if (tab !== "draw" || !pendingSketchRestore) return;
    let cancelled = false;
    const run = async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const ok = await sketchRef.current?.loadFromUrl(pendingSketchRestore.url);
      if (cancelled) return;
      setPendingSketchRestore(null);
      if (!ok) setStatus("Could not load the sketch into the canvas.");
      else setSketchDirty(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [tab, pendingSketchRestore]);

  const persistFullList = useCallback(
    async (next: GeneratedImage[]) => {
      if (!projectKey) return;
      await putImageGenerated(projectKey, next.map(toPayload), { private: isPrivate });
    },
    [projectKey, isPrivate],
  );

  const loadAllImages = useCallback(async (): Promise<GeneratedImage[]> => {
    if (!projectKey) return [];
    const { images: raw } = await getImageGenerated(projectKey, { private: isPrivate });
    return parseStoredImages(raw);
  }, [projectKey, isPrivate]);

  /** Run edit jobs from /imageGen/edit when return target is UI Builder, so progress stays visible here. */
  useEffect(() => {
    if (searchParams.get("runEdit") !== "1") return;
    if (!projectKey.trim()) return;
    const raw = sessionStorage.getItem(IMAGEGEN_EDIT_JOB_KEY);
    if (!raw) return;
    sessionStorage.removeItem(IMAGEGEN_EDIT_JOB_KEY);
    const t = searchParams.get("tab");
    const qs = new URLSearchParams();
    if (t === "breakdown" || t === "draw" || t === "generate") {
      qs.set("tab", t);
    }
    router.replace(qs.toString() ? `${pathname}?${qs.toString()}` : pathname, { scroll: false });

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
    if (!projectKey.trim()) {
      setStatus("Set an active project in Admin.");
      return;
    }
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

    if (!job.image.nestedUiRelativePath?.trim()) {
      setTab("generate");
    }
    setEditingUiCanvas(true);
    setStatus(`Editing image (${editModel}) at ${editW}×${editH}…`);

    void (async () => {
      try {
        const results = await editImageNanobanana({
          changes: job.changes,
          reference,
          project_key: projectKey.trim(),
          width: editW,
          height: editH,
          model: editModel,
        });
        if (!results.length) {
          setStatus("Edit finished but returned no image.");
          return;
        }
        const all = await loadAllImages();
        const now = new Date().toISOString();
        const basePrompt = String(job.image.prompt || "").trim();
        const promptLabel = `Edit: ${job.changes}\n\n(From: ${basePrompt.slice(0, 200)}${
          basePrompt.length > 200 ? "…" : ""
        })`;
        const linkedSketchFn =
          job.image.sourceSketchFilename?.trim() ||
          (job.image.fromSketch && job.image.filename?.trim() ? job.image.filename.trim() : undefined);
        const srcIndex = all.findIndex((img) => img.id === job.image.id);
        const inserted: GeneratedImage[] = [];
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          let url = String(r.url || r.filename || "");
          if (url && !url.startsWith("http")) {
            url = normalizeImageUrl(url);
          }
          const filename = typeof r.filename === "string" ? r.filename.trim() : "";
          let location: ImageLocation = job.image.location ?? "local";
          let finalUrl = url;
          if (location === "cloud" && filename) {
            finalUrl = await uploadImageToCloud(projectKey.trim(), filename);
          }
          inserted.push({
            id: `${now}-${i}-${Math.random().toString(36).slice(2)}`,
            url: finalUrl,
            filename: filename || undefined,
            prompt: promptLabel,
            styleName: job.image.styleName,
            createdAt: now,
            tab: job.image.tab,
            location,
            ...(linkedSketchFn ? { sourceSketchFilename: linkedSketchFn } : {}),
          });
        }
        const nextList =
          srcIndex >= 0
            ? [...all.slice(0, srcIndex + 1), ...inserted, ...all.slice(srcIndex + 1)]
            : [...inserted, ...all];
        await persistFullList(nextList);
        await reloadUiCanvasImages();
        clearEditDraft(job.image.id);
        setStatus("Image edited.");
      } catch (err) {
        setStatus(err instanceof Error ? `Edit failed: ${err.message}` : "Edit failed.");
      } finally {
        setEditingUiCanvas(false);
      }
    })();
  }, [
    searchParams,
    pathname,
    router,
    projectKey,
    imageModel,
    loadAllImages,
    persistFullList,
    reloadUiCanvasImages,
  ]);

  const handleSaveDrawing = useCallback(async (): Promise<boolean> => {
    const name = drawingName.trim();
    if (!name) {
      setStatus("Enter a name for your drawing.");
      return false;
    }
    if (!projectKey) {
      setStatus("Set an active project in Admin first.");
      return false;
    }
    const blob = await sketchRef.current?.getPngBlob();
    if (!blob) {
      setStatus("Could not read the sketch.");
      return false;
    }
    setSaving(true);
    setStatus(null);
    try {
      const file = new File([blob], "uicanvas-sketch.png", { type: "image/png" });
      const all = await loadAllImages();

      if (sketchEditTarget) {
        const imported = await importImageFile(file, projectKey, {
          replaceFilename: sketchEditTarget.filename,
          uiCanvas: true,
        });
        const first = imported[0];
        if (!first?.filename) {
          setStatus("Upload did not return a filename.");
          return false;
        }
        let finalUrl = first.url?.startsWith("http") ? first.url : normalizeImageUrl(first.url || "");
        if (sketchEditTarget.location === "cloud") {
          setStatus("Updating cloud copy…");
          finalUrl = await uploadImageToCloud(projectKey, sketchEditTarget.filename);
        }
        const now = new Date().toISOString();
        const next = all.map((img) =>
          img.id === sketchEditTarget.id
            ? {
                ...img,
                url: finalUrl,
                filename: sketchEditTarget.filename,
                prompt: name,
                createdAt: now,
                fromSketch: true,
              }
            : img,
        );
        await persistFullList(next);
        await reloadUiCanvasImages();
        setSketchEditTarget(null);
        setPendingSketchRestore(null);
        setDrawingName("");
        setSketchDirty(false);
        applyBuilderTab("generate");
        setStatus("Drawing saved.");
        return true;
      }

      const imported = await importImageFile(file, projectKey, { uiCanvas: true });
      const first = imported[0];
      if (!first?.filename) {
        setStatus("Upload did not return a filename.");
        return false;
      }
      const now = new Date().toISOString();
      const newItem: GeneratedImage = {
        id: `${now}-${Math.random().toString(36).slice(2)}`,
        url: first.url?.startsWith("http") ? first.url : normalizeImageUrl(first.url || ""),
        filename: first.filename,
        prompt: name,
        styleName: "UI Canvas",
        createdAt: now,
        tab: "ui_canvas",
        location: "local",
        fromSketch: true,
      };
      await persistFullList([...all, newItem]);
      await reloadUiCanvasImages();
      setDrawingName("");
      setSketchDirty(false);
      applyBuilderTab("generate");
      setStatus("Drawing saved.");
      return true;
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    drawingName,
    projectKey,
    sketchEditTarget,
    loadAllImages,
    persistFullList,
    reloadUiCanvasImages,
    applyBuilderTab,
  ]);

  const confirmLeaveDrawIfNeeded = useCallback(async (): Promise<boolean> => {
    if (tab !== "draw" || !sketchDirty) return true;
    const saveFirst = window.confirm("Do you want to save your drawing before leaving?");
    if (saveFirst) {
      return await handleSaveDrawing();
    }
    if (!window.confirm("Discard unsaved changes?")) return false;
    setSketchDirty(false);
    return true;
  }, [tab, sketchDirty, handleSaveDrawing]);

  const requestBuilderTab = useCallback(
    async (next: BuilderTab) => {
      if (next === tab) return;
      if (!(await confirmLeaveDrawIfNeeded())) return;
      if (next === tab) return;
      applyBuilderTab(next);
    },
    [tab, confirmLeaveDrawIfNeeded, applyBuilderTab],
  );

  const handleDeleteImage = async (id: string) => {
    if (!projectKey) return;
    try {
      const all = await loadAllImages();
      const target = all.find((img) => img.id === id);
      const kind = target?.fromSketch ? "drawing" : "image";
      if (
        !window.confirm(
          `Delete this ${kind} from UI Canvas?\n\nIt will be removed from this project’s image list.`,
        )
      ) {
        return;
      }
      await persistFullList(all.filter((img) => img.id !== id));
      if (sketchEditTarget?.id === id) setSketchEditTarget(null);
      await reloadUiCanvasImages();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const handleToggleLocation = async (imageId: string) => {
    if (!projectKey) {
      setStatus("Set an active project in Admin.");
      return;
    }
    const all = await loadAllImages();
    const target = all.find((img) => img.id === imageId);
    if (!target?.filename) {
      setStatus("Cannot determine filename for this image.");
      return;
    }
    try {
      if (target.location === "cloud") {
        const localUrl = normalizeImageUrl(`/images/${target.filename}?project_key=${encodeURIComponent(projectKey)}`);
        const next = all.map((img) =>
          img.id === imageId ? { ...img, url: localUrl, location: "local" as ImageLocation } : img,
        );
        await persistFullList(next);
        setStatus("Switched image to use local copy.");
      } else {
        setStatus("Uploading image to cloud...");
        const cloudUrl = await uploadImageToCloud(projectKey, target.filename);
        const next = all.map((img) =>
          img.id === imageId ? { ...img, url: cloudUrl, location: "cloud" as ImageLocation } : img,
        );
        await persistFullList(next);
        setStatus("Image uploaded to cloud.");
      }
      await reloadUiCanvasImages();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Location update failed.");
    }
  };

  const handleBreakdownExportRemoveBackground = async (img: GeneratedImage) => {
    if (!projectKey.trim() || !img.nestedUiRelativePath?.trim()) {
      setStatus("Missing project or export path.");
      return;
    }
    setStatus("Removing background...");
    try {
      await removeBackground("", projectKey.trim(), {
        model: BG_DEFAULTS.model,
        alphaMatting: BG_DEFAULTS.alphaMatting,
        alphaMattingForegroundThreshold: BG_DEFAULTS.fgThreshold,
        alphaMattingBackgroundThreshold: BG_DEFAULTS.bgThreshold,
        inputUiNestedRel: img.nestedUiRelativePath,
      });
      setStatus("Background removed.");
      await reloadBreakdownExports();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Remove background failed.");
    }
  };

  const handleBreakdownExportDelete = async (img: GeneratedImage) => {
    const pk = projectKey.trim();
    const rel = img.nestedUiRelativePath?.trim();
    if (!pk || !rel) {
      setStatus("Missing project or export path.");
      return;
    }
    if (
      !window.confirm(
        `Delete this file from disk?\n\n${rel}\n\nThis cannot be undone.`,
      )
    ) {
      return;
    }
    setStatus("Deleting file...");
    try {
      await deleteUiCanvasNestedImage(pk, rel);
      setStatus("File deleted.");
      await reloadBreakdownExports();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const handleBreakdownExportDeleteAll = async () => {
    const pk = projectKey.trim();
    const sub = effectiveBreakdownExportFolder?.trim();
    if (!pk || !sub) {
      setStatus("Choose or set an export folder first.");
      return;
    }
    if (
      !window.confirm(
        `Delete this entire folder from disk (all files inside)?\n\nGen/Images/UI/${sub}/\n\nThis cannot be undone.`,
      )
    ) {
      return;
    }
    setBreakdownExportDeleteAllBusy(true);
    setStatus("Deleting export folder...");
    try {
      await deleteUiCanvasExportFolder(pk, sub);
      setStatus("Export folder deleted.");
      setBreakdownExportImages([]);
      await reloadBreakdownExports();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Delete folder failed.");
    } finally {
      setBreakdownExportDeleteAllBusy(false);
    }
  };

  const handleRemoveBackground = async (imageId: string) => {
    if (!projectKey) {
      setStatus("Set an active project in Admin.");
      return;
    }
    const all = await loadAllImages();
    const target = all.find((img) => img.id === imageId);
    if (!target?.filename) {
      setStatus("Cannot determine filename for this image.");
      return;
    }
    try {
      setStatus("Removing background...");
      const result = await removeBackground(target.filename, projectKey, {
        model: BG_DEFAULTS.model,
        alphaMatting: BG_DEFAULTS.alphaMatting,
        alphaMattingForegroundThreshold: BG_DEFAULTS.fgThreshold,
        alphaMattingBackgroundThreshold: BG_DEFAULTS.bgThreshold,
      });
      const now = new Date().toISOString();
      let url = typeof result.url === "string" ? result.url : "";
      if (url && !url.startsWith("http")) url = normalizeImageUrl(url);
      let location: ImageLocation = target.location ?? "local";
      let finalUrl = url;
      if (location === "cloud") {
        finalUrl = await uploadImageToCloud(projectKey, result.filename || target.filename);
      }
      /** Same drawing group as wireframe polish: copy link from polish, or use sketch file when removing BG from the saved sketch. */
      const linkedSketchFn =
        target.sourceSketchFilename?.trim() ||
        (target.fromSketch && target.filename?.trim() ? target.filename.trim() : undefined);

      const newItem: GeneratedImage = {
        id: `${now}-${Math.random().toString(36).slice(2)}`,
        url: finalUrl,
        filename: result.filename || target.filename,
        prompt: target.prompt,
        styleName: target.styleName,
        createdAt: now,
        tab: target.tab,
        location,
        ...(linkedSketchFn ? { sourceSketchFilename: linkedSketchFn } : {}),
      };
      const srcIndex = all.findIndex((img) => img.id === imageId);
      const nextList =
        srcIndex >= 0
          ? [...all.slice(0, srcIndex + 1), newItem, ...all.slice(srcIndex + 1)]
          : [newItem, ...all];
      await persistFullList(nextList);
      setStatus("Background removed.");
      await reloadUiCanvasImages();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Remove background failed.");
    }
  };

  const handleEditImage = (img: GeneratedImage) => {
    if (img.tab === "ui_canvas" && img.fromSketch && img.filename?.trim()) {
      void (async () => {
        if (tab === "draw" && sketchDirty) {
          if (!(await confirmLeaveDrawIfNeeded())) return;
        }
        setSketchEditTarget({
          id: img.id,
          filename: img.filename!.trim(),
          location: img.location ?? "local",
        });
        setDrawingName(img.prompt || "");
        setSketchDirty(false);
        setPendingSketchRestore({ url: normalizeImageUrl(img.url) });
        setTab("draw");
        setStatus(null);
      })();
      return;
    }
    try {
      resolveReferenceForEditApi(img);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Cannot edit this image.");
      return;
    }
    void (async () => {
      if (tab === "draw" && sketchDirty) {
        if (!(await confirmLeaveDrawIfNeeded())) return;
      }
      try {
        capturePanelSnapshot({
          sizePreset: "square",
          qualityPreset: "high",
          imageDefaultsQuality: "high",
          imageModel,
          openAiQuality: "",
          openAiStyle: "",
          openAiTransparent: false,
        });
        const returnToBreakdown =
          Boolean(img.nestedUiRelativePath?.trim()) || tab === "breakdown";
        sessionStorage.setItem(
          IMAGEGEN_EDIT_RETURN_KEY,
          returnToBreakdown ? "/uiBuilder?tab=breakdown" : "/uiBuilder",
        );
        sessionStorage.setItem(IMAGEGEN_EDIT_CONTEXT_KEY, JSON.stringify(img));
        const pk = projectKey.trim();
        if (pk && breakdownImage) {
          writeBreakdownForProject(pk, {
            sourceImage: breakdownImage,
            workingFilename: breakdownWorkingFilename,
            exportFolderName: breakdownExportFolderName,
          });
        }
      } catch {
        setStatus("Could not store image context.");
        return;
      }
      router.push("/imageGen/edit");
    })();
  };

  const removeStyleReferenceAt = useCallback((index: number) => {
    setStyleReferenceFilenames((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addStyleReferencesFromFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      if (!projectKey?.trim()) {
        const msg = "Select a project in Admin before adding reference images from disk.";
        setStyleRefUploadError(msg);
        setStatus(msg);
        return;
      }
      const pk = projectKey.trim();
      setStyleRefUploadError(null);
      setUploadingStyleRefs(true);
      try {
        const newFns: string[] = [];
        for (const file of files) {
          if (newFns.length >= MAX_STYLE_REFS) break;
          const imported = await importImageFile(file, pk, { uiCanvas: true });
          const fn = imported[0]?.filename?.trim();
          if (!fn) {
            const line = `Could not save "${file.name}" — no filename in the server response.`;
            setStyleRefUploadError(line);
            setStatus(line);
            continue;
          }
          if (!newFns.includes(fn)) newFns.push(fn);
        }
        if (newFns.length === 0) {
          return;
        }
        setStyleReferenceFilenames((prev) => {
          const merged = [...prev];
          for (const fn of newFns) {
            if (merged.length >= MAX_STYLE_REFS) break;
            if (!merged.includes(fn)) merged.push(fn);
          }
          return merged.slice(0, MAX_STYLE_REFS);
        });
        setStyleRefUploadError(null);
        setStatus(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Reference upload failed.";
        setStyleRefUploadError(msg);
        setStatus(msg);
      } finally {
        setUploadingStyleRefs(false);
      }
    },
    [projectKey],
  );

  const onStyleRefFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const picked = input.files?.length ? Array.from(input.files) : [];
    input.value = "";
    void addStyleReferencesFromFiles(picked);
  };

  const handleSketchSelectionChange = useCallback((id: string, selected: boolean) => {
    setSelectedSketchIds((prev) => {
      if (selected) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  }, []);

  const selectedSketchesForPolish = useMemo(
    () =>
      uiCanvasImages.filter(
        (img) => img.fromSketch && selectedSketchIds.includes(img.id) && img.filename?.trim(),
      ),
    [uiCanvasImages, selectedSketchIds],
  );

  /**
   * Show all: full list.
   * Otherwise: only drawings until exactly one is selected — then that sketch first + polishes from it.
   * With no selection, only sketch tiles are listed so the user can pick one (polish outputs hidden by default).
   */
  const displayedUiCanvasImages = useMemo(() => {
    if (showAllUiCanvas) return uiCanvasImages;
    if (selectedSketchIds.length !== 1) {
      return uiCanvasImages.filter((img) => img.fromSketch);
    }
    const sid = selectedSketchIds[0];
    const sketch = uiCanvasImages.find((img) => img.id === sid && img.fromSketch);
    if (!sketch?.filename?.trim()) {
      return uiCanvasImages.filter((img) => img.fromSketch);
    }
    const srcFn = sketch.filename.trim();
    const derived = uiCanvasImages.filter(
      (img) => img.sourceSketchFilename === srcFn && img.id !== sketch.id,
    );
    derived.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return [sketch, ...derived];
  }, [uiCanvasImages, selectedSketchIds, showAllUiCanvas]);

  const uiCanvasEmptyMessage = useMemo(() => {
    if (uiCanvasImages.length === 0) {
      return "No UI Canvas images yet. Open the Draw tab, name your sketch, and click Save.";
    }
    if (showAllUiCanvas) return "No UI Canvas images yet.";
    if (!uiCanvasImages.some((img) => img.fromSketch)) {
      return "No saved drawings yet. Save a sketch from the Draw tab first.";
    }
    return "Select a drawing below (click its image), or turn on Show all to see every image.";
  }, [uiCanvasImages, showAllUiCanvas]);

  const handleBatchWireframeGenerate = async () => {
    if (!projectKey?.trim()) {
      setStatus("Set an active project in Admin first.");
      return;
    }
    if (selectedSketchesForPolish.length === 0) {
      setStatus("Select at least one sketch with a saved file.");
      return;
    }
    setGeneratingPolish(true);
    setStatus(null);
    const style =
      selectedStyleId !== "__none" ? styles.find((s) => s.id === selectedStyleId) ?? null : null;
    const extra = extraPolishPrompt.trim();
    try {
      for (let i = 0; i < selectedSketchesForPolish.length; i++) {
        const img = selectedSketchesForPolish[i];
        const fn = img.filename!.trim();
        setStatus(`Generating ${i + 1} of ${selectedSketchesForPolish.length}…`);
        const styleRefs = styleReferenceFilenames.slice(0, MAX_STYLE_REFS);
        const { images: results, styleName: resolvedStyleName } = await generateUiCanvasPolish({
          projectKey: projectKey.trim(),
          sketchFilename: fn,
          sketchTitle: img.prompt || "UI sketch",
          styleId: selectedStyleId,
          extraUserPrompt: extra || undefined,
          styleReferenceFilenames: styleRefs.length ? styleRefs : undefined,
          model: imageModel,
          width: 1024,
          height: 1024,
          layoutFidelity,
          transparentBackground: uiCanvasTransparentBg,
        });
        const first = results[0];
        if (!first) {
          setStatus(`Generation returned no image for "${(img.prompt || "").trim() || "sketch"}".`);
          return;
        }
        const rawUrl = (first.url || first.filename || "") as string;
        const filename =
          typeof first.filename === "string" && first.filename
            ? first.filename
            : (() => {
                try {
                  const u = new URL(rawUrl, API_BASE);
                  const pathname = u.pathname || "";
                  const idx = pathname.lastIndexOf("/");
                  return idx >= 0 ? pathname.slice(idx + 1) : "";
                } catch {
                  return "";
                }
              })();
        const all = await loadAllImages();
        const now = new Date().toISOString();
        const sketchLabel = (img.prompt || "").trim() || "sketch";
        const newItem: GeneratedImage = {
          id: `${now}-${Math.random().toString(36).slice(2)}`,
          url: rawUrl.startsWith("http") ? rawUrl : normalizeImageUrl(rawUrl),
          filename: filename || undefined,
          prompt: `UI polish from wireframe: "${sketchLabel}"`,
          styleName: resolvedStyleName ?? style?.name ?? img.styleName ?? "UI Canvas",
          createdAt: now,
          tab: "ui_canvas",
          location: "local",
          sourceSketchFilename: fn,
        };
        await persistFullList([newItem, ...all]);
        await reloadUiCanvasImages();
      }
      if (selectedSketchesForPolish.length === 1 && selectedSketchesForPolish[0]?.id) {
        setSelectedSketchIds([selectedSketchesForPolish[0].id]);
      } else {
        setSelectedSketchIds([]);
      }
      setStatus(`Generated ${selectedSketchesForPolish.length} polished image(s).`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Generate failed.");
    } finally {
      setGeneratingPolish(false);
    }
  };

  const handleImagesPerRowChange = (value: string) => {
    const n = parseInt(value, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 8) setImagesPerRow(n);
  };

  const setImagesPerRowClamped = (delta: number) => {
    const n = imagesPerRow + delta;
    if (n >= 1 && n <= 8) setImagesPerRow(n);
  };

  const saveDisabled = saving || !drawingName.trim() || !projectKey;

  const polishGenerateDisabled =
    generatingPolish ||
    editingUiCanvas ||
    !projectKey?.trim() ||
    selectedSketchesForPolish.length === 0;

  const clearSketchCanvas = () => {
    sketchRef.current?.clear();
    setSketchEditTarget(null);
    setSketchDirty(false);
  };

  useEffect(() => {
    if (tab !== "draw" || !sketchDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [tab, sketchDirty]);

  useEffect(() => {
    if (tab !== "draw" || !sketchDirty) return;
    const onDocClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const el = (e.target as HTMLElement).closest("a[href]");
      if (!el) return;
      const a = el as HTMLAnchorElement;
      if (a.target === "_blank" || a.download) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      void (async () => {
        if (!(await confirmLeaveDrawIfNeeded())) return;
        router.push(url.pathname + url.search + url.hash);
      })();
    };
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [tab, sketchDirty, pathname, router, confirmLeaveDrawIfNeeded]);

  return (
    <main>
      <div className="imagegen-shell">
        <div className="imagegen-left">
          <div className="imagegen-panel">
            <h2 className="imagegen-panel-title">Tools</h2>
            <div className="imagegen-panel-body" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                />
                <span>Private (save under my account)</span>
              </label>
              {!projectKey && (
                <p style={{ margin: 0, fontSize: 12, color: "#fbbf24" }}>Select a project in Admin to save sketches.</p>
              )}

              <div className="sidebar-tabs" role="tablist" aria-label="UI Builder mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "generate"}
                  className={tab === "generate" ? "sidebar-tab active" : "sidebar-tab"}
                  onClick={() => void requestBuilderTab("generate")}
                >
                  Generate
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "draw"}
                  className={tab === "draw" ? "sidebar-tab active" : "sidebar-tab"}
                  onClick={() => void requestBuilderTab("draw")}
                >
                  Draw
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "breakdown"}
                  className={tab === "breakdown" ? "sidebar-tab active" : "sidebar-tab"}
                  onClick={() => void requestBuilderTab("breakdown")}
                >
                  Breakdown
                </button>
              </div>

              <div className="sidebar-tab-content">
                {tab === "breakdown" && (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                    Pick a UI Canvas image in the gallery (right), then use <strong>Breakdown</strong> on a card. Controls
                    and preview fill the main panel.
                  </p>
                )}
                {tab === "generate" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, color: "var(--foreground, #e2e8f0)" }}>Workflow</span>
                      <ImagegenTooltip text={TIP_UIBUILDER_WORKFLOW} />
                    </div>
                    <fieldset
                      style={{
                        margin: 0,
                        padding: "0.65rem 0.75rem",
                        border: "1px solid #2a2f3a",
                        borderRadius: 8,
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                      }}
                    >
                      <legend style={{ fontSize: 13, color: "var(--foreground, #e2e8f0)", padding: "0 0.25rem" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          Style references (max {MAX_STYLE_REFS})
                          <ImagegenTooltip text={TIP_STYLE_REF_IMAGES} />
                        </span>
                      </legend>
                      {styleRefUploadError && (
                        <p style={{ margin: 0, fontSize: 12, color: "#f87171" }} role="alert">
                          {styleRefUploadError}
                        </p>
                      )}
                      {uploadingStyleRefs && (
                        <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>Uploading…</p>
                      )}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                          gap: "0.5rem",
                        }}
                        aria-label="Style reference slots"
                      >
                        {Array.from({ length: MAX_STYLE_REFS }, (_, slotIndex) => {
                          const fn = styleReferenceFilenames[slotIndex];
                          const hasImage = Boolean(fn && projectKey?.trim());
                          return (
                            <div
                              key={slotIndex}
                              style={{
                                position: "relative",
                                aspectRatio: "1",
                                maxHeight: 96,
                                borderRadius: 8,
                                border: `1px ${fn ? "solid" : "dashed"} #3d4554`,
                                background: "#0a0c10",
                                overflow: "hidden",
                              }}
                            >
                              {hasImage ? (
                                <>
                                  <img
                                    src={normalizeImageUrl(
                                      `/images/${encodeURIComponent(fn!)}?project_key=${encodeURIComponent(projectKey)}`,
                                    )}
                                    alt=""
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover",
                                      display: "block",
                                    }}
                                  />
                                  <span
                                    style={{
                                      position: "absolute",
                                      bottom: 0,
                                      left: 0,
                                      right: 0,
                                      padding: "2px 4px",
                                      fontSize: 9,
                                      color: "#cbd5e1",
                                      background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                    title={fn!}
                                  >
                                    {fn}
                                  </span>
                                  <button
                                    type="button"
                                    aria-label={`Remove style reference ${slotIndex + 1}`}
                                    title="Remove"
                                    disabled={generatingPolish || uploadingStyleRefs}
                                    onClick={() => removeStyleReferenceAt(slotIndex)}
                                    style={{
                                      position: "absolute",
                                      top: 4,
                                      right: 4,
                                      zIndex: 2,
                                      width: 26,
                                      height: 26,
                                      borderRadius: 6,
                                      border: "1px solid rgba(255,255,255,0.2)",
                                      background: "rgba(15,17,21,0.85)",
                                      color: "#f1f5f9",
                                      cursor: generatingPolish ? "not-allowed" : "pointer",
                                      fontSize: 16,
                                      lineHeight: 1,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      padding: 0,
                                    }}
                                  >
                                    ×
                                  </button>
                                </>
                              ) : (
                                <div
                                  style={{
                                    height: "100%",
                                    minHeight: 56,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 4,
                                    padding: 6,
                                    fontSize: 11,
                                    color: "var(--muted, #64748b)",
                                    textAlign: "center",
                                  }}
                                >
                                  <span
                                    aria-hidden
                                    style={{
                                      fontSize: 20,
                                      opacity: 0.45,
                                      lineHeight: 1,
                                    }}
                                  >
                                    +
                                  </span>
                                  <span>Empty</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <input
                        ref={styleRefFileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        style={{ display: "none" }}
                        onChange={onStyleRefFileInputChange}
                      />
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                        <button
                          type="button"
                          className="imagegen-import-button"
                          disabled={
                            generatingPolish ||
                            uploadingStyleRefs ||
                            !projectKey?.trim() ||
                            styleReferenceFilenames.length >= MAX_STYLE_REFS
                          }
                          onClick={() => styleRefFileInputRef.current?.click()}
                        >
                          {uploadingStyleRefs ? "Uploading…" : "Add from disk"}
                        </button>
                        <label htmlFor="uibuilder-style-ref-gallery" className="imagegen-label" style={{ margin: 0 }}>
                          From UI Canvas
                        </label>
                        <select
                          id="uibuilder-style-ref-gallery"
                          className="imagegen-select"
                          style={{ flex: 1, minWidth: 160 }}
                          value=""
                          disabled={
                            generatingPolish ||
                            uploadingStyleRefs ||
                            !projectKey?.trim() ||
                            styleReferenceFilenames.length >= MAX_STYLE_REFS
                          }
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            e.target.value = "";
                            if (!v) return;
                            setStyleReferenceFilenames((prev) => {
                              if (prev.length >= MAX_STYLE_REFS || prev.includes(v)) return prev;
                              return [...prev, v];
                            });
                            setStyleRefUploadError(null);
                          }}
                        >
                          <option value="">Choose an image…</option>
                          {uiCanvasImages
                            .filter(
                              (img) =>
                                img.filename?.trim() &&
                                !styleReferenceFilenames.includes(img.filename.trim()),
                            )
                            .map((img) => {
                              const fn = img.filename!.trim();
                              const label = (img.prompt || fn).trim();
                              const short = label.length > 52 ? `${label.slice(0, 52)}…` : label;
                              return (
                                <option key={img.id} value={fn}>
                                  {short}
                                </option>
                              );
                            })}
                        </select>
                      </div>
                    </fieldset>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <label className="imagegen-label" htmlFor="uibuilder-style" style={{ margin: 0 }}>
                        Style
                      </label>
                      <ImagegenTooltip text={TIP_STYLE_BANK} />
                    </div>
                    <select
                      id="uibuilder-style"
                      className="imagegen-select"
                      value={selectedStyleId}
                      onChange={(e) => setSelectedStyleId(e.target.value)}
                    >
                      <option value="__none">(No style)</option>
                      {styles.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <label className="imagegen-label" htmlFor="uibuilder-image-model" style={{ margin: 0 }}>
                        Image model
                      </label>
                      <ImagegenTooltip text={TIP_IMAGE_MODEL} />
                    </div>
                    <select
                      id="uibuilder-image-model"
                      className="imagegen-select"
                      value={imageModel}
                      onChange={(e) => setImageModel(e.target.value)}
                    >
                      {IMAGE_MODEL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <label
                        style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: 0, cursor: generatingPolish ? "not-allowed" : "pointer" }}
                      >
                        <input
                          type="checkbox"
                          checked={uiCanvasTransparentBg}
                          onChange={(e) => setUiCanvasTransparentBg(e.target.checked)}
                          disabled={generatingPolish}
                        />
                        <span>Transparent background (GPT Image)</span>
                      </label>
                      <ImagegenTooltip text={TIP_TRANSPARENT_BG} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <label className="imagegen-label" htmlFor="uibuilder-layout-fidelity" style={{ margin: 0 }}>
                        Layout fidelity ({layoutFidelity})
                      </label>
                      <ImagegenTooltip text={TIP_LAYOUT_FIDELITY} />
                    </div>
                    <input
                      id="uibuilder-layout-fidelity"
                      type="range"
                      min={0}
                      max={100}
                      value={layoutFidelity}
                      onChange={(e) => setLayoutFidelity(Number(e.target.value))}
                      disabled={generatingPolish}
                      style={{ width: "100%" }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <label className="imagegen-label" htmlFor="uibuilder-extra-polish-prompt" style={{ margin: 0 }}>
                        Extra prompt (optional)
                      </label>
                      <ImagegenTooltip text={TIP_EXTRA_POLISH} />
                    </div>
                    <textarea
                      id="uibuilder-extra-polish-prompt"
                      value={extraPolishPrompt}
                      onChange={(e) => setExtraPolishPrompt(e.target.value)}
                      placeholder="Appended to the wireframe polish prompt — e.g. dark theme, high contrast, large tap targets."
                      rows={4}
                      disabled={generatingPolish}
                      style={{
                        width: "100%",
                        resize: "vertical",
                        minHeight: 88,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #2a2f3a",
                        background: "#0f1115",
                        color: "var(--foreground, #e2e8f0)",
                        fontSize: 13,
                        fontFamily: "inherit",
                      }}
                    />
                    <button
                      type="button"
                      className="imagegen-generate-button"
                      style={{ width: "100%", marginTop: 0 }}
                      disabled={polishGenerateDisabled}
                      onClick={() => void handleBatchWireframeGenerate()}
                    >
                      {generatingPolish
                        ? "Generating…"
                        : `Generate polished UI${selectedSketchesForPolish.length ? ` (${selectedSketchesForPolish.length})` : ""}`}
                    </button>
                  </div>
                )}

                {tab === "draw" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <label style={{ display: "grid", gap: "0.35rem", fontSize: 13 }}>
                      <span>Drawing name</span>
                      <input
                        type="text"
                        value={drawingName}
                        onChange={(e) => setDrawingName(e.target.value)}
                        placeholder="e.g. HUD wireframe v1"
                        autoComplete="off"
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #2a2f3a",
                          background: "#0f1115",
                          color: "var(--foreground, #e2e8f0)",
                          fontSize: 14,
                        }}
                      />
                    </label>

                    <label style={{ display: "grid", gap: "0.35rem", fontSize: 13 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        Drawing orientation
                        <ImagegenTooltip text={TIP_DRAW_ORIENTATION} />
                      </span>
                      <select
                        className="imagegen-select"
                        value={drawOrientation}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "portrait" || v === "landscape") {
                            setDrawOrientation(v);
                          }
                        }}
                      >
                        <option value="landscape">Landscape</option>
                        <option value="portrait">Portrait</option>
                      </select>
                    </label>

                    <label style={{ display: "grid", gap: "0.35rem", fontSize: 13 }}>
                      <span>Brush size ({brushSize}px)</span>
                      <input
                        type="range"
                        min={1}
                        max={48}
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                      />
                    </label>

                    <fieldset
                      style={{
                        margin: 0,
                        padding: "0.5rem 0.75rem",
                        border: "1px solid #2a2f3a",
                        borderRadius: 8,
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.4rem",
                      }}
                    >
                      <legend style={{ fontSize: 12, color: "var(--muted, #94a3b8)", padding: "0 0.25rem" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          Pens (by UI task)
                          <ImagegenTooltip text={TIP_DRAW_PENS} />
                        </span>
                      </legend>
                      {UI_PEN_TASKS.map((p) => (
                        <label
                          key={p.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            cursor: "pointer",
                            fontSize: 13,
                          }}
                        >
                          <input
                            type="radio"
                            name="uibuilder-draw-tool"
                            checked={tool === p.id}
                            onChange={() => setTool(p.id)}
                          />
                          <span
                            aria-hidden
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 4,
                              background: p.color,
                              border: "1px solid rgba(255,255,255,0.25)",
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <strong style={{ color: "var(--foreground, #e2e8f0)" }}>{p.label}</strong>
                            <span style={{ color: "var(--muted, #94a3b8)", fontSize: 11, marginLeft: 6 }}>
                              ({p.shortLabel})
                            </span>
                          </span>
                        </label>
                      ))}
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          cursor: "pointer",
                          fontSize: 13,
                          marginTop: 4,
                          paddingTop: 6,
                          borderTop: "1px solid #2a2f3a",
                        }}
                      >
                        <input
                          type="radio"
                          name="uibuilder-draw-tool"
                          checked={tool === "text"}
                          onChange={() => setTool("text")}
                        />
                        <span style={{ flex: 1 }}>
                          <strong style={{ color: "var(--foreground, #e2e8f0)" }}>Text</strong>
                          <span style={{ color: "var(--muted, #94a3b8)", fontSize: 11, marginLeft: 6 }}>
                            (place copy)
                          </span>
                        </span>
                      </label>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        <input
                          type="radio"
                          name="uibuilder-draw-tool"
                          checked={tool === "eraser"}
                          onChange={() => setTool("eraser")}
                        />
                        <span style={{ flex: 1 }}>Eraser</span>
                      </label>
                    </fieldset>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                      <button type="button" onClick={clearSketchCanvas}>
                        Clear
                      </button>
                      <button type="button" disabled={saveDisabled} onClick={() => void handleSaveDrawing()}>
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {status && (
                <div style={{ display: "grid", gap: 8 }}>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }} role="status">
                    {status}
                  </p>
                  {editingUiCanvas && (
                    <div className="breakdown-progress-track" role="progressbar" aria-valuetext="In progress">
                      <div className="breakdown-progress-bar" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="imagegen-right">
          <div
            className="imagegen-panel"
            style={{
              flex: 1,
              minHeight: "min(70vh, 900px)",
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            {tab === "draw" ? (
              <>
                <h2 className="imagegen-panel-title">Sketch</h2>
                <div
                  className="imagegen-panel-body"
                  style={{
                    flex: 1,
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <SketchCanvas
                    ref={sketchRef}
                    brushSize={brushSize}
                    tool={tool}
                    orientation={drawOrientation}
                    onContentModified={markSketchDirty}
                  />
                </div>
              </>
            ) : tab === "breakdown" ? (
              <>
                <h2 className="imagegen-panel-title">Breakdown</h2>
                <div
                  style={{
                    flexShrink: 0,
                    marginBottom: "0.5rem",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #2a2f3a",
                    background: "#0f1115",
                  }}
                  aria-live="polite"
                  aria-busy={breakdownWorking}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "#94a3b8",
                      }}
                    >
                      Activity
                    </div>
                    {breakdownWorking && (
                      <span style={{ fontSize: 11, color: "#22d3ee", fontWeight: 600 }}>Working…</span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.45,
                      color: !breakdownImage
                        ? "#94a3b8"
                        : breakdownActivity?.isError
                          ? "#f87171"
                          : breakdownActivity
                            ? "var(--foreground, #e2e8f0)"
                            : "#94a3b8",
                    }}
                  >
                    {!breakdownImage
                      ? "Pick a UI Canvas image from the gallery, then use Breakdown on a card."
                      : breakdownActivity === null
                        ? "Ready — Detect or Remove text runs here."
                        : breakdownActivity.message}
                  </div>
                  {breakdownActivity?.folderReveal && !breakdownActivity.isError && (
                    <div style={{ marginTop: 10 }}>
                      {isLocalAgentContext() ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleRevealBreakdownFolder()}
                            title="Open in File Explorer (local agent)"
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              background: "transparent",
                              border: "none",
                              padding: 0,
                              color: "#38bdf8",
                              textDecoration: "underline",
                              cursor: "pointer",
                              fontSize: 12,
                              fontFamily: "ui-monospace, monospace",
                              wordBreak: "break-all",
                              lineHeight: 1.45,
                            }}
                          >
                            {breakdownActivity.folderReveal.fullPath}
                          </button>
                          <span style={{ fontSize: 11, color: "#64748b", display: "block", marginTop: 4 }}>
                            Click path to open folder (requires local agent)
                          </span>
                        </>
                      ) : (
                        <code
                          style={{
                            display: "block",
                            fontSize: 12,
                            color: "var(--foreground, #e2e8f0)",
                            wordBreak: "break-all",
                            lineHeight: 1.45,
                          }}
                        >
                          {breakdownActivity.folderReveal.fullPath}
                        </code>
                      )}
                    </div>
                  )}
                  {breakdownWorking && (
                    <div className="breakdown-progress-track" role="progressbar" aria-valuetext="In progress">
                      <div className="breakdown-progress-bar" />
                    </div>
                  )}
                </div>
                <div
                  className="imagegen-panel-body"
                  style={{
                    flex: 1,
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ flex: "1 1 0%", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <BreakdownPanel
                      projectKey={projectKey}
                      sourceImage={breakdownImage}
                      workingFilename={breakdownWorkingFilename}
                      onWorkingFilenameChange={setBreakdownWorkingFilename}
                      onActivityUpdate={setBreakdownActivity}
                      onWorkingChange={setBreakdownWorking}
                      onProcessComplete={() => void reloadBreakdownExports()}
                      exportFolderName={breakdownExportFolderName ?? ""}
                      onExportFolderChange={(name) => setBreakdownExportFolderName(name.trim() || null)}
                    />
                  </div>
                  <BreakdownExportsSection
                    images={breakdownExportImages}
                    exportFolderReveal={breakdownExportsFolderReveal}
                    exportRelativeHint={breakdownExportsRelativeHint}
                    onRevealExportFolder={() => void handleRevealBreakdownExportsFolder()}
                    onRemoveBackground={(img) => void handleBreakdownExportRemoveBackground(img)}
                    onEditImage={handleEditImage}
                    onDeleteImage={(img) => void handleBreakdownExportDelete(img)}
                    canDeleteAllExportFolder={Boolean(effectiveBreakdownExportFolder?.trim())}
                    deleteAllBusy={breakdownExportDeleteAllBusy}
                    onDeleteAllExportFolder={() => void handleBreakdownExportDeleteAll()}
                  />
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: "0.5rem" }}>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "0.5rem 1rem",
                    flexShrink: 0,
                  }}
                >
                  <button
                    type="button"
                    aria-pressed={showAllUiCanvas}
                    onClick={() => setShowAllUiCanvas((v) => !v)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: `1px solid ${showAllUiCanvas ? "var(--foreground, #e2e8f0)" : "#3d4554"}`,
                      background: showAllUiCanvas ? "#2a3140" : "#0f1115",
                      color: "var(--foreground, #e2e8f0)",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Show all
                  </button>
                  <ImagegenTooltip text={TIP_SHOW_ALL} />
                </div>
                <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                  <ResultsPanel
                    embedded
                    panelTitle="UI Canvas"
                    images={displayedUiCanvasImages}
                    imagesPerRow={imagesPerRow}
                    onImagesPerRowChange={handleImagesPerRowChange}
                    onImagesPerRowStep={setImagesPerRowClamped}
                    onDeleteImage={(id) => void handleDeleteImage(id)}
                    onToggleLocation={(id) => void handleToggleLocation(id)}
                    onRemoveBackground={(id) => void handleRemoveBackground(id)}
                    onEditImage={handleEditImage}
                    onBreakdown={(img) => {
                      setBreakdownImage(img);
                      setBreakdownWorkingFilename(null);
                      setBreakdownExportFolderName(
                        folderFromNestedUiPath(
                          img.nestedUiRelativePath ?? parseNestedUiRelFromUrl(img.url) ?? undefined,
                        ),
                      );
                      setBreakdownActivity(null);
                      setBreakdownWorking(false);
                      void requestBuilderTab("breakdown");
                    }}
                    showSketchCheckboxes
                    selectedSketchIds={selectedSketchIds}
                    onSketchSelectionChange={handleSketchSelectionChange}
                    sketchSelectionDisabled={generatingPolish || editingUiCanvas}
                    emptyMessage={uiCanvasEmptyMessage}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
