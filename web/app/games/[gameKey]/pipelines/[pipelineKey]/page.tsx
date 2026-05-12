"use client";

import { use, useCallback, useEffect, useLayoutEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchApi } from "../../../../lib/api";
import { readImagegenMainStyleId, writeImagegenMainStyleId } from "../../../../lib/imagegenMainStyle";
import type { Style } from "../../../../storyboard/types";
import { localAgent, getLocalProjectPath, isLocalAgentContext } from "../../../../lib/localAgentClient";

function resolveGiftImageFileName(g: Record<string, unknown>): string | null {
  const fn = g.imageFileName ?? g.image_filename;
  if (typeof fn === "string" && fn.trim()) {
    const cleaned = fn.trim();
    if (cleaned.toLowerCase().endsWith(".meta")) return null;
    return cleaned;
  }
  return null;
}

function parseStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

const REL_GIFT_IMAGES_DIR = "Assets/StreamingAssets/Gifts/Images";

/** Appended to gift image prompts so the model returns one scene, not a collage / grid / comic strip. */
const GIFT_IMAGE_SINGLE_SUBJECT_SUFFIX =
  " Single image only: one clear focal subject, one scene. No collage, photo grid, comic strip, split panels, or tiled layout.";
const REL_LOCATION_UPDATE_IMAGES_DIR = "Assets/StreamingAssets/Travel/LocationUpdateImages";
/** Value written to cities.json `image` for generated / auto-resolved assets (under StreamingAssets). */
const LOC_UPDATE_JSON_PATH_PREFIX = "Travel/LocationUpdateImages";
const POCKET_VOYAGER_PIPELINE_IMAGE_GENERATION_SIZE = 1024;
const POCKET_VOYAGER_PIPELINE_IMAGE_OUTPUT_SIZE = 256;

function citiesSelectedStorageKey(projectKey: string): string {
  return `pocketVoyagerCitiesSelectedCityIds:${projectKey}`;
}

/** Appended to every location-update image generation prompt. */
const LOCATION_UPDATE_IMAGE_SCENE_CONSTRAINTS =
  "Do not show a main character or any prominent person; no portraits or selfie-style framing. " +
  "No text, letters, captions, watermarks in the image.";

const LOC_UPDATE_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "as", "by", "with", "from",
  "is", "was", "are", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "will", "would", "could", "should", "may", "might", "must", "shall", "can",
  "i", "im", "ive", "ill", "id", "you", "your", "me", "my", "we", "our", "they", "their", "it", "its",
  "this", "that", "these", "those", "some", "any", "no", "not", "just", "like", "about", "into",
  "someone", "something", "everyone", "anyone", "everybody", "told", "said", "know", "think", "used", "get", "got",
  "mind", "blown", "really", "very", "also", "too", "so", "then", "than", "here", "there", "where", "when",
  "what", "which", "who", "how", "why",
]);

const LOC_UPDATE_THEMATIC_TAIL = new Set([
  "station", "museum", "park", "cathedral", "market", "tower", "palace", "garden", "beach", "square", "bridge",
  "gallery", "castle", "temple", "mosque", "fair", "hall", "church", "cafe", "coffee", "restaurant", "shop",
  "monument", "statue", "fountain", "harbor", "harbour", "viewpoint", "trail", "walk",
]);

/** Higher = better slug tail when multiple thematic pairs exist (e.g. train_station beats world_fair). */
const LOC_UPDATE_THEMATIC_RANK: Record<string, number> = {
  station: 6,
  museum: 6,
  gallery: 6,
  cathedral: 6,
  park: 5,
  bridge: 5,
  market: 5,
  tower: 5,
  palace: 5,
  castle: 5,
  beach: 4,
  square: 4,
  garden: 4,
  monument: 4,
  statue: 4,
  harbor: 4,
  harbour: 4,
  viewpoint: 4,
  trail: 4,
  walk: 3,
  temple: 3,
  mosque: 3,
  hall: 3,
  church: 3,
  cafe: 3,
  coffee: 3,
  restaurant: 3,
  shop: 3,
  fountain: 3,
  fair: 2,
};

function basenameOnly(pathOrName: string): string {
  const t = pathOrName.trim().replace(/\\/g, "/");
  const seg = t.split("/").pop() || t;
  return seg.trim();
}

function isSafeImageBasename(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) && name.length <= 120;
}

function sanitizeCityStub(cityId: string): string {
  const s = cityId.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return s.slice(0, 40) || "city";
}

function locationUpdateRowKey(cityId: string, idx: number): string {
  return `${cityId}|${idx}`;
}

function stripDiacriticsLower(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** Derive a short snake_case tail from update text (e.g. train_station from Musée d'Orsay / train station story). */
function slugFromLocationUpdateText(text: string): string {
  const norm = stripDiacriticsLower(text)
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = norm.split(" ").filter((w) => w.length > 0);
  const sig = tokens.filter((w) => w.length >= 3 && !LOC_UPDATE_STOPWORDS.has(w));
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < sig.length - 1; i++) {
    pairs.push([sig[i], sig[i + 1]]);
  }
  let bestPair: [string, string] | null = null;
  let bestRank = -1;
  let bestJ = -1;
  for (let j = 0; j < pairs.length; j++) {
    const [a, b] = pairs[j];
    if (a.length < 3 || b.length < 4 || !LOC_UPDATE_THEMATIC_TAIL.has(b)) continue;
    const rank = LOC_UPDATE_THEMATIC_RANK[b] ?? 3;
    if (rank > bestRank || (rank === bestRank && j > bestJ)) {
      bestRank = rank;
      bestJ = j;
      bestPair = [a, b];
    }
  }
  if (bestPair) {
    return `${bestPair[0]}_${bestPair[1]}`.slice(0, 64);
  }
  for (let j = pairs.length - 1; j >= 0; j--) {
    const [a, b] = pairs[j];
    if (a.length >= 4 && b.length >= 4) {
      return `${a}_${b}`.slice(0, 64);
    }
  }
  const longOnes = sig.filter((w) => w.length >= 4).slice(0, 2);
  if (longOnes.length >= 2) return `${longOnes[0]}_${longOnes[1]}`.slice(0, 64);
  if (longOnes.length === 1) return longOnes[0].slice(0, 48);
  const shortPair = sig.slice(0, 2).join("_");
  return (shortPair || "update").slice(0, 48);
}

function suggestLocationUpdateBasename(cityId: string, updateIndex: number, text: string): string {
  const city = sanitizeCityStub(cityId);
  const tail = slugFromLocationUpdateText(text);
  let stem = `${city}_${tail}`.replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 76);
  if (!stem) stem = `${city}_update_${updateIndex}`;
  return `${stem}.png`;
}

function uniqueLocationUpdateBasename(stemWithExt: string, existingLower: Set<string>): string {
  const stem = stemWithExt.replace(/\.png$/i, "").replace(/\.jpg$/i, "").replace(/\.jpeg$/i, "");
  let n = 0;
  let name = `${stem}.png`;
  while (existingLower.has(name.toLowerCase())) {
    n += 1;
    name = `${stem}_${n}.png`;
  }
  return name;
}

function jsonImagePathForLocationUpdate(diskBasename: string): string {
  const base = basenameOnly(diskBasename);
  return `${LOC_UPDATE_JSON_PATH_PREFIX}/${base}`;
}

function isPlaceholderLocationImage(base: string): boolean {
  const b = base.toLowerCase();
  return b === "placeholder.jpg" || b === "placeholder.jpeg" || b === "placeholder.png";
}

function locationUpdateFilenameTokens(filename: string): string[] {
  const stem = basenameOnly(filename).replace(/\.[^.]+$/, "");
  return stripDiacriticsLower(stem)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !LOC_UPDATE_STOPWORDS.has(token));
}

function buildLocationUpdateMatchTokens(cityId: string, cityDisplayName: string, text: string): string[] {
  const out = new Set<string>();
  const addTokens = (tokens: string[]) => {
    for (const token of tokens) {
      const cleaned = token.trim();
      if (cleaned.length >= 3 && !LOC_UPDATE_STOPWORDS.has(cleaned)) {
        out.add(cleaned);
      }
    }
  };
  addTokens(
    sanitizeCityStub(cityId)
      .split("_")
      .filter(Boolean)
  );
  addTokens(
    stripDiacriticsLower(cityDisplayName)
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
  );
  addTokens(slugFromLocationUpdateText(text).split("_").filter(Boolean));
  addTokens(
    stripDiacriticsLower(text)
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 8)
  );
  return Array.from(out);
}

function findBestExistingLocationUpdateMatch(
  cityId: string,
  cityDisplayName: string,
  updateIndex: number,
  text: string,
  existingFilenames: string[],
  claimedLower: Set<string>
): string | null {
  const candidates = existingFilenames.filter((name) => !claimedLower.has(name.toLowerCase()));
  if (candidates.length === 0) {
    return null;
  }
  const suggested = suggestLocationUpdateBasename(cityId, updateIndex, text);
  const suggestedLower = suggested.toLowerCase();
  const exact = candidates.find((name) => name.toLowerCase() === suggestedLower);
  if (exact) {
    return exact;
  }
  const suggestedStem = suggestedLower.replace(/\.[^.]+$/, "");
  const sameStem = candidates.find((name) => {
    const lower = name.toLowerCase();
    const stem = lower.replace(/\.[^.]+$/, "");
    return stem === suggestedStem || stem.startsWith(`${suggestedStem}_`);
  });
  if (sameStem) {
    return sameStem;
  }

  const wantedTokens = buildLocationUpdateMatchTokens(cityId, cityDisplayName, text);
  if (wantedTokens.length === 0) {
    return null;
  }
  const cityTokens = sanitizeCityStub(cityId)
    .split("_")
    .filter((token) => token.length >= 3);
  let best: { name: string; score: number } | null = null;
  for (const name of candidates) {
    const tokenSet = new Set<string>(locationUpdateFilenameTokens(name));
    if (tokenSet.size === 0) {
      continue;
    }
    let score = 0;
    let matchedWanted = 0;
    for (const token of wantedTokens) {
      if (tokenSet.has(token)) {
        matchedWanted += 1;
        score += cityTokens.includes(token) ? 3 : 2;
      }
    }
    if (matchedWanted === 0) {
      continue;
    }
    const cityMatched = cityTokens.some((token) => tokenSet.has(token));
    if (cityMatched) {
      score += 3;
    }
    const slugTokens = slugFromLocationUpdateText(text)
      .split("_")
      .filter((token) => token.length >= 3);
    const slugMatched = slugTokens.filter((token) => tokenSet.has(token)).length;
    score += slugMatched * 2;
    if (!best || score > best.score) {
      best = { name, score };
    }
  }
  return best && best.score >= 6 ? best.name : null;
}

/** Match `image_exists` from `_normalize_gift_catalog_entry` by listing the gift images folder (one request). */
async function applyGiftImageExistsFromProject(
  projectRoot: string,
  gifts: GiftItem[]
): Promise<GiftItem[]> {
  const namesLower = new Set<string>();
  try {
    const { entries } = await localAgent.listDir(projectRoot, REL_GIFT_IMAGES_DIR);
    for (const e of entries) {
      if (e.is_dir) continue;
      const n = e.name;
      if (n.toLowerCase().endsWith(".meta")) continue;
      namesLower.add(n.toLowerCase());
    }
  } catch {
    // Missing folder or agent error: treat as no files on disk.
  }
  return gifts.map((g) => {
    const fn = g.imageFileName?.trim();
    if (!fn || fn.toLowerCase().endsWith(".meta")) {
      return { ...g, image_exists: false };
    }
    return { ...g, image_exists: namesLower.has(fn.toLowerCase()) };
  });
}

