"use client";

import { use, useEffect, useState } from "react";
import { fetchApi } from "../../../../lib/api";
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
type StyleInfo = { id: string; name: string; prompt?: string };
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

export function PipelinePageContent({
  gameKey,
  pipelineKey,
}: {
  gameKey: string;
  pipelineKey: string;
}) {
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
  const [updateLocReplace, setUpdateLocReplace] = useState(false);
  const [citiesToolTab, setCitiesToolTab] = useState<"create" | "updates">("create");
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
  const [giftStyles, setGiftStyles] = useState<StyleInfo[]>([]);
  const [giftStyleId, setGiftStyleId] = useState("");
  const [giftStyleExtra, setGiftStyleExtra] = useState("");
  const [giftStyleQuality, setGiftStyleQuality] = useState("low");
  const [giftStyleMode, setGiftStyleMode] = useState("natural");
  const [giftUpdateStatus, setGiftUpdateStatus] = useState<string | null>(null);
  const [isGiftUpdating, setIsGiftUpdating] = useState(false);
  const [giftImageReload, setGiftImageReload] = useState(0);
  const [catalogReload, setCatalogReload] = useState(0);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewImageTitle, setPreviewImageTitle] = useState<string | null>(null);

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

  const generateImageBytes = async (prompt: string, quality: string, projectKey: string | null) => {
    const res = await fetchApi("/tools/generate_image_bytes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        width: 1024,
        height: 1024,
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
    return payload.content_base64;
  };

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
    if (pipelineKey !== "gift_images") return;
    let cancelled = false;
    const loadStyles = async () => {
      try {
        const res = await fetchApi("/storyboard/styles");
        if (!res.ok) return;
        const data = (await res.json()) as StyleInfo[];
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
    setGeneratingGiftId(giftId);
    setStatus("Generating gift image...");
    try {
      const giftData = await readGiftCatalogRaw();
      const { key, items } = getGiftItems(giftData);
      const gift = items.find((g) => String(g["id"] || "").trim() === giftId);
      if (!gift) throw new Error("Gift not found.");
      const name = String(gift["displayName"] || gift["name"] || giftId).trim();
      const desc = String(gift["description"] || "").trim();
      const prompt = desc ? `${name}. ${desc}` : name;
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
      setStatus("Gift image generated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generate failed.";
      setStatus(`Error: ${message}`);
    } finally {
      setGeneratingGiftId(null);
    }
  };

  const openEditGift = (gift: GiftItem) => {
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
      const data = await readGiftCatalogRaw();
      const { key, items } = getGiftItems(data);
      const existing = items.find((g) => String(g.id || "").trim() === createGiftId.trim());
      if (existing) throw new Error("Gift id already exists.");
      const displayName = createGiftDisplayName.trim() || createGiftId.trim();
      const description = createGiftDescription.trim();
      const newGift: Record<string, unknown> = {
        id: createGiftId.trim(),
        displayName,
        description,
        activityTags: tagsList || [],
        priority: pr,
        weight: w,
        imageFileName: "",
      };
      let filename = "";
      if (createGiftImageMode === "file" && createGiftImageFile) {
        const buffer = await createGiftImageFile.arrayBuffer();
        const base64 = arrayBufferToBase64(buffer);
        const ext = `.${createGiftImageFile.name.split(".").pop() || "png"}`;
        filename = `${createGiftId.trim()}${ext}`;
        await localAgent.writeBinary(
          gameDataPaths.projectRoot,
          `Assets/StreamingAssets/Gifts/Images/${filename}`,
          base64
        );
      } else if (createGiftImageMode === "generate" && forceGenerate) {
        const promptBase = `${displayName}${description ? `. ${description}` : ""}`;
        const base64 = await generateImageBytes(promptBase, "low", activeProjectKeyForGame);
        filename = `${createGiftId.trim()}.png`;
        await localAgent.writeBinary(
          gameDataPaths.projectRoot,
          `Assets/StreamingAssets/Gifts/Images/${filename}`,
          base64
        );
      }
      if (filename) newGift.imageFileName = filename;
      items.push(newGift);
      setGiftItems(data, key, items);
      await writeGiftCatalogRaw(data);
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
        const promptBase = `${display}${desc ? `. ${desc}` : ""}`;
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
      `Return JSON only with the schema:\n` +
      `{ "cities": [ { "cityId": string, "displayName": string, "gifts": [ { "giftId": string, "displayName": string, "description": string, "activityTags": [string] } ] } ] }`;
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
      for (const gift of createdGifts) {
        const gid = String(gift["id"] || "").trim();
        if (!gid) continue;
        const name = String(gift["displayName"] || gift["name"] || gid).trim();
        const desc = String(gift["description"] || "").trim();
        const prompt = desc ? `${name}. ${desc}` : name;
        const base64 = await generateImageBytes(prompt, "low", activeProjectKeyForGame);
        const filename = `${gid}.png`;
        await localAgent.writeBinary(
          gameDataPaths.projectRoot,
          `Assets/StreamingAssets/Gifts/Images/${filename}`,
          base64
        );
        gift["imageFileName"] = filename;
        items.push(gift);
      }
      for (const city of createdCities) {
        citiesList.push(city);
      }
      citiesData["cities"] = citiesList;
      setGiftItems(giftsData, key, items);
      await writeGiftCatalogRaw(giftsData);
      await writeCitiesRaw(citiesData);
      setCatalogReload((prev) => prev + 1);
      setGiftImageReload((prev) => prev + 1);
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
    const selected = (cities ?? []).filter((c) => selectedCityIds[c.name_id]);
    if (selected.length === 0) {
      setUpdateLocStatus("Select at least one city.");
      return;
    }
    const parsedCount = Number.parseInt(updateLocCount, 10);
    const normalized = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 3;
    setUpdateLocPrompt(buildLocationUpdatePrompt(selected, normalized));
    setUpdateLocStatus(null);
  };

  const handleExecuteLocationUpdates = async () => {
    if (!gameDataPaths?.projectRoot) {
      setUpdateLocStatus("Local project path not available.");
      return;
    }
    const selected = (cities ?? []).filter((c) => selectedCityIds[c.name_id]);
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
    setIsUpdatingLoc(true);
    setUpdateLocStatus("Updating locationUpdates...");
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
      for (const city of citiesList) {
        const cityId = String(city.nameId || city.name_id || "").trim();
        if (!cityId) continue;
        const incoming = updatesByCity[cityId] || [];
        if (incoming.length === 0) continue;
        if (updateLocReplace) {
          city.locationUpdates = incoming;
        } else {
          const existing = Array.isArray(city.locationUpdates) ? city.locationUpdates : [];
          city.locationUpdates = [...existing, ...incoming];
        }
      }
      citiesData["cities"] = citiesList;
      await writeCitiesRaw(citiesData);
      setCatalogReload((prev) => prev + 1);
      setUpdateLocStatus("locationUpdates updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed.";
      setUpdateLocStatus(`Error: ${message}`);
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
        const prompt = promptParts.filter(Boolean).join(". ");
        try {
          const base64 = await generateImageBytes(prompt, giftStyleQuality, activeProjectKeyForGame);
          const filename = `${gid}.png`;
          await localAgent.writeBinary(
            gameDataPaths.projectRoot,
            `Assets/StreamingAssets/Gifts/Images/${filename}`,
            base64
          );
          gift["imageFileName"] = filename;
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

  return (
    <div style={{ width: "100%", maxWidth: "100vw", margin: "2rem 0", padding: "0 1rem" }}>
      <h1 style={{ marginBottom: "0.5rem" }}>
        {pipeline?.name ?? pipelineKey}
      </h1>
      {pipeline?.description && (
        <p style={{ color: "var(--muted, #94a3b8)" }}>{pipeline.description}</p>
      )}

      {pipelineKey === "gift_images" || pipelineKey === "cities" ? (
        <div style={{ marginTop: "1.5rem", display: "grid", gridTemplateColumns: "25% 75%", gap: "1rem", alignItems: "start" }}>
          <div
            style={{
              background: "rgba(15, 23, 42, 0.6)",
              borderRadius: 8,
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
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
                      <span>Updates per city</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={updateLocCount}
                        onChange={(e) => setUpdateLocCount(e.target.value)}
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={updateLocReplace}
                        onChange={(e) => setUpdateLocReplace(e.target.checked)}
                      />
                      Replace existing updates
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
                    <button
                      type="button"
                      onClick={handleExecuteLocationUpdates}
                      disabled={isUpdatingLoc}
                    >
                      {isUpdatingLoc ? "Executing..." : "Add Location Updates"}
                    </button>
                    {updateLocStatus && (
                      <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                        {updateLocStatus}
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
              minHeight: 420,
            }}
          >
            <input
              value={giftSearch}
              onChange={(e) => setGiftSearch(e.target.value)}
              placeholder={
                pipelineKey === "cities"
                  ? "Search by city name..."
                  : "Search by display name, id, description, or city:<cityname>..."
              }
            />
            {pipelineKey === "cities" && (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
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
            <div style={{ color: "var(--muted, #94a3b8)", fontSize: 12 }}>
              {pipelineKey === "cities"
                ? `Showing ${filteredCityItems.length} of ${allCityItems.length} cities`
                : `Showing ${filteredGiftItems.length} of ${allGiftItems.length} items`}
            </div>
            <div style={{ overflowY: "auto", maxHeight: "70vh", display: "grid", gap: "1rem", paddingRight: 4 }}>
              {pipelineKey === "cities" ? (
                <div style={{ display: "grid", gridTemplateColumns: "65% 35%", gap: "1rem", alignItems: "start" }}>
                  <div style={{ display: "grid", gap: "1rem" }}>
                    {filteredCityItems.length === 0 && <p>No matching cities found.</p>}
                    {filteredCityItems.map((city) => (
                      <div
                        key={city.name_id || city.display_name}
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
                        {city.location_updates.map((u, idx) => (
                          <div key={`${city.name_id}-${idx}`} style={{ fontSize: 13 }}>
                            - {u.text}
                          </div>
                        ))}
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
      ) : (
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
      {pipelineKey === "gift_images" && showEditGift && (
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
  return <PipelinePageContent gameKey={gameKey} pipelineKey={pipelineKey} />;
}