/** Comma-separated place or tag ids; returns undefined if empty. */
function splitCsvToList(s: string): string[] | undefined {
  const parts = s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function humanizeGiftId(giftId: string): string {
  const s = giftId.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return giftId;
  return s.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Description + activity tags for a catalog gift derived from id + linking city (batch create missing gifts). */
function deriveGiftMetadataForCity(giftId: string, cityDisplayName: string): {
  displayName: string;
  description: string;
  activityTags: string[];
  /** Short prompt for image gen only; catalog `description` stays long for search/UX. */
  imagePrompt: string;
} {
  const displayName = humanizeGiftId(giftId);
  const cityLabel = cityDisplayName.trim() || "this destination";
  const description =
    `${displayName} is a souvenir-style collectible tied to ${cityLabel}. ` +
    `While exploring ${cityLabel}, try a short themed walk, stop at a viewpoint or park, browse a local craft or book shop, taste a regional snack, and take photos in areas that fit the gift's theme—all light activities visitors can do on location.`;
  const imagePrompt =
    `Souvenir collectible "${displayName}" themed to ${cityLabel}: one iconic object, mascot, or stylized emblem, ` +
    `centered composition, simple background, souvenir icon style.`;
  const fromId = giftId
    .toLowerCase()
    .split(/[_\s.-]+/)
    .filter((w) => w.length > 1)
    .slice(0, 6);
  const cityTok = cityLabel
    .toLowerCase()
    .split(/[\s,]+/)
    .find((w) => w.length > 2);
  const activityTags = [...new Set([...(cityTok ? [cityTok] : []), ...fromId, "explore", "city-walk"])].slice(
    0,
    8
  );
  return { displayName, description, activityTags, imagePrompt };
}

function joinPlatformPath(base: string | null, filename: string): string | null {
  if (!base) return null;
  const trimmed = base.replace(/[\\/]+$/, "");
  const sep = trimmed.includes("\\") ? "\\" : "/";
  return `${trimmed}${sep}${filename}`;
}

function dirFromPath(path: string): string {
  return path.replace(/[\\/][^\\/]+$/, "");
}

type PipelineInfo = { key: string; name: string; description?: string };
type GiftItem = {
  id: string;
  displayName: string;
  description: string;
  activityTags: string[];
  priority: number;
  weight: number;
  imageFileName?: string | null;
  image_exists: boolean;
  image_url?: string | null;
};
type GiftRunResponse = {
  ok: boolean;
  catalog_path: string;
  images_dir: string;
  gifts: GiftItem[];
};
type CityUpdate = { text: string; image?: string };
type CityItem = {
  name_id: string;
  display_name: string;
  gift_ids: string[];
  location_updates: CityUpdate[];
};
type CitiesRunResponse = {
  ok: boolean;
  catalog_path: string;
  home_city_id?: string;
  cities: CityItem[];
};

type GiftCityMap = Record<string, Array<{ id: string; name: string }>>;
type LinkedGift = {
  id: string;
  displayName: string;
  description: string;
  activityTags: string[];
  priority: number;
  weight: number;
  imageFileName?: string | null;
};

type PageProps = {
  params: Promise<{
    gameKey: string;
    pipelineKey: string;
  }>;
};

type GameDataPaths = {
  projectRoot: string;
  citiesJson: string;
  giftCatalogJson: string;
  giftsBaseDir: string;
  citiesJsonExists: boolean;
  giftCatalogJsonExists: boolean;
};

const REL_GIFTS_JSON = "Assets/StreamingAssets/Gifts/gifts_catalog.json";
const REL_CITIES_JSON = "Assets/StreamingAssets/Travel/cities.json";

function PipelinePageContent({
  gameKey,
  pipelineKey,
}: {
  gameKey: string;
  pipelineKey: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const giftImagesDeepLinkQ = searchParams.get("q")?.trim() ?? "";
  const giftImagesDeepLinkTab = searchParams.get("giftTab")?.trim() ?? "";
  const [pipeline, setPipeline] = useState<PipelineInfo | null>(null);
  const [inputs, setInputs] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [catalogPath, setCatalogPath] = useState("");
  const [gifts, setGifts] = useState<GiftItem[] | null>(null);
  const [imagesDir, setImagesDir] = useState<string | null>(null);
  const [imageBlobs, setImageBlobs] = useState<Record<string, string>>({});
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({});
  const [fileGifts, setFileGifts] = useState<GiftItem[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [catalogFileContent, setCatalogFileContent] = useState<string | null>(null);
  const [giftSearch, setGiftSearch] = useState("");
  const [cities, setCities] = useState<CityItem[] | null>(null);
  const [fileCities, setFileCities] = useState<CityItem[] | null>(null);
  const [linkedGiftsById, setLinkedGiftsById] = useState<Record<string, LinkedGift>>({});
  const [giftCityMap, setGiftCityMap] = useState<GiftCityMap>({});
  const [selectedCityByGift, setSelectedCityByGift] = useState<Record<string, string>>({});
  const [batchCityCount, setBatchCityCount] = useState("5");
  const [batchCityPrompt, setBatchCityPrompt] = useState("");
  const [batchCityStatus, setBatchCityStatus] = useState<string | null>(null);
  const [isBatchCreating, setIsBatchCreating] = useState(false);
  const [selectedCityIds, setSelectedCityIds] = useState<Record<string, boolean>>({});
  const [updateLocPrompt, setUpdateLocPrompt] = useState("");
  const [updateLocStatus, setUpdateLocStatus] = useState<string | null>(null);
  const [isUpdatingLoc, setIsUpdatingLoc] = useState(false);
  const [updateLocCount, setUpdateLocCount] = useState("3");
  const [locationUpdateAction, setLocationUpdateAction] = useState<
    "add_new" | "append_new" | "update_images" | "recreate_images"
  >("append_new");
  const [locationUpdateImageGenNotes, setLocationUpdateImageGenNotes] = useState("");
  const [locationUpdateImageStyleId, setLocationUpdateImageStyleId] = useState("");
  /** Same pattern as ImageGen Image tab: hydrate from localStorage once, then persist dropdown changes. */
  const locationUpdateImageStyleHydrated = useRef(false);
  const [pipelineGenerationLog, setPipelineGenerationLog] = useState("");
  const [citiesToolTab, setCitiesToolTab] = useState<"create" | "updates" | "pipelines">("create");
  const [missingGiftsPipelineStatus, setMissingGiftsPipelineStatus] = useState<string | null>(null);
  const [isCreatingMissingGifts, setIsCreatingMissingGifts] = useState(false);
  const [relinkExistingUpdatesStatus, setRelinkExistingUpdatesStatus] = useState<string | null>(null);
  const [isRelinkingExistingUpdates, setIsRelinkingExistingUpdates] = useState(false);
  const [testExistingUpdatesStatus, setTestExistingUpdatesStatus] = useState<string | null>(null);
  const [isTestingExistingUpdates, setIsTestingExistingUpdates] = useState(false);
  const [linkedGiftBasePath, setLinkedGiftBasePath] = useState("");
  const [selectedLinkedGiftId, setSelectedLinkedGiftId] = useState<string | null>(null);
  const [selectedLinkedGiftImage, setSelectedLinkedGiftImage] = useState<string | null>(null);
  const [showCreateGift, setShowCreateGift] = useState(false);
  const [createGiftId, setCreateGiftId] = useState("");
  const [createGiftDisplayName, setCreateGiftDisplayName] = useState("");
  const [createGiftDescription, setCreateGiftDescription] = useState("");
  const [createGiftActivityTags, setCreateGiftActivityTags] = useState("");
  const [createGiftPriority, setCreateGiftPriority] = useState("10");
  const [createGiftWeight, setCreateGiftWeight] = useState("2");
  const [createGiftStatus, setCreateGiftStatus] = useState<string | null>(null);
  const [generatingGiftId, setGeneratingGiftId] = useState<string | null>(null);
  const [createGiftImageMode, setCreateGiftImageMode] = useState<"file" | "generate">("file");
  const [showEditGift, setShowEditGift] = useState(false);
  const [editGiftId, setEditGiftId] = useState("");
  const [editGiftDisplayName, setEditGiftDisplayName] = useState("");
  const [editGiftDescription, setEditGiftDescription] = useState("");
  const [editGiftActivityTags, setEditGiftActivityTags] = useState("");
  const [editGiftPriority, setEditGiftPriority] = useState("10");
  const [editGiftWeight, setEditGiftWeight] = useState("2");
  const [editGiftImageFile, setEditGiftImageFile] = useState<File | null>(null);
  const [editGiftImageMode, setEditGiftImageMode] = useState<"keep" | "file" | "generate">("keep");
  const [editGiftStatus, setEditGiftStatus] = useState<string | null>(null);
  const [createGiftImageFile, setCreateGiftImageFile] = useState<File | null>(null);
  const [gameDataPaths, setGameDataPaths] = useState<GameDataPaths | null>(null);
  const [gameDataLoadError, setGameDataLoadError] = useState<string | null>(null);
  const [giftCatalogMissingForCities, setGiftCatalogMissingForCities] = useState(false);
  const [activeProjectKeyForGame, setActiveProjectKeyForGame] = useState<string | null>(null);
  const [localAgentOk, setLocalAgentOk] = useState(false);
  const [localAgentError, setLocalAgentError] = useState<string | null>(null);
  const [giftToolTab, setGiftToolTab] = useState<"create" | "update">("create");
  const [selectedGiftIds, setSelectedGiftIds] = useState<Record<string, boolean>>({});
  const [giftStyles, setGiftStyles] = useState<Style[]>([]);
  const [giftStyleId, setGiftStyleId] = useState("");
  const [giftStyleExtra, setGiftStyleExtra] = useState("");
  const [giftStyleQuality, setGiftStyleQuality] = useState("low");
  const [giftStyleMode, setGiftStyleMode] = useState("natural");
  const [giftUpdateStatus, setGiftUpdateStatus] = useState<string | null>(null);
  const [isGiftUpdating, setIsGiftUpdating] = useState(false);
  const [giftImageReload, setGiftImageReload] = useState(0);
  const [catalogReload, setCatalogReload] = useState(0);
  /** Scroll container for the main city/gift list (split view or tall list). */
  const mainListScrollRef = useRef<HTMLDivElement>(null);
  const pendingMainListScrollTop = useRef<number | null>(null);
  const hasAutoScrolledToSelectedCityRef = useRef(false);
  const [selectedCityIdsHydrated, setSelectedCityIdsHydrated] = useState(false);
  const preserveMainListScrollForNextCatalogReload = useCallback(() => {
    const el = mainListScrollRef.current;
    if (el) pendingMainListScrollTop.current = el.scrollTop;
  }, []);

  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewImageTitle, setPreviewImageTitle] = useState<string | null>(null);
  const [locationUpdateImageBlobs, setLocationUpdateImageBlobs] = useState<Record<string, string>>({});
  const [locationUpdateImagesLoading, setLocationUpdateImagesLoading] = useState(false);

  const parseCatalogText = (text: string): GiftItem[] => {
    const parsed = JSON.parse(text) as { items?: unknown; gifts?: unknown };
    const rawItems = Array.isArray(parsed.items) ? parsed.items : parsed.gifts;
    if (!Array.isArray(rawItems)) {
      throw new Error("Missing 'items' array in JSON.");
    }
    return rawItems
      .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
      .map((gift) => {
        const pri = gift.priority;
        const priority =
          typeof pri === "number" && !Number.isNaN(pri) ? pri : Number(pri) || 10;
        const w = gift.weight;
        const weight = typeof w === "number" && !Number.isNaN(w) ? w : Number(w) || 2;
        return {
          id: String(gift.id ?? ""),
          displayName: String(gift.displayName ?? gift.name ?? ""),
          description: String(gift.description ?? ""),
          activityTags: parseStringArray(gift.activityTags),
          priority,
          weight,
          imageFileName: resolveGiftImageFileName(gift),
          image_exists: false,
          image_url:
            typeof gift.image_url === "string"
              ? gift.image_url
              : typeof gift.image === "string" && gift.image.startsWith("http")
              ? gift.image
              : null,
        };
      });
  };

  const parseGiftLinksText = (text: string): Record<string, LinkedGift> => {
    const parsed = JSON.parse(text) as { items?: unknown; gifts?: unknown };
    const rawItems = Array.isArray(parsed.items) ? parsed.items : parsed.gifts;
    if (!Array.isArray(rawItems)) return {};
    const out: Record<string, LinkedGift> = {};
    rawItems
      .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
      .forEach((gift) => {
        const id = String(gift.id ?? "").trim();
        if (!id) return;
        const pri = gift.priority;
        const priority =
          typeof pri === "number" && !Number.isNaN(pri) ? pri : Number(pri) || 10;
        const w = gift.weight;
        const weight = typeof w === "number" && !Number.isNaN(w) ? w : Number(w) || 2;
        out[id] = {
          id,
          displayName: String(gift.displayName ?? gift.name ?? "").trim(),
          description: String(gift.description ?? "").trim(),
          activityTags: parseStringArray(gift.activityTags),
          priority,
          weight,
          imageFileName: resolveGiftImageFileName(gift),
        };
      });
    return out;
  };

  const getProjectRoot = () => gameDataPaths?.projectRoot || "";

  const readGiftCatalogRaw = async () => {
    const root = getProjectRoot();
    if (!root) throw new Error("Local project path is not set.");
    return (await localAgent.readJson(root, REL_GIFTS_JSON)).data as Record<string, unknown>;
  };

  const writeGiftCatalogRaw = async (data: Record<string, unknown>) => {
    const root = getProjectRoot();
    if (!root) throw new Error("Local project path is not set.");
    await localAgent.writeJson(root, REL_GIFTS_JSON, data);
  };

  const readCitiesRaw = async () => {
    const root = getProjectRoot();
    if (!root) throw new Error("Local project path is not set.");
    return (await localAgent.readJson(root, REL_CITIES_JSON)).data as Record<string, unknown>;
  };

  const writeCitiesRaw = async (data: Record<string, unknown>) => {
    const root = getProjectRoot();
    if (!root) throw new Error("Local project path is not set.");
    await localAgent.writeJson(root, REL_CITIES_JSON, data);
  };

  const getGiftItems = (data: Record<string, unknown>) => {
    const itemsValue = data["items"];
    const giftsValue = data["gifts"];
    if (Array.isArray(itemsValue)) return { key: "items", items: itemsValue as Record<string, unknown>[] };
    if (Array.isArray(giftsValue)) return { key: "gifts", items: giftsValue as Record<string, unknown>[] };
    return { key: "items", items: [] as Record<string, unknown>[] };
  };

  const setGiftItems = (data: Record<string, unknown>, key: string, items: Record<string, unknown>[]) => {
    data[key] = items;
    if (key === "items") delete data.gifts;
    if (key === "gifts") delete data.items;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  };

  const base64ToBlob = (contentBase64: string) => {
    const binary = atob(contentBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: "image/png" });
  };

  const resizeGeneratedImageBase64 = async (contentBase64: string, width: number, height: number) => {
    const blob = base64ToBlob(contentBase64);
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image();
        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = () => reject(new Error("Failed to load generated image for resize."));
        nextImage.src = objectUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas 2D context is unavailable.");
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0, width, height);
      const resizedBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((nextBlob) => {
          if (!nextBlob) {
            reject(new Error("Failed to encode resized image."));
            return;
          }
          resolve(nextBlob);
        }, "image/png");
      });
      return arrayBufferToBase64(await resizedBlob.arrayBuffer());
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const generateImageBytes = async (prompt: string, quality: string, projectKey: string | null) => {
    const res = await fetchApi("/tools/generate_image_bytes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        width: POCKET_VOYAGER_PIPELINE_IMAGE_GENERATION_SIZE,
        height: POCKET_VOYAGER_PIPELINE_IMAGE_GENERATION_SIZE,
        quality,
        model: "gpt-image-1.5",
        project_key: projectKey,
      }),
    });
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { detail?: string };
      throw new Error(errBody.detail || `Image generation failed (${res.status}).`);
    }
    const payload = (await res.json()) as { content_base64?: string };
    if (!payload.content_base64) throw new Error("Image bytes missing.");
    return await resizeGeneratedImageBase64(
      payload.content_base64,
      POCKET_VOYAGER_PIPELINE_IMAGE_OUTPUT_SIZE,
      POCKET_VOYAGER_PIPELINE_IMAGE_OUTPUT_SIZE
    );
  };

  const appendPipelineLog = useCallback((line: string) => {
    const ts = new Date().toISOString();
    setPipelineGenerationLog((prev) => {
      const entry = `[${ts}] ${line}`;
      const next = prev ? `${prev}\n${entry}` : entry;
      return next.length > 120_000 ? next.slice(next.length - 120_000) : next;
    });
  }, []);

  const parseCitiesText = (text: string): CityItem[] => {
    const parsed = JSON.parse(text) as { cities?: unknown };
    if (!Array.isArray(parsed.cities)) {
      throw new Error("Missing 'cities' array in JSON.");
    }
    return parsed.cities
      .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
      .map((city) => ({
        name_id: String(city.nameId ?? city.name_id ?? ""),
        display_name: String(city.displayName ?? city.display_name ?? ""),
        gift_ids: Array.isArray(city.giftIds)
          ? city.giftIds.map((id) => String(id)).filter(Boolean)
          : Array.isArray(city.gift_ids)
          ? city.gift_ids.map((id) => String(id)).filter(Boolean)
          : [],
        location_updates: Array.isArray(city.locationUpdates)
          ? city.locationUpdates
              .filter((u): u is Record<string, unknown> => !!u && typeof u === "object")
              .map((u) => ({ text: String(u.text ?? ""), image: String(u.image ?? "") }))
          : Array.isArray(city.location_updates)
          ? city.location_updates
              .filter((u): u is Record<string, unknown> => !!u && typeof u === "object")
              .map((u) => ({ text: String(u.text ?? ""), image: String(u.image ?? "") }))
          : [],
      }));
  };

  const buildGiftCityMap = (cityList: CityItem[]): GiftCityMap => {
    const map: GiftCityMap = {};
    cityList.forEach((city) => {
      const cityId = city.name_id;
      const cityName = city.display_name || city.name_id;
      city.gift_ids.forEach((giftId) => {
        if (!map[giftId]) map[giftId] = [];
        if (!map[giftId].some((c) => c.id === cityId)) {
          map[giftId].push({ id: cityId, name: cityName });
        }
      });
    });
    return map;
  };

  useEffect(() => {
    if (pipelineKey !== "gift_images" && pipelineKey !== "cities") return;
    let cancelled = false;
    if (!isLocalAgentContext()) {
      setLocalAgentOk(false);
      setLocalAgentError(
        "Gift/cities file tools need the local agent on your PC. From http://localhost, this works automatically. From a deployed https:// URL, set NEXT_PUBLIC_LOCAL_AGENT_PAGE_HOSTS to your hostname at web build time and LOCAL_AGENT_EXTRA_CORS_ORIGINS on the agent (see local_agent/README.md)."
      );
      return;
    }
    const checkHealth = async () => {
      const ok = await localAgent.health();
      if (cancelled) return;
      setLocalAgentOk(ok);
      setLocalAgentError(ok ? null : "Local agent is not running. Start it on localhost (e.g. local_agent\\run.bat).");
    };
    void checkHealth();
    return () => {
      cancelled = true;
    };
  }, [pipelineKey]);

  /** Resolve JSON paths from local agent + local project path. */
  useEffect(() => {
    if (pipelineKey !== "gift_images" && pipelineKey !== "cities") return;
    let cancelled = false;
    const loadPaths = async () => {
      const key = typeof window !== "undefined" ? window.localStorage.getItem("activeProjectKey") || "" : "";
      setActiveProjectKeyForGame(key || null);
      if (!key) {
        setGameDataPaths(null);
        setGameDataLoadError("No active project. Choose a project in Admin → Projects.");
        setCatalogPath("");
        setLinkedGiftBasePath("");
        setGiftCatalogMissingForCities(false);
        return;
      }
      if (!localAgentOk) {
        setGameDataPaths(null);
        setGameDataLoadError(localAgentError || "Local agent is not running.");
        return;
      }
      const localRoot = getLocalProjectPath(key);
      if (!localRoot) {
        setGameDataPaths(null);
        setGameDataLoadError("Local project path is not set. Set it in Admin → Projects.");
        return;
      }
      try {
        await localAgent.approveProjectRoot(localRoot);
        const data = await localAgent.resolveProjectPaths(localRoot);
        if (cancelled) return;
        const paths: GameDataPaths = {
          projectRoot: data.project_root,
          citiesJson: data.cities_json,
          giftCatalogJson: data.gift_catalog_json,
          giftsBaseDir: dirFromPath(data.gift_catalog_json),
          citiesJsonExists: data.cities_json_exists,
          giftCatalogJsonExists: data.gift_catalog_json_exists,
        };
        setGameDataPaths(paths);
        setLinkedGiftBasePath(dirFromPath(data.gift_catalog_json));
        setGiftCatalogMissingForCities(pipelineKey === "cities" && !data.gift_catalog_json_exists);
        if (pipelineKey === "gift_images") {
          setCatalogPath(data.gift_catalog_json);
          if (!data.gift_catalog_json_exists) {
            setGameDataLoadError(`Gift catalog not found. Expected: ${data.gift_catalog_json}`);
          } else {
            setGameDataLoadError(null);
          }
        } else {
          setCatalogPath(data.cities_json);
          if (!data.cities_json_exists) {
            setGameDataLoadError(`Cities file not found. Expected: ${data.cities_json}`);
          } else {
            setGameDataLoadError(null);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setGameDataPaths(null);
          setGameDataLoadError(e instanceof Error ? e.message : "Failed to load project paths.");
          setGiftCatalogMissingForCities(false);
        }
      }
    };
    void loadPaths();
    const onProjectChange = () => void loadPaths();
    window.addEventListener("activeProjectChanged", onProjectChange);
    window.addEventListener("storage", onProjectChange);
    return () => {
      cancelled = true;
      window.removeEventListener("activeProjectChanged", onProjectChange);
      window.removeEventListener("storage", onProjectChange);
    };
  }, [pipelineKey, localAgentOk, localAgentError]);

  /** Load JSON from local agent when paths exist. */
  useEffect(() => {
    if (pipelineKey !== "gift_images" && pipelineKey !== "cities") return;
    if (!activeProjectKeyForGame || !gameDataPaths) return;
    if (gameDataLoadError) return;
    if (!localAgentOk) return;
    let cancelled = false;
    const resetLoadedState = () => {
      setCatalogFileContent(null);
      setFileGifts(null);
      setFileCities(null);
      setGifts(null);
      setCities(null);
      setLinkedGiftsById({});
      setSelectedLinkedGiftId(null);
      setSelectedLinkedGiftImage(null);
      setImageBlobs({});
      setFileError(null);
    };
    const loadFiles = async () => {
      try {
        resetLoadedState();
        if (pipelineKey === "gift_images" && gameDataPaths.giftCatalogJsonExists) {
          const json = (
            await localAgent.readJson(gameDataPaths.projectRoot, REL_GIFTS_JSON)
          ).data as GiftRunResponse | { gifts?: GiftItem[]; items?: GiftItem[] };
          const text = JSON.stringify(json, null, 2);
          setCatalogFileContent(text);
          const giftsBase = dirFromPath(gameDataPaths.giftCatalogJson);
          const computedImagesDir = joinPlatformPath(giftsBase, "Images");
          if (computedImagesDir) setImagesDir(computedImagesDir);
          let giftList: GiftItem[];
          if (Array.isArray((json as GiftRunResponse).gifts)) {
            const parsed = json as GiftRunResponse;
            giftList = parsed.gifts || [];
            if (parsed.images_dir) setImagesDir(parsed.images_dir);
          } else {
            giftList = parseCatalogText(text);
          }
          const withImageExists = await applyGiftImageExistsFromProject(
            gameDataPaths.projectRoot,
            giftList
          );
          setGifts(withImageExists);
          setFileGifts(null);
          setFileError(null);
          if (gameDataPaths.citiesJsonExists) {
            const citiesJson = (
              await localAgent.readJson(gameDataPaths.projectRoot, REL_CITIES_JSON)
            ).data;
            const citiesText = JSON.stringify(citiesJson, null, 2);
            const parsedCities = parseCitiesText(citiesText);
            setCities(parsedCities);
            setFileCities(null);
            setGiftCityMap(buildGiftCityMap(parsedCities));
          } else {
            setCities(null);
            setGiftCityMap({});
          }
        } else if (pipelineKey === "cities" && gameDataPaths.citiesJsonExists) {
          const json = (await localAgent.readJson(gameDataPaths.projectRoot, REL_CITIES_JSON)).data;
          const text = JSON.stringify(json, null, 2);
          setCatalogFileContent(text);
          const parsed = parseCitiesText(text);
          setFileCities(parsed);
          setFileError(null);
          setCities(parsed);
          setGiftCityMap(buildGiftCityMap(parsed));
        }
        if (pipelineKey === "cities" && gameDataPaths.giftCatalogJsonExists) {
          const giftJson = (await localAgent.readJson(gameDataPaths.projectRoot, REL_GIFTS_JSON)).data;
          setLinkedGiftsById(parseGiftLinksText(JSON.stringify(giftJson)));
        } else if (pipelineKey === "cities") {
          setLinkedGiftsById({});
        }
      } catch {
        if (!cancelled) setFileError("Failed to load JSON from project files.");
      }
    };
    void loadFiles();
    return () => {
      cancelled = true;
    };
  }, [pipelineKey, activeProjectKeyForGame, gameDataPaths, gameDataLoadError, localAgentOk, catalogReload]);

  useLayoutEffect(() => {
    if (pipelineKey !== "gift_images" && pipelineKey !== "cities") return;
    const y = pendingMainListScrollTop.current;
    if (y == null || !mainListScrollRef.current) return;
    if (pipelineKey === "cities") {
      if ((fileCities ?? cities) == null) return;
    } else {
      if ((fileGifts ?? gifts) == null) return;
    }
    mainListScrollRef.current.scrollTop = y;
    pendingMainListScrollTop.current = null;
  }, [catalogReload, fileCities, cities, fileGifts, gifts, pipelineKey, linkedGiftsById]);

  useEffect(() => {
    if (pipelineKey !== "cities") return;
    const gift = selectedLinkedGiftId ? linkedGiftsById[selectedLinkedGiftId] : null;
    const giftImage = gift?.imageFileName?.trim();
    if (!giftImage || !gameDataPaths?.projectRoot) {
      setSelectedLinkedGiftImage(null);
      return;
    }
    let cancelled = false;
    const loadImage = async () => {
      try {
        const blob = await localAgent.readBinary(
          gameDataPaths.projectRoot,
          `Assets/StreamingAssets/Gifts/Images/${giftImage}`
        );
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        setSelectedLinkedGiftImage(objectUrl);
      } catch {
        if (!cancelled) setSelectedLinkedGiftImage(null);
      }
    };
    void loadImage();
    return () => {
      cancelled = true;
      if (selectedLinkedGiftImage) URL.revokeObjectURL(selectedLinkedGiftImage);
    };
  }, [pipelineKey, selectedLinkedGiftId, linkedGiftsById, gameDataPaths, selectedLinkedGiftImage]);

  useEffect(() => {
    if (pipelineKey !== "gift_images" && pipelineKey !== "cities") return;
    let cancelled = false;
    const loadStyles = async () => {
      try {
        const res = await fetchApi("/storyboard/styles");
        if (!res.ok) return;
        const data = (await res.json()) as Style[];
        if (!cancelled) {
          setGiftStyles(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) setGiftStyles([]);
      }
    };
    void loadStyles();
    return () => {
      cancelled = true;
    };
  }, [pipelineKey]);

  useEffect(() => {
    if (pipelineKey !== "cities") {
      locationUpdateImageStyleHydrated.current = false;
      return;
    }
    if (giftStyles.length === 0) return;
    if (!locationUpdateImageStyleHydrated.current) {
      locationUpdateImageStyleHydrated.current = true;
      const saved = readImagegenMainStyleId();
      if (saved && giftStyles.some((s) => s.id === saved)) {
        setLocationUpdateImageStyleId(saved);
        return;
      }
    }
    writeImagegenMainStyleId(locationUpdateImageStyleId || "");
  }, [pipelineKey, giftStyles, locationUpdateImageStyleId]);

  useEffect(() => {
    if (pipelineKey !== "gift_images") return;
    if (giftImagesDeepLinkQ) {
      setGiftSearch(giftImagesDeepLinkQ);
      setSelectedGiftIds((prev) => ({ ...prev, [giftImagesDeepLinkQ]: true }));
    }
    if (giftImagesDeepLinkTab === "update") setGiftToolTab("update");
  }, [pipelineKey, giftImagesDeepLinkQ, giftImagesDeepLinkTab]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchApi(`/games/${gameKey}/pipelines`);
        if (res.ok) {
          const data = (await res.json()) as PipelineInfo[];
          const match = data.find((p) => p.key === pipelineKey) || null;
          setPipeline(match);
        }
      } catch {
        setPipeline(null);
      }
    };
    void load();
  }, [gameKey, pipelineKey]);

  useEffect(() => {
    const activeGifts = fileGifts ?? gifts;
    if (!activeGifts || pipelineKey !== "gift_images") return;
    const prevUrls = Object.values(imageBlobs);
    prevUrls.forEach((url) => URL.revokeObjectURL(url));
    setImageBlobs({});
    setImageErrors({});

    let cancelled = false;
    const loadImages = async () => {
      const entries: Array<[string, string]> = [];
      const projectRoot = gameDataPaths?.projectRoot || "";
      for (const gift of activeGifts) {
        const fn = gift.imageFileName?.trim();
        if (!fn || fn.toLowerCase().endsWith(".meta")) continue;
        if (gift.image_exists === false) {
          setImageErrors((prev) => ({ ...prev, [fn]: "File not found!" }));
          continue;
        }
        if (!projectRoot) continue;
        const relPath = `Assets/StreamingAssets/Gifts/Images/${fn}`;
        try {
          const blob = await localAgent.readBinary(projectRoot, relPath);
          if (cancelled) return;
          const objectUrl = URL.createObjectURL(blob);
          entries.push([fn, objectUrl]);
        } catch (err) {
          console.warn("[gift_images] readBinary failed", { projectRoot, relPath, filename: fn, err });
          // ignore image fetch failures
        }
      }
      if (!cancelled && entries.length > 0) {
        setImageBlobs((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    };
    void loadImages();
    return () => {
      cancelled = true;
    };
  }, [gifts, fileGifts, pipelineKey, catalogPath, gameKey, giftImageReload, gameDataPaths]);

  useEffect(() => {
    if (pipelineKey !== "cities") {
      const prevUrls = Object.values(locationUpdateImageBlobs);
      prevUrls.forEach((url) => URL.revokeObjectURL(url));
      setLocationUpdateImageBlobs({});
      setLocationUpdateImagesLoading(false);
      return;
    }
    const prevUrls = Object.values(locationUpdateImageBlobs);
    prevUrls.forEach((url) => URL.revokeObjectURL(url));
    setLocationUpdateImageBlobs({});

    const projectRoot = gameDataPaths?.projectRoot;
    const all = fileCities ?? cities;
    if (!projectRoot || !all?.length) {
      setLocationUpdateImagesLoading(false);
      return;
    }

    let cancelled = false;
    setLocationUpdateImagesLoading(true);

    const loadImages = async () => {
      const entries: Array<[string, string]> = [];
      for (const city of all) {
        const cid = city.name_id;
        if (!cid) continue;
        for (let idx = 0; idx < city.location_updates.length; idx++) {
          const u = city.location_updates[idx];
          const base = basenameOnly((u.image || "").trim()).trim();
          if (!base || !isSafeImageBasename(base)) continue;
          const relPath = `${REL_LOCATION_UPDATE_IMAGES_DIR}/${base}`;
          try {
            const blob = await localAgent.readBinary(projectRoot, relPath);
            if (cancelled) return;
            entries.push([locationUpdateRowKey(cid, idx), URL.createObjectURL(blob)]);
          } catch {
            // File missing or unreadable
          }
        }
      }
      if (!cancelled) {
        setLocationUpdateImageBlobs(Object.fromEntries(entries));
        setLocationUpdateImagesLoading(false);
      }
    };
    void loadImages();
    return () => {
      cancelled = true;
    };
  }, [pipelineKey, cities, fileCities, gameDataPaths, catalogReload]);

  useEffect(() => {
    if (pipelineKey === "gift_images") return;
    const loadInputs = async () => {
      try {
        const res = await fetchApi(`/games/${gameKey}/pipelines/${pipelineKey}/inputs`);
        if (!res.ok) return;
        const data = (await res.json()) as string[];
        setInputs(data);
        if (data.length > 0) setSelected((prev) => prev || data[0]);
      } catch {
        // Ignore input load errors.
      }
    };
    void loadInputs();
  }, [gameKey, pipelineKey]);

  const runPipeline = async () => {
    if (
      (pipelineKey === "gift_images" || pipelineKey === "cities") &&
      (gameDataLoadError || !catalogPath.trim())
    ) {
      setStatus(gameDataLoadError || "Project paths are not ready.");
      return;
    }
    if (pipelineKey !== "gift_images" && pipelineKey !== "cities" && !selected) {
      setStatus("Select an input file.");
      return;
    }
    setStatus("Running...");
    setResult(null);
    setGifts(null);
    setCities(null);
    setFileGifts(null);
    setFileCities(null);
    setFileError(null);
    setImagesDir(null);
    try {
      const res = await fetchApi(`/games/${gameKey}/pipelines/${pipelineKey}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:
          pipelineKey === "gift_images" || pipelineKey === "cities"
            ? JSON.stringify({ catalog_path: catalogPath.trim() })
            : JSON.stringify({ input_file: selected }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(errBody.detail || `Run failed: ${res.status}`);
      }
      const data = await res.json();
      if (pipelineKey === "gift_images") {
        const parsed = data as GiftRunResponse;
        setGifts(parsed.gifts || []);
        setImagesDir(parsed.images_dir);
      } else if (pipelineKey === "cities") {
        const parsed = data as CitiesRunResponse;
        setCities(parsed.cities || []);
      } else {
        setResult(JSON.stringify(data, null, 2));
      }
      setStatus("Done.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Run failed.";
      setStatus(`Error: ${message}`);
    }
  };

  const handleGenerateGiftImage = async (giftId: string) => {
    if (!gameDataPaths?.projectRoot) {
      setStatus("Local project path is not available.");
      return;
    }
    preserveMainListScrollForNextCatalogReload();
    setGeneratingGiftId(giftId);
    setStatus("Generating gift image...");
    try {
      const giftData = await readGiftCatalogRaw();
      const { key, items } = getGiftItems(giftData);
      const gift = items.find((g) => String(g["id"] || "").trim() === giftId);
      if (!gift) throw new Error("Gift not found.");
      const name = String(gift["displayName"] || gift["name"] || giftId).trim();
      const desc = String(gift["description"] || "").trim();
      const prompt = buildGiftImagePrompt(desc ? `${name}. ${desc}` : name);
      const base64 = await generateImageBytes(prompt, "low", activeProjectKeyForGame);
      const filename = `${giftId}.png`;
      await localAgent.writeBinary(
        gameDataPaths.projectRoot,
        `Assets/StreamingAssets/Gifts/Images/${filename}`,
        base64
      );
      gift["imageFileName"] = filename;
      setGiftItems(giftData, key, items);
      await writeGiftCatalogRaw(giftData);
      setCatalogReload((prev) => prev + 1);
      setGiftImageReload((prev) => prev + 1);
      appendPipelineLog(`image: ${REL_GIFT_IMAGES_DIR}/${filename} (generated) [gift ${giftId}]`);
      setStatus("Gift image generated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generate failed.";
      setStatus(`Error: ${message}`);
    } finally {
      setGeneratingGiftId(null);
    }
  };

  const openEditGift = (
    gift: Pick<GiftItem, "id" | "displayName" | "description" | "activityTags" | "priority" | "weight">
  ) => {
    setEditGiftId(gift.id || "");
    setEditGiftDisplayName(gift.displayName || "");
    setEditGiftDescription(gift.description || "");
    setEditGiftActivityTags((gift.activityTags || []).join(", "));
    setEditGiftPriority(String(gift.priority ?? 10));
    setEditGiftWeight(String(gift.weight ?? 2));
    setEditGiftImageFile(null);
    setEditGiftImageMode("keep");
    setEditGiftStatus(null);
    setShowEditGift(true);
  };

  const allGiftItems = fileGifts ?? gifts ?? [];
  const filteredGiftItems =
    pipelineKey === "gift_images" && giftSearch.trim()
      ? allGiftItems.filter((gift) => {
          const q = giftSearch.trim().toLowerCase();
          if (q.startsWith("city:")) {
            const cityQuery = q.slice("city:".length).trim();
            if (!cityQuery) return true;
            const citiesForGift = gift.id ? giftCityMap[gift.id] || [] : [];
            return citiesForGift.some((c) => c.name.toLowerCase().includes(cityQuery));
          }
          return (
            (gift.displayName || "").toLowerCase().includes(q) ||
            (gift.id || "").toLowerCase().includes(q) ||
            (gift.description || "").toLowerCase().includes(q)
          );
        })
      : allGiftItems;
  const allCityItems = fileCities ?? cities ?? [];
  const filteredCityItems =
    pipelineKey === "cities" && giftSearch.trim()
      ? allCityItems.filter((city) =>
          (city.display_name || city.name_id || "")
            .toLowerCase()
            .includes(giftSearch.trim().toLowerCase())
        )
      : allCityItems;

  const getCitiesSharedStylePrompt = (): string => {
    if (pipelineKey !== "cities") {
      return "";
    }
    const styleObj = giftStyles.find((s) => s.id === locationUpdateImageStyleId);
    return styleObj?.prompt?.trim() ?? "";
  };

  const buildGiftImagePrompt = (base: string): string => {
    const promptParts = [base.trim()];
    const stylePrompt = getCitiesSharedStylePrompt();
    if (stylePrompt) {
      promptParts.push(stylePrompt);
    }
    return `${promptParts.filter(Boolean).join(". ")}${GIFT_IMAGE_SINGLE_SUBJECT_SUFFIX}`;
  };

  useEffect(() => {
    if (pipelineKey !== "cities") {
      return;
    }
    hasAutoScrolledToSelectedCityRef.current = false;
    if (typeof window === "undefined") {
      return;
    }
    if (!activeProjectKeyForGame) {
      setSelectedCityIds({});
      setSelectedCityIdsHydrated(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(citiesSelectedStorageKey(activeProjectKeyForGame));
      if (!raw) {
        setSelectedCityIds({});
        setSelectedCityIdsHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const next: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (value === true) {
          next[key] = true;
        }
      }
      setSelectedCityIds(next);
    } catch {
      setSelectedCityIds({});
    }
    setSelectedCityIdsHydrated(true);
  }, [activeProjectKeyForGame, pipelineKey]);

  useEffect(() => {
    if (pipelineKey !== "cities" || !selectedCityIdsHydrated || !activeProjectKeyForGame || typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(
        citiesSelectedStorageKey(activeProjectKeyForGame),
        JSON.stringify(selectedCityIds)
      );
    } catch {
      // ignore persistence failures
    }
  }, [activeProjectKeyForGame, pipelineKey, selectedCityIds, selectedCityIdsHydrated]);

  useLayoutEffect(() => {
    if (pipelineKey !== "cities" || !selectedCityIdsHydrated || hasAutoScrolledToSelectedCityRef.current) {
      return;
    }
    const selectedCity = filteredCityItems.find((city) => city.name_id && selectedCityIds[city.name_id]);
    if (!selectedCity?.name_id || !mainListScrollRef.current) {
      return;
    }
    const selectorValue =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(selectedCity.name_id)
        : selectedCity.name_id.replace(/["\\]/g, "\\$&");
    const target = mainListScrollRef.current.querySelector<HTMLElement>(`[data-city-id="${selectorValue}"]`);
    if (!target) {
      return;
    }
    target.scrollIntoView({ block: "start", inline: "nearest" });
    hasAutoScrolledToSelectedCityRef.current = true;
  }, [filteredCityItems, pipelineKey, selectedCityIds, selectedCityIdsHydrated]);

  const createGiftInCatalogCore = async (opts: {
    giftId: string;
    displayName: string;
    description: string;
    activityTags: string[] | undefined;
    priority: number;
    weight: number;
    imageMode: "file" | "generate";
    imageFile: File | null;
    forceGenerate: boolean;
    /** If set, used as the image generation prompt instead of displayName + description (catalog text unchanged). */
    imagePrompt?: string;
  }) => {
    if (!gameDataPaths?.projectRoot) throw new Error("Local project path is not available.");
    const data = await readGiftCatalogRaw();
    const { key, items } = getGiftItems(data);
    const gid = opts.giftId.trim();
    if (items.find((g) => String(g.id || "").trim() === gid)) throw new Error("Gift id already exists.");
    if (opts.imageMode === "file" && !opts.imageFile) {
      throw new Error("Select an image file, or switch to Generate.");
    }
    const newGift: Record<string, unknown> = {
      id: gid,
      displayName: opts.displayName.trim() || gid,
      description: opts.description.trim(),
      activityTags: opts.activityTags ?? [],
      priority: opts.priority,
      weight: opts.weight,
      imageFileName: "",
    };
    let filename = "";
    const root = gameDataPaths.projectRoot;
    if (opts.imageMode === "file" && opts.imageFile) {
      const buffer = await opts.imageFile.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      const ext = `.${opts.imageFile.name.split(".").pop() || "png"}`;
      filename = `${gid}${ext}`;
      await localAgent.writeBinary(root, `Assets/StreamingAssets/Gifts/Images/${filename}`, base64);
    } else if (opts.imageMode === "generate" && opts.forceGenerate) {
      const display = String(newGift.displayName);
      const desc = String(newGift.description || "");
      const base =
        (opts.imagePrompt && opts.imagePrompt.trim()) || `${display}${desc ? `. ${desc}` : ""}`;
      const promptBase = buildGiftImagePrompt(base);
      const base64 = await generateImageBytes(promptBase, "low", activeProjectKeyForGame);
      filename = `${gid}.png`;
      await localAgent.writeBinary(root, `Assets/StreamingAssets/Gifts/Images/${filename}`, base64);
    }
    if (filename) newGift.imageFileName = filename;
    items.push(newGift);
    setGiftItems(data, key, items);
    await writeGiftCatalogRaw(data);
    appendPipelineLog(`data: gift catalog entry "${gid}" (${String(newGift.displayName || "")})`);
    if (filename) {
      appendPipelineLog(
        `image: ${REL_GIFT_IMAGES_DIR}/${filename} (${opts.imageMode === "file" ? "uploaded" : "generated"})`
      );
    }
  };

  const handleCreateGift = async (forceGenerate: boolean) => {
    if (!gameDataPaths?.projectRoot) {
      setCreateGiftStatus("Local project path is not available.");
      return;
    }
    if (!createGiftId.trim()) {
      setCreateGiftStatus("Gift id is required.");
      return;
    }
    const pr = Number.parseInt(createGiftPriority, 10);
    const w = Number.parseFloat(createGiftWeight);
    if (!Number.isFinite(pr)) {
      setCreateGiftStatus("Priority must be a valid number.");
      return;
    }
    if (!Number.isFinite(w)) {
      setCreateGiftStatus("Weight must be a valid number.");
      return;
    }
    if (createGiftImageMode === "file" && !createGiftImageFile) {
      setCreateGiftStatus("Select an image file, or switch to Generate.");
      return;
    }
    const tagsList = splitCsvToList(createGiftActivityTags);
    setCreateGiftStatus(forceGenerate ? "Creating + generating..." : "Creating...");
    try {
      preserveMainListScrollForNextCatalogReload();
      await createGiftInCatalogCore({
        giftId: createGiftId.trim(),
        displayName: createGiftDisplayName.trim() || createGiftId.trim(),
        description: createGiftDescription.trim(),
        activityTags: tagsList || [],
        priority: pr,
        weight: w,
        imageMode: createGiftImageMode,
        imageFile: createGiftImageFile,
        forceGenerate,
      });
      setCatalogReload((prev) => prev + 1);
      setGiftImageReload((prev) => prev + 1);

      setCreateGiftStatus("Gift created.");
      setShowCreateGift(false);
      setCreateGiftId("");
      setCreateGiftDisplayName("");
      setCreateGiftDescription("");
      setCreateGiftActivityTags("");
      setCreateGiftPriority("10");
      setCreateGiftWeight("2");
      setCreateGiftImageFile(null);
      setCreateGiftImageMode("file");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Create failed.";
      setCreateGiftStatus(message);
    }
  };

  const handleCreateAllMissingGifts = async () => {
    if (!gameDataPaths?.projectRoot) {
      setMissingGiftsPipelineStatus("Local project path is not available.");
      return;
    }
    const selected = allCityItems.filter((c) => selectedCityIds[c.name_id]);
    if (selected.length === 0) {
      setMissingGiftsPipelineStatus("Select at least one city using the checkboxes in the list.");
      return;
    }
    const missingById = new Map<string, { cityDisplay: string }>();
    for (const city of selected) {
      const cityDisplay = city.display_name || city.name_id || "City";
      for (const giftId of city.gift_ids) {
        const id = String(giftId || "").trim();
        if (!id || linkedGiftsById[id]) continue;
        if (!missingById.has(id)) missingById.set(id, { cityDisplay });
      }
    }
    if (missingById.size === 0) {
      setMissingGiftsPipelineStatus("No missing gifts: every gift id on the selected cities is already in the catalog.");
      return;
    }
    setIsCreatingMissingGifts(true);
    preserveMainListScrollForNextCatalogReload();
    setMissingGiftsPipelineStatus(`Creating ${missingById.size} missing gift(s) (same as red link: catalog + generated image)...`);
    let ok = 0;
    const errors: string[] = [];
    const pr = 10;
    const w = 2;
    for (const [giftId, ctx] of missingById) {
      try {
        const meta = deriveGiftMetadataForCity(giftId, ctx.cityDisplay);
        await createGiftInCatalogCore({
          giftId,
          displayName: meta.displayName,
          description: meta.description,
          activityTags: meta.activityTags,
          priority: pr,
          weight: w,
          imageMode: "generate",
          imageFile: null,
          forceGenerate: true,
          imagePrompt: meta.imagePrompt,
        });
        ok += 1;
        setCatalogReload((prev) => prev + 1);
        setGiftImageReload((prev) => prev + 1);
        setMissingGiftsPipelineStatus(`Created ${ok}/${missingById.size}: ${giftId}…`);
      } catch (e) {
        errors.push(`${giftId}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    setIsCreatingMissingGifts(false);
    if (errors.length === 0) {
      setMissingGiftsPipelineStatus(`Done. Created ${ok} gift(s) with generated images.`);
    } else {
      setMissingGiftsPipelineStatus(
        `Finished with issues. Created ${ok}, failed ${errors.length}: ${errors.slice(0, 3).join("; ")}${errors.length > 3 ? "…" : ""}`
      );
    }
  };

  const handleRelinkExistingLocationUpdates = async () => {
    if (!gameDataPaths?.projectRoot) {
      setRelinkExistingUpdatesStatus("Local project path is not available.");
      return;
    }
    const selected = allCityItems.filter((c) => selectedCityIds[c.name_id]);
    if (selected.length === 0) {
      setRelinkExistingUpdatesStatus("Select at least one city using the checkboxes in the list.");
      return;
    }
    setIsRelinkingExistingUpdates(true);
    preserveMainListScrollForNextCatalogReload();
    setRelinkExistingUpdatesStatus("Scanning placeholder location updates and relinking matching files...");
    try {
      const listing = await localAgent.listDir(gameDataPaths.projectRoot, REL_LOCATION_UPDATE_IMAGES_DIR);
      const existingFilenames = listing.entries
        .filter((entry) => entry.is_file)
        .map((entry) => entry.name)
        .filter((name) => !name.toLowerCase().endsWith(".meta"))
        .filter((name) => /\.(png|jpg|jpeg|webp)$/i.test(name))
        .filter((name) => !isPlaceholderLocationImage(name));
      if (existingFilenames.length === 0) {
        setRelinkExistingUpdatesStatus(`No existing files found under ${REL_LOCATION_UPDATE_IMAGES_DIR}.`);
        return;
      }

      const selectedIds = new Set(selected.map((city) => city.name_id).filter(Boolean));
      const claimedLower = new Set<string>();
      const citiesData = await readCitiesRaw();
      const citiesValue = citiesData["cities"];
      const citiesList = Array.isArray(citiesValue) ? (citiesValue as Record<string, unknown>[]) : [];
      let relinked = 0;
      let unresolved = 0;

      for (const city of citiesList) {
        const cityId = String(city.nameId || city.name_id || "").trim();
        if (!cityId || !selectedIds.has(cityId)) {
          continue;
        }
        const cityDisplay = String(city.displayName || city.display_name || cityId).trim();
        const rawUpdates = city.locationUpdates;
        const legacyUpdates = city.location_updates;
        const arr = Array.isArray(rawUpdates) ? rawUpdates : Array.isArray(legacyUpdates) ? legacyUpdates : null;
        if (!arr) {
          continue;
        }
        for (let i = 0; i < arr.length; i += 1) {
          const update = arr[i];
          if (!update || typeof update !== "object") {
            continue;
          }
          const text = String(update.text ?? "").trim();
          if (!text) {
            continue;
          }
          const base = basenameOnly(String(update.image ?? "").trim());
          if (!isPlaceholderLocationImage(base)) {
            continue;
          }
          const matched = findBestExistingLocationUpdateMatch(
            cityId,
            cityDisplay,
            i,
            text,
            existingFilenames,
            claimedLower
          );
          if (!matched) {
            unresolved += 1;
            continue;
          }
          claimedLower.add(matched.toLowerCase());
          update.image = jsonImagePathForLocationUpdate(matched);
          relinked += 1;
          appendPipelineLog(
            `location image: relinked placeholder to ${REL_LOCATION_UPDATE_IMAGES_DIR}/${matched} [${cityId}] #${i + 1}`
          );
        }
      }

      if (relinked > 0) {
        citiesData["cities"] = citiesList;
        await writeCitiesRaw(citiesData);
        setCatalogReload((prev) => prev + 1);
        appendPipelineLog(`data: cities.json — relinked ${relinked} existing location update image(s).`);
      }

      if (relinked === 0) {
        setRelinkExistingUpdatesStatus(
          unresolved > 0
            ? `No matches found for ${unresolved} placeholder location update(s).`
            : "No placeholder location update images needed relinking."
        );
      } else if (unresolved > 0) {
        setRelinkExistingUpdatesStatus(
          `Done. Relinked ${relinked} location update image(s); ${unresolved} placeholder row(s) still need a match.`
        );
      } else {
        setRelinkExistingUpdatesStatus(`Done. Relinked ${relinked} location update image(s).`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Relink failed.";
      setRelinkExistingUpdatesStatus(`Error: ${message}`);
      appendPipelineLog(`location update relink error: ${message}`);
    } finally {
      setIsRelinkingExistingUpdates(false);
    }
  };

  const handleTestExistingLocationUpdates = async () => {
    if (!gameDataPaths?.projectRoot) {
      setTestExistingUpdatesStatus("Local project path is not available.");
      return;
    }
    setIsTestingExistingUpdates(true);
    setTestExistingUpdatesStatus(`Scanning ${REL_LOCATION_UPDATE_IMAGES_DIR} for unused files...`);
    try {
      const listing = await localAgent.listDir(gameDataPaths.projectRoot, REL_LOCATION_UPDATE_IMAGES_DIR);
      const existingFilenames = listing.entries
        .filter((entry) => entry.is_file)
        .map((entry) => entry.name)
        .filter((name) => !name.toLowerCase().endsWith(".meta"))
        .filter((name) => /\.(png|jpg|jpeg|webp)$/i.test(name))
        .sort((a, b) => a.localeCompare(b));
      if (existingFilenames.length === 0) {
        setTestExistingUpdatesStatus(`No image files found under ${REL_LOCATION_UPDATE_IMAGES_DIR}.`);
        return;
      }

      const usedLower = new Set<string>();
      const citiesData = await readCitiesRaw();
      const citiesValue = citiesData["cities"];
      const citiesList = Array.isArray(citiesValue) ? (citiesValue as Record<string, unknown>[]) : [];
      for (const city of citiesList) {
        const rawUpdates = city.locationUpdates;
        const legacyUpdates = city.location_updates;
        const arr = Array.isArray(rawUpdates) ? rawUpdates : Array.isArray(legacyUpdates) ? legacyUpdates : null;
        if (!arr) {
          continue;
        }
        for (const update of arr) {
          if (!update || typeof update !== "object") {
            continue;
          }
          const base = basenameOnly(String(update.image ?? "").trim());
          if (!base || !/\.(png|jpg|jpeg|webp)$/i.test(base)) {
            continue;
          }
          usedLower.add(base.toLowerCase());
        }
      }

      const unused = existingFilenames.filter((name) => !usedLower.has(name.toLowerCase()));
      appendPipelineLog(
        unused.length === 0
          ? `location image test: all ${existingFilenames.length} file(s) under ${REL_LOCATION_UPDATE_IMAGES_DIR} are referenced in cities.json.`
          : `location image test: ${unused.length} unused file(s) under ${REL_LOCATION_UPDATE_IMAGES_DIR}: ${unused.join(", ")}`
      );
      if (unused.length === 0) {
        setTestExistingUpdatesStatus(
          `All good. ${existingFilenames.length} file(s) under ${REL_LOCATION_UPDATE_IMAGES_DIR} are referenced in cities.json.`
        );
        return;
      }
      setTestExistingUpdatesStatus(
        `Unused files (${unused.length}):\n${unused.join("\n")}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Test failed.";
      setTestExistingUpdatesStatus(`Error: ${message}`);
      appendPipelineLog(`location update test error: ${message}`);
    } finally {
      setIsTestingExistingUpdates(false);
    }
  };

  const handleEditGift = async () => {
    if (!gameDataPaths?.projectRoot) {
      setEditGiftStatus("Local project path is not available.");
      return;
    }
    if (!editGiftId.trim()) {
      setEditGiftStatus("Gift id is required.");
      return;
    }
    const pr = Number.parseInt(editGiftPriority, 10);
    const w = Number.parseFloat(editGiftWeight);
    if (!Number.isFinite(pr)) {
      setEditGiftStatus("Priority must be a valid number.");
      return;
    }
    if (!Number.isFinite(w)) {
      setEditGiftStatus("Weight must be a valid number.");
      return;
    }
    if (editGiftImageMode === "file" && !editGiftImageFile) {
      setEditGiftStatus("Select an image file, or choose Keep/Generate.");
      return;
    }

    const tagsList = splitCsvToList(editGiftActivityTags);

    setEditGiftStatus("Saving...");
    try {
      preserveMainListScrollForNextCatalogReload();
      const data = await readGiftCatalogRaw();
      const { key, items } = getGiftItems(data);
      const gift = items.find((g) => String(g.id || "").trim() === editGiftId.trim());
      if (!gift) throw new Error("Gift not found.");
      gift["displayName"] = editGiftDisplayName.trim();
      gift["description"] = editGiftDescription.trim();
      gift["activityTags"] = tagsList || [];
      gift["priority"] = pr;
      gift["weight"] = w;

      let filename = "";
      if (editGiftImageMode === "file" && editGiftImageFile) {
        const buffer = await editGiftImageFile.arrayBuffer();
        const base64 = arrayBufferToBase64(buffer);
        const ext = `.${editGiftImageFile.name.split(".").pop() || "png"}`;
        filename = `${editGiftId.trim()}${ext}`;
        await localAgent.writeBinary(
          gameDataPaths.projectRoot,
          `Assets/StreamingAssets/Gifts/Images/${filename}`,
          base64
        );
      } else if (editGiftImageMode === "generate") {
        const display = String(gift["displayName"] || editGiftId.trim());
        const desc = String(gift["description"] || "");
        const promptBase = `${display}${desc ? `. ${desc}` : ""}${GIFT_IMAGE_SINGLE_SUBJECT_SUFFIX}`;
        const base64 = await generateImageBytes(promptBase, "low", activeProjectKeyForGame);
        filename = `${editGiftId.trim()}.png`;
        await localAgent.writeBinary(
          gameDataPaths.projectRoot,
          `Assets/StreamingAssets/Gifts/Images/${filename}`,
          base64
        );
      }
      if (filename) gift["imageFileName"] = filename;
      setGiftItems(data, key, items);
      await writeGiftCatalogRaw(data);
      setCatalogReload((prev) => prev + 1);
      setGiftImageReload((prev) => prev + 1);
      appendPipelineLog(`data: gift catalog updated "${editGiftId.trim()}"`);
      if (filename) {
        appendPipelineLog(
          `image: ${REL_GIFT_IMAGES_DIR}/${filename} (${editGiftImageMode === "file" ? "uploaded" : "generated"})`
        );
      }

      setEditGiftStatus("Gift updated.");
      setShowEditGift(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed.";
      setEditGiftStatus(message);
    }
  };

  const handleAddGiftToCity = async (giftId: string, cityId: string) => {
    if (!gameDataPaths?.projectRoot) {
      setStatus("Local project path is not available.");
      return;
    }
    setStatus("Updating city...");
    try {
      preserveMainListScrollForNextCatalogReload();
      const data = await readCitiesRaw();
      const citiesValue = data["cities"];
      const citiesList = Array.isArray(citiesValue) ? (citiesValue as Record<string, unknown>[]) : [];
      const target = citiesList.find(
        (c) => String(c.nameId || c.name_id || "").trim() === cityId
      );
      if (!target) throw new Error("City not found.");
      const giftIds = Array.isArray(target.giftIds) ? target.giftIds.map(String) : [];
      if (!giftIds.includes(giftId)) giftIds.push(giftId);
      target.giftIds = giftIds;
      data["cities"] = citiesList;
      await writeCitiesRaw(data);
      setCatalogReload((prev) => prev + 1);
      appendPipelineLog(`data: cities.json — added gift "${giftId}" to city "${cityId}".`);
      setStatus("City updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed.";
      setStatus(`Error: ${message}`);
    }
  };

  const buildCitiesPrompt = () => {
    const count = Number.parseInt(batchCityCount, 10);
    const existingCities = (cities ?? []).map((c) => `${c.name_id} (${c.display_name || c.name_id})`);
    const existingGifts = (gifts ?? []).map((g) => g.id).filter(Boolean);
    return `You are creating new city entries for a game.\n\n` +
      `Existing cities (do not repeat):\n${existingCities.join(", ") || "None"}\n\n` +
      `Existing gift ids (avoid duplicates):\n${existingGifts.join(", ") || "None"}\n\n` +
      `Create ${Number.isFinite(count) ? count : 5} new cities around the world that are NOT in the list. ` +
      `For each city, create exactly 5 gifts. Provide concise display names and descriptions. ` +
      `Also create exactly 3 locationUpdates per city. Each locationUpdate must be a short casual travel text message, warm and playful, max 150 characters. ` +
      `For each locationUpdate include an image field set to "placeholder.png". ` +
      `Return JSON only with the schema:\n` +
      `{ "cities": [ { "cityId": string, "displayName": string, "locationUpdates": [ { "text": string, "image": string } ], "gifts": [ { "giftId": string, "displayName": string, "description": string, "activityTags": [string] } ] } ] }`;
  };

  const handleBatchCreatePrompt = () => {
    setBatchCityPrompt(buildCitiesPrompt());
    setBatchCityStatus(null);
  };

  const handleExecuteBatchCreate = async () => {
    if (!gameDataPaths?.projectRoot) {
      setBatchCityStatus("Local project path not available.");
      return;
    }
    const count = Number.parseInt(batchCityCount, 10);
    if (!Number.isFinite(count) || count <= 0) {
      setBatchCityStatus("Enter a valid number of cities.");
      return;
    }
    if (!batchCityPrompt.trim()) {
      setBatchCityStatus("Prompt is required.");
      return;
    }
    setIsBatchCreating(true);
    setBatchCityStatus("Running batch creation...");
    try {
      preserveMainListScrollForNextCatalogReload();
      const giftsData = await readGiftCatalogRaw();
      const { key, items } = getGiftItems(giftsData);
      const citiesData = await readCitiesRaw();
      const citiesValue = citiesData["cities"];
      const citiesList = Array.isArray(citiesValue) ? (citiesValue as Record<string, unknown>[]) : [];
      const existingCityIds = citiesList
        .map((c) => String(c.nameId || c.name_id || "").trim())
        .filter(Boolean);
      const existingGiftIds = items.map((g) => String(g.id || "").trim()).filter(Boolean);

      const res = await fetchApi(`/games/${gameKey}/pipelines/cities/batch_plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count,
          prompt: batchCityPrompt.trim(),
          existing_city_ids: existingCityIds,
          existing_gift_ids: existingGiftIds,
        }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(errBody.detail || `Batch failed: ${res.status}`);
      }
      const data = (await res.json()) as {
        created_cities?: Record<string, unknown>[];
        created_gifts?: Record<string, unknown>[];
      };
      const createdCities = Array.isArray(data.created_cities) ? data.created_cities : [];
      const createdGifts = Array.isArray(data.created_gifts) ? data.created_gifts : [];
      const invalidCreatedCities = createdCities
        .map((city) => {
          const cityId = String(city["nameId"] || city["name_id"] || "").trim() || "(unknown city)";
          const rawUpdates = Array.isArray(city["locationUpdates"])
            ? (city["locationUpdates"] as Record<string, unknown>[])
            : Array.isArray(city["location_updates"])
              ? (city["location_updates"] as Record<string, unknown>[])
              : [];
          return { cityId, updateCount: rawUpdates.filter((update) => String(update?.["text"] ?? "").trim()).length };
        })
        .filter((city) => city.updateCount < 3);
      if (invalidCreatedCities.length > 0) {
        throw new Error(
          `Batch plan returned city entries without 3 location updates: ${invalidCreatedCities
            .map((city) => `${city.cityId} (${city.updateCount})`)
            .join(", ")}`
        );
      }
      const existingLocationUpdateLower = new Set<string>();
      try {
        const { entries } = await localAgent.listDir(gameDataPaths.projectRoot, REL_LOCATION_UPDATE_IMAGES_DIR);
        for (const entry of entries) {
          if (!entry.is_file) continue;
          const name = entry.name.trim();
          if (!name || name.toLowerCase().endsWith(".meta")) continue;
          existingLocationUpdateLower.add(name.toLowerCase());
        }
      } catch {
        // Folder may not exist yet; writeBinary will create it on demand.
      }
      for (const gift of createdGifts) {
        const gid = String(gift["id"] || "").trim();
        if (!gid) continue;
        const name = String(gift["displayName"] || gift["name"] || gid).trim();
        const desc = String(gift["description"] || "").trim();
        const prompt = buildGiftImagePrompt(desc ? `${name}. ${desc}` : name);
        const base64 = await generateImageBytes(prompt, "low", activeProjectKeyForGame);
        const filename = `${gid}.png`;
        await localAgent.writeBinary(
          gameDataPaths.projectRoot,
          `Assets/StreamingAssets/Gifts/Images/${filename}`,
          base64
        );
        gift["imageFileName"] = filename;
        items.push(gift);
        appendPipelineLog(`image: ${REL_GIFT_IMAGES_DIR}/${filename} (generated) [batch gift ${gid}]`);
      }
      for (const city of createdCities) {
        const cityId = String(city["nameId"] || city["name_id"] || "").trim();
        const rawUpdates = Array.isArray(city["locationUpdates"])
          ? (city["locationUpdates"] as Record<string, unknown>[]).slice(0, 3)
          : Array.isArray(city["location_updates"])
            ? (city["location_updates"] as Record<string, unknown>[]).slice(0, 3)
            : [];
        const normalizedUpdates: Array<{ text: string; image: string }> = [];
        for (let idx = 0; idx < rawUpdates.length; idx += 1) {
          const update = rawUpdates[idx];
          const text = String(update?.["text"] ?? "").trim();
          if (!text) {
            continue;
          }
          const rawImage = String(update?.["image"] ?? "").trim();
          const base = basenameOnly(rawImage).trim();
          const useSemanticBasename = isPlaceholderLocationImage(base) || !base || !isSafeImageBasename(base);
          const semanticSuggested = suggestLocationUpdateBasename(cityId, idx, text);
          const diskBasename = useSemanticBasename
            ? uniqueLocationUpdateBasename(semanticSuggested, existingLocationUpdateLower)
            : base;
          const promptParts = [text];
          const stylePrompt = getCitiesSharedStylePrompt();
          if (stylePrompt) {
            promptParts.push(stylePrompt);
          }
          promptParts.push(LOCATION_UPDATE_IMAGE_SCENE_CONSTRAINTS);
          const imagePrompt = promptParts.join(". ");
          const imageBase64 = await generateImageBytes(imagePrompt, "low", activeProjectKeyForGame);
          await localAgent.writeBinary(
            gameDataPaths.projectRoot,
            `${REL_LOCATION_UPDATE_IMAGES_DIR}/${diskBasename}`,
            imageBase64
          );
          existingLocationUpdateLower.add(diskBasename.toLowerCase());
          normalizedUpdates.push({
            text,
            image: jsonImagePathForLocationUpdate(diskBasename),
          });
          appendPipelineLog(`image: ${REL_LOCATION_UPDATE_IMAGES_DIR}/${diskBasename} (generated) [batch city ${cityId}] #${idx + 1}`);
        }
        city["locationUpdates"] = normalizedUpdates;
        citiesList.push(city);
      }
      citiesData["cities"] = citiesList;
      setGiftItems(giftsData, key, items);
      await writeGiftCatalogRaw(giftsData);
      await writeCitiesRaw(citiesData);
      setCatalogReload((prev) => prev + 1);
      setGiftImageReload((prev) => prev + 1);
      appendPipelineLog(
        `data: batch create — ${createdGifts.length} gift(s) in catalog, ${createdCities.length} new cities in cities.json.`
      );
      setBatchCityStatus(`Created ${createdCities.length} cities.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Batch failed.";
      setBatchCityStatus(`Error: ${message}`);
    } finally {
      setIsBatchCreating(false);
    }
  };

  const buildLocationUpdatePrompt = (selected: CityItem[], count: number) => {
    const cityLines = selected.map(
      (c) => `- ${c.name_id} (${c.display_name || c.name_id})`
    );
    return (
      "Generate locationUpdates (it is a text message you send your friend while traveling)for the following cities. \n\n" +
      "Each locationUpdate should feel like a casual text sent to a friend while traveling. \n" +
      "Describe a small moment (what you're doing) and include a fun or iconic detail about the place you can learn about. \n" +
      "Keep it warm, personal, and playful. \n" +
      `Each city must include exactly ${count} updates. \n` +
      "Max 150 characters. \n" +
     
      cityLines.join("\n") +
      "\n\nReturn JSON only with schema: " +
      `{ "cities": [ { "cityId": string, "locationUpdates": [ { "text": string, "image": string } ] } ] }`
    );
  };

  const handleBuildLocationPrompt = () => {
    if (locationUpdateAction === "update_images" || locationUpdateAction === "recreate_images") {
      setUpdateLocStatus("Build prompt applies to Add new or Append new only.");
      return;
    }
    const selected = allCityItems.filter((c) => selectedCityIds[c.name_id]);
    if (selected.length === 0) {
      setUpdateLocStatus("Select at least one city.");
      return;
    }
    const parsedCount = Number.parseInt(updateLocCount, 10);
    const normalized = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 3;
    setUpdateLocPrompt(buildLocationUpdatePrompt(selected, normalized));
    setUpdateLocStatus(null);
  };

  const handleExecuteLocationUpdateImages = async (
    recreateExisting: boolean,
    onlyRow?: { cityId: string; index: number }
  ) => {
    if (!gameDataPaths?.projectRoot) {
      setUpdateLocStatus("Local project path not available.");
      return;
    }
    const root = gameDataPaths.projectRoot;
    const selectedIds = new Set(
      allCityItems.filter((c) => selectedCityIds[c.name_id]).map((c) => c.name_id)
    );
    if (onlyRow) {
      if (!selectedIds.has(onlyRow.cityId)) {
        setUpdateLocStatus("Select this city with the checkbox first.");
        return;
      }
    } else if (selectedIds.size === 0) {
      setUpdateLocStatus("Select at least one city.");
      return;
    }
    preserveMainListScrollForNextCatalogReload();
    const existingLower = new Set<string>();
    try {
      const { entries } = await localAgent.listDir(root, REL_LOCATION_UPDATE_IMAGES_DIR);
      for (const e of entries) {
        if (!e.is_file) continue;
        if (e.name.toLowerCase().endsWith(".meta")) continue;
        existingLower.add(e.name.toLowerCase());
      }
    } catch {
      // Folder may not exist yet; treat as empty.
    }
    setIsUpdatingLoc(true);
    setUpdateLocStatus(
      onlyRow
        ? "Recreating this location image..."
        : recreateExisting
          ? "Regenerating location update images (overwrite if present)..."
          : "Scanning location updates for missing images..."
    );
    let generated = 0;
    let skipped = 0;
    try {
      const citiesData = await readCitiesRaw();
      const citiesValue = citiesData["cities"];
      const citiesList = Array.isArray(citiesValue) ? (citiesValue as Record<string, unknown>[]) : [];
      for (const city of citiesList) {
        const cityId = String(city.nameId || city.name_id || "").trim();
        if (!cityId || !selectedIds.has(cityId)) continue;
        if (onlyRow && cityId !== onlyRow.cityId) continue;
        const rawUpdates = city.locationUpdates;
        const arr = Array.isArray(rawUpdates) ? (rawUpdates as Record<string, unknown>[]) : [];
        for (let i = 0; i < arr.length; i++) {
          if (onlyRow && i !== onlyRow.index) continue;
          const u = arr[i];
          if (!u || typeof u !== "object") continue;
          const text = String(u.text ?? "").trim();
          if (!text) continue;
          const rawImage = String(u.image ?? "").trim();
          const base = basenameOnly(rawImage).trim();
          const isPlaceholder = isPlaceholderLocationImage(base);
          const useSemanticBasename = isPlaceholder || !base || !isSafeImageBasename(base);
          const semanticSuggested = suggestLocationUpdateBasename(cityId, i, text);
          const diskBasename = useSemanticBasename
            ? recreateExisting
              ? semanticSuggested
              : uniqueLocationUpdateBasename(semanticSuggested, existingLower)
            : base;
          if (!recreateExisting && existingLower.has(diskBasename.toLowerCase())) {
            if (isPlaceholder) {
              u.image = jsonImagePathForLocationUpdate(diskBasename);
              appendPipelineLog(
                `location image: replaced placeholder with existing ${REL_LOCATION_UPDATE_IMAGES_DIR}/${diskBasename} [${cityId}]`
              );
            } else {
              skipped += 1;
              appendPipelineLog(
                `location image skip (exists): ${REL_LOCATION_UPDATE_IMAGES_DIR}/${diskBasename} [${cityId}]`
              );
            }
            continue;
          }
          const notes = locationUpdateImageGenNotes.trim();
          const styleObj = giftStyles.find((s) => s.id === locationUpdateImageStyleId);
          const stylePrompt = styleObj?.prompt?.trim() ?? "";
          const promptParts = [text];
          if (notes) promptParts.push(notes);
          if (stylePrompt) promptParts.push(stylePrompt);
          promptParts.push(LOCATION_UPDATE_IMAGE_SCENE_CONSTRAINTS);
          const imagePrompt = promptParts.join(". ");
          const base64 = await generateImageBytes(imagePrompt, "low", activeProjectKeyForGame);
          const rel = `${REL_LOCATION_UPDATE_IMAGES_DIR}/${diskBasename}`;
          const alreadyOnDisk = existingLower.has(diskBasename.toLowerCase());
          await localAgent.writeBinary(root, rel, base64);
          const storedRel = jsonImagePathForLocationUpdate(diskBasename);
          u.image = storedRel;
          existingLower.add(diskBasename.toLowerCase());
          generated += 1;
          const verb =
            recreateExisting && alreadyOnDisk ? "regenerated" : "generated";
          appendPipelineLog(
            `image: ${rel} (${verb}${stylePrompt ? " + preset style" : ""}${notes ? " + notes" : ""}) [${cityId}] → ${storedRel}`
          );
        }
      }
      citiesData["cities"] = citiesList;
      await writeCitiesRaw(citiesData);
      setCatalogReload((prev) => prev + 1);
      if (onlyRow) {
        appendPipelineLog(
          generated > 0
            ? `data: cities.json — location image recreated [${onlyRow.cityId}] #${onlyRow.index + 1}.`
            : `data: cities.json — location image row skipped [${onlyRow.cityId}] #${onlyRow.index + 1} (empty text).`
        );
        setUpdateLocStatus(
          generated > 0 ? "Image recreated (style + notes from the left pane)." : "Nothing to recreate (empty update text)."
        );
      } else {
        appendPipelineLog(
          recreateExisting
            ? `data: cities.json — location update images done (${generated} regenerated or created).`
            : `data: cities.json — location update images done (${generated} generated, ${skipped} already on disk).`
        );
        setUpdateLocStatus(
          recreateExisting
            ? `Done. ${generated} image(s) regenerated or created (existing files overwritten in place).`
            : `Done. Generated ${generated} image(s); skipped ${skipped} (file already present).`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed.";
      setUpdateLocStatus(`Error: ${message}`);
      appendPipelineLog(`location update images error: ${message}`);
    } finally {
      setIsUpdatingLoc(false);
    }
  };

  const handleExecuteLocationUpdates = async () => {
    if (!gameDataPaths?.projectRoot) {
      setUpdateLocStatus("Local project path not available.");
      return;
    }
    if (locationUpdateAction === "update_images" || locationUpdateAction === "recreate_images") {
      await handleExecuteLocationUpdateImages(locationUpdateAction === "recreate_images", undefined);
      return;
    }
    const selected = allCityItems.filter((c) => selectedCityIds[c.name_id]);
    if (selected.length === 0) {
      setUpdateLocStatus("Select at least one city.");
      return;
    }
    const count = Number.parseInt(updateLocCount, 10);
    if (!Number.isFinite(count) || count <= 0) {
      setUpdateLocStatus("Enter a valid number of updates.");
      return;
    }
    if (!updateLocPrompt.trim()) {
      setUpdateLocStatus("Prompt is required.");
      return;
    }
    const replaceExisting = locationUpdateAction === "add_new";
    preserveMainListScrollForNextCatalogReload();
    setIsUpdatingLoc(true);
    setUpdateLocStatus("Updating locationUpdates and generating images...");
    try {
      const res = await fetchApi(`/games/${gameKey}/pipelines/cities/location_plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city_ids: selected.map((c) => c.name_id),
          prompt: updateLocPrompt.trim(),
          count,
        }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(errBody.detail || `Update failed: ${res.status}`);
      }
      const payload = (await res.json()) as { updates?: Record<string, CityUpdate[]> };
      const updatesByCity = payload.updates || {};
      const citiesData = await readCitiesRaw();
      const citiesValue = citiesData["cities"];
      const citiesList = Array.isArray(citiesValue) ? (citiesValue as Record<string, unknown>[]) : [];
      const existingLower = new Set<string>();
      try {
        const { entries } = await localAgent.listDir(gameDataPaths.projectRoot, REL_LOCATION_UPDATE_IMAGES_DIR);
        for (const entry of entries) {
          if (!entry.is_file) continue;
          const name = entry.name.trim();
          if (!name || name.toLowerCase().endsWith(".meta")) continue;
          existingLower.add(name.toLowerCase());
        }
      } catch {
        // Folder may not exist yet; writeBinary will create it on demand.
      }
      let touched = 0;
      let generated = 0;
      for (const city of citiesList) {
        const cityId = String(city.nameId || city.name_id || "").trim();
        if (!cityId) continue;
        const incoming = updatesByCity[cityId] || [];
        if (incoming.length === 0) continue;
        touched += 1;
        const currentExisting = Array.isArray(city.locationUpdates) ? (city.locationUpdates as Record<string, unknown>[]) : [];
        const baseIndex = replaceExisting ? 0 : currentExisting.length;
        const normalizedIncoming: CityUpdate[] = [];
        for (let idx = 0; idx < incoming.length; idx += 1) {
          const update = incoming[idx];
          const text = String(update?.text ?? "").trim();
          if (!text) {
            continue;
          }
          const rawImage = String(update?.image ?? "").trim();
          const base = basenameOnly(rawImage).trim();
          const useSemanticBasename = isPlaceholderLocationImage(base) || !base || !isSafeImageBasename(base);
          const semanticSuggested = suggestLocationUpdateBasename(cityId, baseIndex + idx, text);
          const requestedBasename = useSemanticBasename ? semanticSuggested : base;
          const diskBasename = uniqueLocationUpdateBasename(requestedBasename, existingLower);
          const notes = locationUpdateImageGenNotes.trim();
          const styleObj = giftStyles.find((s) => s.id === locationUpdateImageStyleId);
          const stylePrompt = styleObj?.prompt?.trim() ?? "";
          const promptParts = [text];
          if (notes) promptParts.push(notes);
          if (stylePrompt) promptParts.push(stylePrompt);
          promptParts.push(LOCATION_UPDATE_IMAGE_SCENE_CONSTRAINTS);
          const imagePrompt = promptParts.join(". ");
          const imageBase64 = await generateImageBytes(imagePrompt, "low", activeProjectKeyForGame);
          await localAgent.writeBinary(
            gameDataPaths.projectRoot,
            `${REL_LOCATION_UPDATE_IMAGES_DIR}/${diskBasename}`,
            imageBase64
          );
          existingLower.add(diskBasename.toLowerCase());
          normalizedIncoming.push({
            text,
            image: jsonImagePathForLocationUpdate(diskBasename),
          });
          generated += 1;
          appendPipelineLog(
            `image: ${REL_LOCATION_UPDATE_IMAGES_DIR}/${diskBasename} (generated) [${cityId}]`
          );
        }
        if (replaceExisting) {
          city.locationUpdates = normalizedIncoming;
        } else {
          const existing = Array.isArray(city.locationUpdates) ? city.locationUpdates : [];
          city.locationUpdates = [...existing, ...normalizedIncoming];
        }
      }
      citiesData["cities"] = citiesList;
      await writeCitiesRaw(citiesData);
      setCatalogReload((prev) => prev + 1);
      appendPipelineLog(
        `data: cities.json — locationUpdates (${replaceExisting ? "replace" : "append"}) for ${touched} city/cities via LLM plan; generated ${generated} image(s).`
      );
      setUpdateLocStatus(`locationUpdates updated. Generated ${generated} image(s).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed.";
      setUpdateLocStatus(`Error: ${message}`);
      appendPipelineLog(`locationUpdates LLM error: ${message}`);
    } finally {
      setIsUpdatingLoc(false);
    }
  };

  const handleUpdateGiftImages = async () => {
    if (!gameDataPaths?.projectRoot) {
      setGiftUpdateStatus("Local project path not available.");
      return;
    }
    const selectedIds = Object.entries(selectedGiftIds)
      .filter(([, checked]) => checked)
      .map(([id]) => id);
    if (selectedIds.length === 0) {
      setGiftUpdateStatus("Select at least one gift.");
      return;
    }
    preserveMainListScrollForNextCatalogReload();
    const selectedStyle = giftStyles.find((s) => s.id === giftStyleId);
    setIsGiftUpdating(true);
    setGiftUpdateStatus(null);
    try {
      const data = await readGiftCatalogRaw();
      const { key, items } = getGiftItems(data);
      const errors: string[] = [];
      for (const gift of items) {
        const gid = String(gift.id || "").trim();
        if (!gid || !selectedIds.includes(gid)) continue;
        const name = String(gift.displayName || gift.name || gid).trim();
        const desc = String(gift.description || "").trim();
        const promptParts = [name];
        if (desc) promptParts.push(desc);
        if (selectedStyle?.prompt) promptParts.push(selectedStyle.prompt);
        if (giftStyleMode) promptParts.push(`Style mode: ${giftStyleMode}`);
        if (giftStyleExtra.trim()) promptParts.push(giftStyleExtra.trim());
        const prompt = `${promptParts.filter(Boolean).join(". ")}${GIFT_IMAGE_SINGLE_SUBJECT_SUFFIX}`;
        try {
          const base64 = await generateImageBytes(prompt, giftStyleQuality, activeProjectKeyForGame);
          const filename = `${gid}.png`;
          await localAgent.writeBinary(
            gameDataPaths.projectRoot,
            `Assets/StreamingAssets/Gifts/Images/${filename}`,
            base64
          );
          gift["imageFileName"] = filename;
          appendPipelineLog(`image: ${REL_GIFT_IMAGES_DIR}/${filename} (generated) [batch update gift ${gid}]`);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Update failed.";
          errors.push(`Gift ${gid}: ${message}`);
        }
      }
      setGiftItems(data, key, items);
      await writeGiftCatalogRaw(data);
      setCatalogReload((prev) => prev + 1);
      setGiftImageReload((prev) => prev + 1);
      if (errors.length > 0) {
        setGiftUpdateStatus(`Updated with ${errors.length} errors: ${errors.join(" | ")}`);
      } else {
        setGiftUpdateStatus("Images updated.");
      }
      setSelectedGiftIds({});
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed.";
      setGiftUpdateStatus(`Error: ${message}`);
    } finally {
      setIsGiftUpdating(false);
    }
  };

  const isSplitPipeline = pipelineKey === "gift_images" || pipelineKey === "cities";

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        padding: "0 1rem",
        boxSizing: "border-box",
        ...(isSplitPipeline
          ? {
              margin: 0,
              height: "100dvh",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
              overflowX: "hidden",
            }
          : { margin: "2rem 0", maxWidth: "100vw" }),
      }}
    >
      {isSplitPipeline ? (
        <>
          <div style={{ flexShrink: 0, paddingTop: "0.35rem" }}>
            <h1 style={{ margin: "0 0 0.35rem" }}>{pipeline?.name ?? pipelineKey}</h1>
            {pipeline?.description && (
              <p style={{ margin: "0 0 0.15rem", color: "var(--muted, #94a3b8)", fontSize: 14 }}>
                {pipeline.description}
              </p>
            )}
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowX: "hidden",
              overflowY:
                pipelineKey === "cities" && isSplitPipeline ? "hidden" : "auto",
              marginTop: "0.25rem",
              ...(pipelineKey === "cities" && isSplitPipeline
                ? { display: "flex", flexDirection: "column" }
                : {}),
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isSplitPipeline ? "minmax(0, 25%) minmax(0, 75%)" : "25% 75%",
                gap: "1rem",
                alignItems: isSplitPipeline ? "stretch" : "start",
                width: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                ...(pipelineKey === "cities" && isSplitPipeline
                  ? { flex: 1, minHeight: 0 }
                  : {}),
              }}
            >
          <div
            style={{
              background: "rgba(15, 23, 42, 0.6)",
              borderRadius: 8,
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              minWidth: 0,
              ...(isSplitPipeline && pipelineKey === "cities"
                ? { minHeight: 0, overflowY: "auto" }
                : isSplitPipeline
                  ? { minHeight: 0, overflowY: "visible" }
                  : {}),
            }}
          >
            <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
              <div>
                <strong style={{ color: "var(--foreground, #e2e8f0)" }}>Active project</strong>:{" "}
                {activeProjectKeyForGame || "—"}
              </div>
              {gameDataPaths && (
                <div style={{ marginTop: "0.5rem", wordBreak: "break-all" }}>
                  <div>
                    <strong>Project root</strong>: {gameDataPaths.projectRoot}
                  </div>
                  <div style={{ marginTop: "0.35rem" }}>
                    <strong>Gift catalog</strong>: {gameDataPaths.giftCatalogJson}
                    {gameDataPaths.giftCatalogJsonExists ? " ✓" : " ✗"}
                  </div>
                  <div style={{ marginTop: "0.35rem" }}>
                    <strong>Cities</strong>: {gameDataPaths.citiesJson}
                    {gameDataPaths.citiesJsonExists ? " ✓" : " ✗"}
                  </div>
                </div>
              )}
            </div>
            {gameDataLoadError && (
              <p style={{ margin: 0, color: "#fca5a5", fontSize: 13 }}>{gameDataLoadError}</p>
            )}
            {localAgentError && !gameDataLoadError && (
              <p style={{ margin: 0, color: "#fca5a5", fontSize: 13 }}>{localAgentError}</p>
            )}
            {pipelineKey === "cities" && giftCatalogMissingForCities && !gameDataLoadError && (
              <p style={{ margin: 0, color: "#fbbf24", fontSize: 13 }}>
                Gift catalog not found at {gameDataPaths?.giftCatalogJson}. City→gift links will not match until
                it exists.
              </p>
            )}
            {pipelineKey === "gift_images" && (
              <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.75rem" }}>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className={giftToolTab === "create" ? "sidebar-tab active" : "sidebar-tab"}
                    onClick={() => setGiftToolTab("create")}
                  >
                    Create gift
                  </button>
                  <button
                    type="button"
                    className={giftToolTab === "update" ? "sidebar-tab active" : "sidebar-tab"}
                    onClick={() => setGiftToolTab("update")}
                  >
                    Update images
                  </button>
                </div>
                {giftToolTab === "create" && (
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateGiftImageFile(null);
                        setCreateGiftImageMode("file");
                        setShowCreateGift(true);
                      }}
                    >
                      Create gift
                    </button>
                  </div>
                )}
                {giftToolTab === "update" && (
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    <div style={{ fontWeight: 600 }}>Update images (selected)</div>
                    <label style={{ display: "grid", gap: "0.25rem" }}>
                      <span>Style</span>
                      <select value={giftStyleId} onChange={(e) => setGiftStyleId(e.target.value)}>
                        <option value="">None</option>
                        {giftStyles.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: "0.25rem" }}>
                      <span>Quality</span>
                      <select value={giftStyleQuality} onChange={(e) => setGiftStyleQuality(e.target.value)}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: "0.25rem" }}>
                      <span>Style mode</span>
                      <select value={giftStyleMode} onChange={(e) => setGiftStyleMode(e.target.value)}>
                        <option value="natural">Natural</option>
                        <option value="vivid">Vivid</option>
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: "0.25rem" }}>
                      <span>Extra style notes</span>
                      <textarea
                        rows={4}
                        value={giftStyleExtra}
                        onChange={(e) => setGiftStyleExtra(e.target.value)}
                        placeholder="e.g. watercolor, cozy lighting, pastel palette"
                      />
                    </label>
                    <button type="button" onClick={handleUpdateGiftImages} disabled={isGiftUpdating}>
                      {isGiftUpdating ? "Updating..." : "Update images"}
                    </button>
                    {giftUpdateStatus && (
                      <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>{giftUpdateStatus}</div>
                    )}
                  </div>
                )}
              </div>
            )}
            {pipelineKey === "cities" && (
              <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.75rem" }}>
                <label style={{ display: "grid", gap: "0.25rem" }}>
                  <span>Style</span>
                  <select
                    value={locationUpdateImageStyleId}
                    onChange={(e) => setLocationUpdateImageStyleId(e.target.value)}
                  >
                    <option value="">None</option>
                    {giftStyles.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className={citiesToolTab === "create" ? "sidebar-tab active" : "sidebar-tab"}
                    onClick={() => setCitiesToolTab("create")}
                  >
                    Create cities
                  </button>
                  <button
                    type="button"
                    className={citiesToolTab === "updates" ? "sidebar-tab active" : "sidebar-tab"}
                    onClick={() => setCitiesToolTab("updates")}
                  >
                    Update locationUpdates
                  </button>
                  <button
                    type="button"
                    className={citiesToolTab === "pipelines" ? "sidebar-tab active" : "sidebar-tab"}
                    onClick={() => setCitiesToolTab("pipelines")}
                  >
                    Other Pipelines
                  </button>
                </div>

                {citiesToolTab === "create" && (
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    <div style={{ fontWeight: 600 }}>Create cities (batch)</div>
                    <label style={{ display: "grid", gap: "0.25rem" }}>
                      <span>How many cities?</span>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={batchCityCount}
                        onChange={(e) => setBatchCityCount(e.target.value)}
                      />
                    </label>
                    <button type="button" onClick={handleBatchCreatePrompt}>
                      Create cities (build prompt)
                    </button>
                    <label style={{ display: "grid", gap: "0.25rem" }}>
                      <span>Prompt</span>
                      <textarea
                        rows={8}
                        value={batchCityPrompt}
                        onChange={(e) => setBatchCityPrompt(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleExecuteBatchCreate}
                      disabled={isBatchCreating}
                    >
                      {isBatchCreating ? "Executing..." : "Execute"}
                    </button>
                    {batchCityStatus && (
                      <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                        {batchCityStatus}
                      </div>
                    )}
                  </div>
                )}

                {citiesToolTab === "updates" && (
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    <div style={{ fontWeight: 600 }}>Update locationUpdates (selected)</div>
                    <label style={{ display: "grid", gap: "0.25rem" }}>
                      <span>Action</span>
                      <select
                        value={locationUpdateAction}
                        onChange={(e) =>
                          setLocationUpdateAction(
                            e.target.value as
                              | "add_new"
                              | "append_new"
                              | "update_images"
                              | "recreate_images"
                          )
                        }
                      >
                        <option value="add_new">Add new (replace existing updates)</option>
                        <option value="append_new">Append new</option>
                        <option value="update_images">Update images</option>
                        <option value="recreate_images">Recreate images</option>
                      </select>
                    </label>
                    {locationUpdateAction !== "update_images" &&
                      locationUpdateAction !== "recreate_images" && (
                      <>
                        <label style={{ display: "grid", gap: "0.25rem" }}>
                          <span>Updates per city</span>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={updateLocCount}
                            onChange={(e) => setUpdateLocCount(e.target.value)}
                          />
                        </label>
                        <button type="button" onClick={handleBuildLocationPrompt}>
                          Build prompt for selected cities
                        </button>
                        <label style={{ display: "grid", gap: "0.25rem" }}>
                          <span>Prompt</span>
                          <textarea
                            rows={6}
                            value={updateLocPrompt}
                            onChange={(e) => setUpdateLocPrompt(e.target.value)}
                          />
                        </label>
                      </>
                    )}
                    {(locationUpdateAction === "update_images" ||
                      locationUpdateAction === "recreate_images") && (
                      <>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                          {locationUpdateAction === "recreate_images" ? (
                            <>
                              Same prompts and paths as Update images, but always runs generation: if the PNG already
                              exists it is overwritten with the same filename; if not, it is created. The{" "}
                              <code style={{ fontSize: 11 }}>image</code> field is set to{" "}
                              <code style={{ fontSize: 11 }}>Travel/LocationUpdateImages/…</code>. For placeholder or
                              auto names, the target basename is the stable semantic name (city + text), not a uniquified
                              variant.
                            </>
                          ) : (
                            <>
                              For each selected city update with a missing image file: generates a PNG under{" "}
                              <code style={{ fontSize: 11 }}>{REL_LOCATION_UPDATE_IMAGES_DIR}</code> using a name like{" "}
                              <code style={{ fontSize: 11 }}>paris_train_station.png</code> (city id prefix + words from
                              the update text). The <code style={{ fontSize: 11 }}>image</code> field is set to{" "}
                              <code style={{ fontSize: 11 }}>Travel/LocationUpdateImages/…</code>. Placeholder filenames
                              are replaced with a new semantic name. You can still set an explicit safe basename to keep
                              a chosen filename.
                            </>
                          )}
                        </p>
                        <label style={{ display: "grid", gap: "0.25rem" }}>
                          <span>Image style (same shared Cities style selector above)</span>
                          <select
                            value={locationUpdateImageStyleId}
                            onChange={(e) => setLocationUpdateImageStyleId(e.target.value)}
                          >
                            <option value="">None</option>
                            {giftStyles.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label style={{ display: "grid", gap: "0.25rem" }}>
                          <span>Image generation notes (extra details, appended after the update text)</span>
                          <textarea
                            rows={3}
                            value={locationUpdateImageGenNotes}
                            onChange={(e) => setLocationUpdateImageGenNotes(e.target.value)}
                            placeholder="e.g. golden hour, wide establishing shot of the building exterior"
                          />
                        </label>
                        <p style={{ margin: 0, fontSize: 11, color: "var(--muted, #94a3b8)" }}>
                          Every image prompt also requires: no main character / prominent people, and no text in the
                          picture.
                        </p>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleExecuteLocationUpdates()}
                      disabled={isUpdatingLoc}
                    >
                      {isUpdatingLoc
                        ? "Working..."
                        : locationUpdateAction === "update_images"
                          ? "Update missing location images"
                          : locationUpdateAction === "recreate_images"
                            ? "Recreate location images"
                            : "Add Location Updates"}
                    </button>
                    {updateLocStatus && (
                      <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                        {updateLocStatus}
                      </div>
                    )}
                  </div>
                )}

                {citiesToolTab === "pipelines" && (
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    <div style={{ fontWeight: 600 }}>Pipelines</div>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                      Uses cities checked in the list. Missing gifts are created with the same flow as the red gift id
                      link (catalog entry + generated image). Display name, description, and activity tags are derived
                      from the gift id and city.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleCreateAllMissingGifts()}
                      disabled={isCreatingMissingGifts || isRelinkingExistingUpdates || isTestingExistingUpdates}
                    >
                      {isCreatingMissingGifts ? "Working..." : "Create All missing gifts"}
                    </button>
                    {missingGiftsPipelineStatus && (
                      <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                        {missingGiftsPipelineStatus}
                      </div>
                    )}
                    <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                      For selected cities, placeholder location update images are compared against the existing filenames
                      already under <code style={{ fontSize: 11 }}>{REL_LOCATION_UPDATE_IMAGES_DIR}</code>. If a likely
                      semantic match is found from the city id and update text, the <code style={{ fontSize: 11 }}>image</code>{" "}
                      field in <code style={{ fontSize: 11 }}>cities.json</code> is relinked to that file.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleRelinkExistingLocationUpdates()}
                      disabled={isCreatingMissingGifts || isRelinkingExistingUpdates || isTestingExistingUpdates}
                    >
                      {isRelinkingExistingUpdates ? "Working..." : "Relink existing updates"}
                    </button>
                    {relinkExistingUpdatesStatus && (
                      <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                        {relinkExistingUpdatesStatus}
                      </div>
                    )}
                    <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                      Tests every image file already under <code style={{ fontSize: 11 }}>{REL_LOCATION_UPDATE_IMAGES_DIR}</code>{" "}
                      and reports which ones are not referenced by any <code style={{ fontSize: 11 }}>cities.json</code>{" "}
                      location update.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleTestExistingLocationUpdates()}
                      disabled={isCreatingMissingGifts || isRelinkingExistingUpdates || isTestingExistingUpdates}
                    >
                      {isTestingExistingUpdates ? "Working..." : "Test"}
                    </button>
                    {testExistingUpdatesStatus && (
                      <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)", whiteSpace: "pre-wrap" }}>
                        {testExistingUpdatesStatus}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {status && <span style={{ color: "var(--muted, #94a3b8)" }}>{status}</span>}
            {imagesDir && pipelineKey === "gift_images" && (
              <p style={{ margin: 0, color: "var(--muted, #94a3b8)" }}>
                Images output: {imagesDir}
              </p>
            )}
            {fileError && (
              <p style={{ margin: 0, color: "#fca5a5" }}>{fileError}</p>
            )}
            {catalogFileContent && (
              <details>
                <summary style={{ cursor: "pointer" }}>Catalog JSON content</summary>
                <pre
                  style={{
                    marginTop: "0.5rem",
                    padding: "0.75rem",
                    background: "rgba(15, 23, 42, 0.6)",
                    borderRadius: 8,
                    overflowX: "auto",
                    maxHeight: 260,
                  }}
                >
                  {catalogFileContent}
                </pre>
              </details>
            )}
          </div>

          <div
            style={{
              background: "rgba(15, 23, 42, 0.6)",
              borderRadius: 8,
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              minHeight: isSplitPipeline ? 0 : 420,
              minWidth: 0,
              ...(isSplitPipeline
                ? {
                    flex: 1,
                    minHeight: 0,
                    overflow: "hidden",
                  }
                : {}),
            }}
          >
            <input
              value={giftSearch}
              onChange={(e) => setGiftSearch(e.target.value)}
              style={isSplitPipeline ? { width: "100%", minWidth: 0, boxSizing: "border-box", flexShrink: 0 } : undefined}
              placeholder={
                pipelineKey === "cities"
                  ? "Search by city name..."
                  : "Search by display name, id, description, or city:<cityname>..."
              }
            />
            {pipelineKey === "cities" && (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    (cities ?? []).forEach((c) => {
                      if (c.name_id) next[c.name_id] = true;
                    });
                    setSelectedCityIds(next);
                  }}
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCityIds({});
                  }}
                >
                  Clear
                </button>
              </div>
            )}
            {pipelineKey === "gift_images" && (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    (gifts ?? []).forEach((g) => {
                      if (g.id) next[g.id] = true;
                    });
                    setSelectedGiftIds(next);
                  }}
                >
                  Select all
                </button>
                <button type="button" onClick={() => setSelectedGiftIds({})}>
                  Clear
                </button>
              </div>
            )}
            <div style={{ color: "var(--muted, #94a3b8)", fontSize: 12, flexShrink: 0 }}>
              {pipelineKey === "cities"
                ? `Showing ${filteredCityItems.length} of ${allCityItems.length} cities`
                : `Showing ${filteredGiftItems.length} of ${allGiftItems.length} items`}
            </div>
            <div
              ref={mainListScrollRef}
              style={{
                display: "grid",
                gap: "1rem",
                width: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                ...(isSplitPipeline
                  ? {
                      flex: 1,
                      minHeight: 0,
                      overflowY: "auto",
                      overflowX: "hidden",
                      paddingRight: 4,
                    }
                  : { overflowY: "auto", maxHeight: "70vh", paddingRight: 4 }),
              }}
            >
              {pipelineKey === "cities" ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isSplitPipeline
                      ? "minmax(0, 13fr) minmax(0, 7fr)"
                      : "65% 35%",
                    gap: "1rem",
                    alignItems: "start",
                    width: "100%",
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
                    {filteredCityItems.length === 0 && <p>No matching cities found.</p>}
                    {filteredCityItems.map((city) => (
                      <div
                        key={city.name_id || city.display_name}
                        data-city-id={city.name_id || undefined}
                        style={{
                          display: "grid",
                          gap: "0.5rem",
                          padding: "1rem",
                          background: "rgba(15, 23, 42, 0.45)",
                          borderRadius: 8,
                        }}
                      >
                        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: 12 }}>
                          <input
                            type="checkbox"
                            checked={!!selectedCityIds[city.name_id]}
                            onChange={(e) =>
                              setSelectedCityIds((prev) => ({
                                ...prev,
                                [city.name_id]: e.target.checked,
                              }))
                            }
                          />
                        </label>
                        <strong>{city.display_name || city.name_id || "Unnamed city"}</strong>
                        <div style={{ color: "var(--muted, #94a3b8)", fontSize: 12 }}>
                          id: {city.name_id || "—"}
                        </div>
                        <div style={{ color: "var(--muted, #94a3b8)", fontSize: 12 }}>
                          gifts:{" "}
                          {city.gift_ids.length > 0 ? (
                            city.gift_ids.map((giftId, idx) => {
                              const linked = linkedGiftsById[giftId];
                              if (!linked) {
                                return (
                                  <span key={giftId}>
                                    {idx > 0 ? ", " : ""}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCreateGiftId(giftId);
                                        setCreateGiftDescription("");
                                        setCreateGiftStatus(null);
                                        setCreateGiftImageFile(null);
                                        setCreateGiftImageMode("generate");
                                        setShowCreateGift(true);
                                      }}
                                      style={{
                                        background: "none",
                                        border: "none",
                                        padding: 0,
                                        margin: 0,
                                        color: "#ef4444",
                                        textDecoration: "underline",
                                        cursor: "pointer",
                                        font: "inherit",
                                      }}
                                    >
                                      {giftId}
                                    </button>
                                  </span>
                                );
                              }
                              return (
                                <span key={giftId}>
                                  {idx > 0 ? ", " : ""}
                                  <button
                                    type="button"
                                    onClick={() => setSelectedLinkedGiftId(giftId)}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      padding: 0,
                                      margin: 0,
                                      color: "var(--header-link-color, #3b82f6)",
                                      textDecoration: "underline",
                                      cursor: "pointer",
                                      font: "inherit",
                                    }}
                                  >
                                    {giftId}
                                  </button>
                                </span>
                              );
                            })
                          ) : (
                            "—"
                          )}
                        </div>
                        <div style={{ color: "var(--muted, #94a3b8)", fontSize: 12 }}>
                          updates: {city.location_updates.length}
                        </div>
                        {city.location_updates.map((u, idx) => {
                          const rowKey = locationUpdateRowKey(city.name_id, idx);
                          const blobUrl = locationUpdateImageBlobs[rowKey];
                          const rawImage = (u.image || "").trim();
                          const base = basenameOnly(rawImage).trim();
                          const nameOk = Boolean(base && isSafeImageBasename(base));
                          const blue = "var(--header-link-color, #3b82f6)";
                          const red = "#ef4444";
                          const title = `Location update · ${city.display_name || city.name_id} · #${idx + 1}`;
                          return (
                            <div
                              key={`${city.name_id}-${idx}`}
                              style={{
                                fontSize: 13,
                                display: "flex",
                                gap: "0.5rem",
                                alignItems: "flex-start",
                              }}
                            >
                              <span
                                style={{
                                  flexShrink: 0,
                                  width: 72,
                                  textAlign: "center",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                {blobUrl ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPreviewImageTitle(title);
                                      setPreviewImageUrl(blobUrl);
                                    }}
                                    title="View image"
                                    style={{
                                      background: "none",
                                      border: "none",
                                      padding: 0,
                                      margin: 0,
                                      cursor: "pointer",
                                      color: blue,
                                      textDecoration: "underline",
                                      font: "inherit",
                                    }}
                                  >
                                    <img
                                      src={blobUrl}
                                      alt=""
                                      style={{
                                        display: "block",
                                        width: 64,
                                        height: 64,
                                        objectFit: "cover",
                                        borderRadius: 6,
                                        border: `1px solid ${blue}`,
                                      }}
                                    />
                                    <span style={{ fontSize: 11, display: "block", marginTop: 2 }}>Image</span>
                                  </button>
                                ) : locationUpdateImagesLoading && nameOk ? (
                                  <span style={{ fontSize: 11, color: "var(--muted, #94a3b8)" }}>Loading…</span>
                                ) : (
                                  <span
                                    role="status"
                                    title={
                                      !rawImage
                                        ? "No image filename on this update"
                                        : !nameOk
                                          ? "Image filename is not safe to load"
                                          : "Image file not found under Travel/LocationUpdateImages"
                                    }
                                    style={{
                                      display: "inline-block",
                                      color: red,
                                      textDecoration: "underline",
                                      fontSize: 11,
                                      padding: "0.35rem",
                                      maxWidth: 72,
                                      wordBreak: "break-word",
                                    }}
                                  >
                                    {!rawImage ? "No image" : !nameOk ? "Bad name" : "Missing file"}
                                  </span>
                                )}
                                {citiesToolTab === "updates" && selectedCityIds[city.name_id] && (
                                  <button
                                    type="button"
                                    title="Regenerate this image using Image style and notes from Update locationUpdates"
                                    disabled={isUpdatingLoc || !localAgentOk}
                                    onClick={() =>
                                      void handleExecuteLocationUpdateImages(true, {
                                        cityId: city.name_id,
                                        index: idx,
                                      })
                                    }
                                    style={{
                                      fontSize: 10,
                                      padding: "2px 6px",
                                      borderRadius: 4,
                                      border: "1px solid rgba(148, 163, 184, 0.45)",
                                      background: "rgba(30, 41, 59, 0.8)",
                                      color: "var(--muted, #e2e8f0)",
                                      cursor: isUpdatingLoc || !localAgentOk ? "not-allowed" : "pointer",
                                      width: "100%",
                                      maxWidth: 72,
                                    }}
                                  >
                                    Recreate
                                  </button>
                                )}
                              </span>
                              <span style={{ flex: 1, minWidth: 0 }}>- {u.text}</span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      position: "sticky",
                      top: 0,
                      padding: "1rem",
                      borderRadius: 8,
                      background: "rgba(15, 23, 42, 0.4)",
                      border: "1px solid rgba(148, 163, 184, 0.2)",
                      minWidth: 0,
                    }}
                  >
                    <strong>Gift details</strong>
                    {!selectedLinkedGiftId ? (
                      <p style={{ marginTop: "0.5rem", color: "var(--muted, #94a3b8)" }}>
                        Click an underlined gift id to view details.
                      </p>
                    ) : !linkedGiftsById[selectedLinkedGiftId] ? (
                      <p style={{ marginTop: "0.5rem", color: "var(--muted, #94a3b8)" }}>
                        Gift not found in saved gift catalog.
                      </p>
                    ) : (
                      <div style={{ marginTop: "0.5rem", display: "grid", gap: "0.5rem" }}>
                        <div>
                          <strong>
                            {linkedGiftsById[selectedLinkedGiftId].displayName || selectedLinkedGiftId}
                          </strong>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                          id: {linkedGiftsById[selectedLinkedGiftId].id}
                        </div>
                        {linkedGiftsById[selectedLinkedGiftId].activityTags.length > 0 && (
                          <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                            tags: {linkedGiftsById[selectedLinkedGiftId].activityTags.join(", ")}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                          priority: {linkedGiftsById[selectedLinkedGiftId].priority} · weight:{" "}
                          {linkedGiftsById[selectedLinkedGiftId].weight}
                        </div>
                        {linkedGiftsById[selectedLinkedGiftId].description && (
                          <div style={{ fontSize: 13 }}>{linkedGiftsById[selectedLinkedGiftId].description}</div>
                        )}
                        {selectedLinkedGiftImage ? (
                          <img
                            src={selectedLinkedGiftImage}
                            alt={linkedGiftsById[selectedLinkedGiftId].displayName || selectedLinkedGiftId}
                            style={{ width: "100%", maxWidth: 260, borderRadius: 6, objectFit: "contain" }}
                          />
                        ) : (
                          <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>No image preview found.</div>
                        )}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.25rem" }}>
                          <button
                            type="button"
                            onClick={() => openEditGift(linkedGiftsById[selectedLinkedGiftId])}
                            style={{
                              fontSize: 12,
                              padding: "0.35rem 0.65rem",
                              borderRadius: 6,
                              border: "1px solid rgba(148, 163, 184, 0.45)",
                              background: "rgba(30, 41, 59, 0.9)",
                              color: "var(--foreground, #e2e8f0)",
                              cursor: "pointer",
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const gid = linkedGiftsById[selectedLinkedGiftId].id;
                              router.push(
                                `/games/${encodeURIComponent(gameKey)}/pipelines/gift_images?q=${encodeURIComponent(gid)}&giftTab=update`
                              );
                            }}
                            style={{
                              fontSize: 12,
                              padding: "0.35rem 0.65rem",
                              borderRadius: 6,
                              border: "1px solid rgba(148, 163, 184, 0.45)",
                              background: "rgba(30, 41, 59, 0.9)",
                              color: "var(--foreground, #e2e8f0)",
                              cursor: "pointer",
                            }}
                          >
                            Update image
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {filteredGiftItems.length === 0 && <p>No matching gifts found.</p>}
                  {filteredGiftItems.map((gift) => {
                const imgName = gift.imageFileName?.trim();
                const imageUrl = imgName ? imageBlobs[imgName] : null;
                const baseGiftsPath = linkedGiftBasePath.trim().replace(/\/+$/, "");
                const resolvedImagePath = imgName
                  ? imagesDir
                    ? joinPlatformPath(imagesDir, imgName)
                    : baseGiftsPath
                    ? joinPlatformPath(`${baseGiftsPath}/Images`, imgName)
                    : null
                  : null;
                return (
                  <div
                    key={gift.id || gift.displayName}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "140px minmax(0, 1fr) 220px",
                      gap: "1rem",
                      padding: "1rem",
                      background: "rgba(15, 23, 42, 0.45)",
                      borderRadius: 8,
                      alignItems: "start",
                    }}
                  >
                    <div style={{ display: "grid", gap: "0.35rem", justifyItems: "center" }}>
                      {pipelineKey === "gift_images" && gift.id && (
                        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: 12 }}>
                          <input
                            type="checkbox"
                            checked={!!selectedGiftIds[gift.id]}
                            onChange={(e) =>
                              setSelectedGiftIds((prev) => ({
                                ...prev,
                                [gift.id]: e.target.checked,
                              }))
                            }
                          />
                          Select
                        </label>
                      )}
                      <div
                        style={{
                          width: 140,
                          height: 140,
                          background: "rgba(15, 23, 42, 0.4)",
                          borderRadius: 6,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--muted, #94a3b8)",
                          fontSize: 12,
                          textAlign: "center",
                          padding: "0.5rem",
                        }}
                      >
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={gift.displayName}
                            style={{ width: "100%", height: "100%", objectFit: "contain", cursor: "zoom-in" }}
                            onClick={() => {
                              if (!imageUrl) return;
                              setPreviewImageUrl(imageUrl);
                              setPreviewImageTitle(gift.displayName || gift.id || "Gift image");
                            }}
                            onError={() => {
                              if (!imgName) return;
                              setImageErrors((prev) => ({ ...prev, [imgName]: "Invalid image file" }));
                            }}
                          />
                        ) : (
                          "No image found"
                        )}
                      </div>
                      {imgName && (imageErrors[imgName] || gift.image_exists === false) && (
                        <div style={{ fontSize: 12, color: "#fca5a5", textAlign: "center" }}>
                          {imageErrors[imgName] || "File not found"}
                        </div>
                      )}
                    </div>
                    <div>
                      <strong>{gift.displayName || gift.id || "Untitled gift"}</strong>
                      {gift.activityTags.length > 0 && (
                        <div style={{ color: "var(--muted, #94a3b8)", fontSize: 13 }}>
                          Tags: {gift.activityTags.join(", ")}
                        </div>
                      )}
                      <div style={{ color: "var(--muted, #94a3b8)", fontSize: 13 }}>
                        Priority {gift.priority} · Weight {gift.weight}
                      </div>
                      {gift.description && <p style={{ marginTop: "0.5rem" }}>{gift.description}</p>}
                      {resolvedImagePath && (
                        <div
                          style={{
                            marginTop: "0.25rem",
                            fontSize: 12,
                            color: "var(--muted, #94a3b8)",
                            wordBreak: "break-all",
                          }}
                        >
                          Image path: {resolvedImagePath}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "grid", gap: "0.5rem" }}>
                      {gift.id && giftCityMap[gift.id]?.length > 0 && (
                        <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                          Cities: {giftCityMap[gift.id].map((c) => c.name).join(", ")}
                        </div>
                      )}
                      {pipelineKey === "gift_images" && gift.id && cities && cities.length > 0 && (
                        <div style={{ display: "grid", gap: "0.35rem" }}>
                          <select
                            value={selectedCityByGift[gift.id] ?? ""}
                            onChange={(e) =>
                              setSelectedCityByGift((prev) => ({ ...prev, [gift.id]: e.target.value }))
                            }
                          >
                            <option value="">Add to city...</option>
                            {cities.map((city) => (
                              <option key={city.name_id} value={city.name_id}>
                                {city.display_name || city.name_id}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!selectedCityByGift[gift.id]}
                            onClick={() => {
                              const cityId = selectedCityByGift[gift.id];
                              if (!cityId) return;
                              handleAddGiftToCity(gift.id, cityId);
                            }}
                          >
                            Add
                          </button>
                        </div>
                      )}
                      {pipelineKey === "gift_images" && gift.id && (
                        <button
                          type="button"
                          onClick={() => openEditGift(gift)}
                          disabled={!!fileGifts}
                          title={fileGifts ? "Editing requires the server-backed catalog." : undefined}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
        </div>
        <div
          style={{
            flex: "0 0 10dvh",
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
            minHeight: 48,
            maxHeight: "10dvh",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            paddingTop: 6,
            paddingBottom: 4,
            borderTop: "1px solid rgba(148, 163, 184, 0.2)",
            boxSizing: "border-box",
            overflow: "hidden",
            overflowX: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.35rem", flexShrink: 0 }}>
            <strong style={{ fontSize: 12 }}>Generation log</strong>
            <button type="button" onClick={() => setPipelineGenerationLog("")}>
              Clear log
            </button>
          </div>
          <textarea
            readOnly
            aria-label="Generation log"
            value={pipelineGenerationLog}
            placeholder="Generated catalog/cities data and images are logged here as you run tools."
            style={{
              width: "100%",
              maxWidth: "100%",
              minWidth: 0,
              flex: 1,
              minHeight: 0,
              boxSizing: "border-box",
              fontFamily: "ui-monospace, monospace",
              fontSize: 10,
              lineHeight: 1.35,
              padding: "0.35rem 0.45rem",
              borderRadius: 6,
              border: "1px solid rgba(148, 163, 184, 0.25)",
              background: "rgba(15, 23, 42, 0.5)",
              color: "var(--foreground, #e2e8f0)",
              resize: "none",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          />
        </div>
        </>
      ) : (
        <>
          <h1 style={{ marginBottom: "0.5rem" }}>{pipeline?.name ?? pipelineKey}</h1>
          {pipeline?.description && (
            <p style={{ color: "var(--muted, #94a3b8)" }}>{pipeline.description}</p>
          )}
          <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem", alignItems: "center" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span>Input JSON</span>
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              {inputs.length === 0 && <option value="">No inputs available</option>}
              {inputs.map((file) => (
                <option key={file} value={file}>
                  {file}
                </option>
              ))}
            </select>
          </label>
          </div>
        </>
      )}

      {result && (
        <pre
          style={{
            marginTop: "1.5rem",
            padding: "1rem",
            background: "rgba(15, 23, 42, 0.6)",
            borderRadius: 8,
            overflowX: "auto",
          }}
        >
          {result}
        </pre>
      )}
      {(pipelineKey === "gift_images" || pipelineKey === "cities") && showCreateGift && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2, 6, 23, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: "min(720px, 96vw)",
              maxHeight: "92vh",
              overflowY: "auto",
              background: "rgba(15, 23, 42, 0.98)",
              border: "1px solid rgba(148, 163, 184, 0.25)",
              borderRadius: 10,
              padding: "1rem",
              display: "grid",
              gap: "0.75rem",
            }}
          >
            <h3 style={{ margin: 0 }}>Create Gift</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>
              Fields match the catalog JSON: <code style={{ fontSize: 11 }}>activityTags</code>, etc.
            </p>
            <label style={{ display: "grid", gap: "0.25rem" }}>
              <span>Gift id</span>
              <input value={createGiftId} onChange={(e) => setCreateGiftId(e.target.value)} placeholder="mona_lisa" />
            </label>
            <label style={{ display: "grid", gap: "0.25rem" }}>
              <span>Display name</span>
              <input
                value={createGiftDisplayName}
                onChange={(e) => setCreateGiftDisplayName(e.target.value)}
                placeholder="Leave empty to derive from id"
              />
            </label>
            <label style={{ display: "grid", gap: "0.25rem" }}>
              <span>Description</span>
              <textarea
                value={createGiftDescription}
                onChange={(e) => setCreateGiftDescription(e.target.value)}
                rows={3}
                placeholder="A painting of Mona Lisa from Leonardo Da Vinci"
              />
            </label>
            <label style={{ display: "grid", gap: "0.25rem" }}>
              <span>Activity tags (comma-separated)</span>
              <input
                value={createGiftActivityTags}
                onChange={(e) => setCreateGiftActivityTags(e.target.value)}
                placeholder="Painting, Art"
              />
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.75rem",
              }}
            >
              <label style={{ display: "grid", gap: "0.25rem" }}>
                <span>Priority</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={createGiftPriority}
                  onChange={(e) => setCreateGiftPriority(e.target.value)}
                />
              </label>
              <label style={{ display: "grid", gap: "0.25rem" }}>
                <span>Weight</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={createGiftWeight}
                  onChange={(e) => setCreateGiftWeight(e.target.value)}
                />
              </label>
            </div>
            <div style={{ display: "grid", gap: "0.5rem" }}>
              <span style={{ fontSize: 13, color: "var(--muted, #94a3b8)" }}>Image</span>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="giftImageMode"
                  checked={createGiftImageMode === "file"}
                  onChange={() => {
                    setCreateGiftImageMode("file");
                  }}
                />
                Pick image file (copies into Gift/Images)
              </label>
              {createGiftImageMode === "file" && (
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => setCreateGiftImageFile(e.target.files?.[0] ?? null)}
                />
              )}
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="giftImageMode"
                  checked={createGiftImageMode === "generate"}
                  onChange={() => {
                    setCreateGiftImageMode("generate");
                    setCreateGiftImageFile(null);
                  }}
                />
                Generate
              </label>
            </div>
            {createGiftStatus && <div style={{ color: "var(--muted, #94a3b8)" }}>{createGiftStatus}</div>}
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setShowCreateGift(false);
                  setCreateGiftStatus(null);
                  setCreateGiftImageFile(null);
                  setCreateGiftImageMode("file");
                  setCreateGiftId("");
                  setCreateGiftDisplayName("");
                  setCreateGiftDescription("");
                  setCreateGiftActivityTags("");
                  setCreateGiftPriority("10");
                  setCreateGiftWeight("2");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreateGift(createGiftImageMode === "generate")}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
      {previewImageUrl && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewImageUrl(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2, 6, 23, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: "1.5rem",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "min(1100px, 96vw)",
              maxHeight: "90vh",
              background: "rgba(15, 23, 42, 0.95)",
              border: "1px solid rgba(148, 163, 184, 0.25)",
              borderRadius: 12,
              padding: "1rem",
              display: "grid",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
              <strong style={{ fontSize: 14 }}>{previewImageTitle || "Image preview"}</strong>
              <button type="button" onClick={() => setPreviewImageUrl(null)}>
                Close
              </button>
            </div>
            <img
              src={previewImageUrl}
              alt={previewImageTitle || "Image preview"}
              style={{ width: "100%", maxHeight: "75vh", objectFit: "contain", borderRadius: 8 }}
            />
          </div>
        </div>
      )}
      {(pipelineKey === "gift_images" || pipelineKey === "cities") && showEditGift && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2, 6, 23, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: "min(720px, 96vw)",
              maxHeight: "92vh",
              overflowY: "auto",
              background: "rgba(15, 23, 42, 0.98)",
              border: "1px solid rgba(148, 163, 184, 0.25)",
              borderRadius: 10,
              padding: "1rem",
              display: "grid",
              gap: "0.75rem",
            }}
          >
            <h3 style={{ margin: 0 }}>Edit Gift</h3>
            <label style={{ display: "grid", gap: "0.25rem" }}>
              <span>Gift id</span>
              <input value={editGiftId} disabled />
            </label>
            <label style={{ display: "grid", gap: "0.25rem" }}>
              <span>Display name</span>
              <input
                value={editGiftDisplayName}
                onChange={(e) => setEditGiftDisplayName(e.target.value)}
              />
            </label>
            <label style={{ display: "grid", gap: "0.25rem" }}>
              <span>Description</span>
              <textarea
                value={editGiftDescription}
                onChange={(e) => setEditGiftDescription(e.target.value)}
                rows={3}
              />
            </label>
            <label style={{ display: "grid", gap: "0.25rem" }}>
              <span>Activity tags (comma-separated)</span>
              <input
                value={editGiftActivityTags}
                onChange={(e) => setEditGiftActivityTags(e.target.value)}
                placeholder="Painting, Art"
              />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <label style={{ display: "grid", gap: "0.25rem" }}>
                <span>Priority</span>
                <input
                  type="number"
                  value={editGiftPriority}
                  onChange={(e) => setEditGiftPriority(e.target.value)}
                />
              </label>
              <label style={{ display: "grid", gap: "0.25rem" }}>
                <span>Weight</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={editGiftWeight}
                  onChange={(e) => setEditGiftWeight(e.target.value)}
                />
              </label>
            </div>
            <div style={{ display: "grid", gap: "0.5rem" }}>
              <span style={{ fontSize: 13, color: "var(--muted, #94a3b8)" }}>Image</span>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="editGiftImageMode"
                  checked={editGiftImageMode === "keep"}
                  onChange={() => {
                    setEditGiftImageMode("keep");
                    setEditGiftImageFile(null);
                  }}
                />
                Keep
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="editGiftImageMode"
                  checked={editGiftImageMode === "file"}
                  onChange={() => {
                    setEditGiftImageMode("file");
                  }}
                />
                Replace with file
              </label>
              {editGiftImageMode === "file" && (
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => setEditGiftImageFile(e.target.files?.[0] ?? null)}
                />
              )}
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="editGiftImageMode"
                  checked={editGiftImageMode === "generate"}
                  onChange={() => {
                    setEditGiftImageMode("generate");
                    setEditGiftImageFile(null);
                  }}
                />
                Generate
              </label>
            </div>
            {editGiftStatus && <div style={{ color: "var(--muted, #94a3b8)" }}>{editGiftStatus}</div>}
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setShowEditGift(false);
                  setEditGiftStatus(null);
                  setEditGiftImageFile(null);
                  setEditGiftImageMode("keep");
                }}
              >
                Cancel
              </button>
              <button type="button" onClick={() => void handleEditGift()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PipelinePage({ params }: PageProps) {
  const { gameKey, pipelineKey } = use(params);
  return (
    <Suspense fallback={<div style={{ padding: "1rem", color: "var(--muted, #94a3b8)" }}>Loading pipeline…</div>}>
      <PipelinePageContent gameKey={gameKey} pipelineKey={pipelineKey} />
    </Suspense>
  );
}
