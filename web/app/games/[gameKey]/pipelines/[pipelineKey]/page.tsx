"use client";

import { use, useEffect, useState } from "react";
import { fetchApi } from "../../../../lib/api";

function resolveGiftImageFileName(g: Record<string, unknown>): string | null {
  const fn = g.imageFileName ?? g.image_filename;
  if (typeof fn === "string" && fn.trim()) return fn.trim();
  return null;
}

function parseStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

/** Comma-separated place or tag ids; returns undefined if empty. */
function splitCsvToList(s: string): string[] | undefined {
  const parts = s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

type PipelineInfo = { key: string; name: string; description?: string };
type GiftItem = {
  id: string;
  displayName: string;
  description: string;
  placeIds: string[];
  activityTags: string[];
  priority: number;
  weight: number;
  imageFileName?: string | null;
  presentationId?: string;
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
type LinkedGift = {
  id: string;
  displayName: string;
  description: string;
  placeIds: string[];
  activityTags: string[];
  priority: number;
  weight: number;
  imageFileName?: string | null;
  presentationId?: string;
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

export default function PipelinePage({ params }: PageProps) {
  const { gameKey, pipelineKey } = use(params);
  const [pipeline, setPipeline] = useState<PipelineInfo | null>(null);
  const [inputs, setInputs] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [catalogPath, setCatalogPath] = useState("");
  const [gifts, setGifts] = useState<GiftItem[] | null>(null);
  const [imagesDir, setImagesDir] = useState<string | null>(null);
  const [imageBlobs, setImageBlobs] = useState<Record<string, string>>({});
  const [fileGifts, setFileGifts] = useState<GiftItem[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [catalogFileContent, setCatalogFileContent] = useState<string | null>(null);
  const [giftSearch, setGiftSearch] = useState("");
  const [cities, setCities] = useState<CityItem[] | null>(null);
  const [fileCities, setFileCities] = useState<CityItem[] | null>(null);
  const [linkedGiftsById, setLinkedGiftsById] = useState<Record<string, LinkedGift>>({});
  const [linkedGiftBasePath, setLinkedGiftBasePath] = useState("");
  const [selectedLinkedGiftId, setSelectedLinkedGiftId] = useState<string | null>(null);
  const [selectedLinkedGiftImage, setSelectedLinkedGiftImage] = useState<string | null>(null);
  const [showCreateGift, setShowCreateGift] = useState(false);
  const [createGiftId, setCreateGiftId] = useState("");
  const [createGiftDisplayName, setCreateGiftDisplayName] = useState("");
  const [createGiftDescription, setCreateGiftDescription] = useState("");
  const [createGiftPlaceIds, setCreateGiftPlaceIds] = useState("");
  const [createGiftCityId, setCreateGiftCityId] = useState("");
  const [createGiftActivityTags, setCreateGiftActivityTags] = useState("");
  const [createGiftPriority, setCreateGiftPriority] = useState("10");
  const [createGiftWeight, setCreateGiftWeight] = useState("2");
  const [createGiftPresentationId, setCreateGiftPresentationId] = useState("");
  const [availableCities, setAvailableCities] = useState<Array<{ id: string; name: string }>>([]);
  const [createGiftStatus, setCreateGiftStatus] = useState<string | null>(null);
  const [createGiftImageMode, setCreateGiftImageMode] = useState<"file" | "generate">("file");
  const [createGiftImageFile, setCreateGiftImageFile] = useState<File | null>(null);
  const [gameDataPaths, setGameDataPaths] = useState<GameDataPaths | null>(null);
  const [gameDataLoadError, setGameDataLoadError] = useState<string | null>(null);
  const [giftCatalogMissingForCities, setGiftCatalogMissingForCities] = useState(false);
  const [activeProjectKeyForGame, setActiveProjectKeyForGame] = useState<string | null>(null);

  const parseCatalogText = (text: string): GiftItem[] => {
    const parsed = JSON.parse(text) as { items?: unknown; gifts?: unknown };
    const rawItems = Array.isArray(parsed.items) ? parsed.items : parsed.gifts;
    if (!Array.isArray(rawItems)) {
      throw new Error("Missing 'items' array in JSON.");
    }
    return rawItems
      .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
      .map((gift) => {
        let placeIds = parseStringArray(gift.placeIds);
        if (!placeIds.length && typeof gift.cityId === "string" && gift.cityId.trim()) {
          placeIds = [gift.cityId.trim()];
        }
        const pri = gift.priority;
        const priority =
          typeof pri === "number" && !Number.isNaN(pri) ? pri : Number(pri) || 10;
        const w = gift.weight;
        const weight = typeof w === "number" && !Number.isNaN(w) ? w : Number(w) || 2;
        return {
          id: String(gift.id ?? ""),
          displayName: String(gift.displayName ?? gift.name ?? ""),
          description: String(gift.description ?? ""),
          placeIds,
          activityTags: parseStringArray(gift.activityTags),
          priority,
          weight,
          presentationId: String(gift.presentationId ?? ""),
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
        let placeIds = parseStringArray(gift.placeIds);
        if (!placeIds.length && typeof gift.cityId === "string" && gift.cityId.trim()) {
          placeIds = [gift.cityId.trim()];
        }
        const pri = gift.priority;
        const priority =
          typeof pri === "number" && !Number.isNaN(pri) ? pri : Number(pri) || 10;
        const w = gift.weight;
        const weight = typeof w === "number" && !Number.isNaN(w) ? w : Number(w) || 2;
        out[id] = {
          id,
          displayName: String(gift.displayName ?? gift.name ?? "").trim(),
          description: String(gift.description ?? "").trim(),
          placeIds,
          activityTags: parseStringArray(gift.activityTags),
          priority,
          weight,
          presentationId: String(gift.presentationId ?? "").trim(),
          imageFileName: resolveGiftImageFileName(gift),
        };
      });
    return out;
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

  /** Resolve JSON paths from Admin project path: Assets/StreamingAssets/... */
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
      try {
        const res = await fetchApi(`/projects/${encodeURIComponent(key)}/game-data-paths`);
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { detail?: string };
          if (!cancelled) {
            setGameDataPaths(null);
            setGameDataLoadError(errBody.detail || `Could not resolve game data paths (${res.status}).`);
            setGiftCatalogMissingForCities(false);
          }
          return;
        }
        const data = (await res.json()) as {
          project_root: string;
          cities_json: string;
          gift_catalog_json: string;
          gifts_base_dir: string;
          cities_json_exists: boolean;
          gift_catalog_json_exists: boolean;
        };
        if (cancelled) return;
        const paths: GameDataPaths = {
          projectRoot: data.project_root,
          citiesJson: data.cities_json,
          giftCatalogJson: data.gift_catalog_json,
          giftsBaseDir: data.gifts_base_dir,
          citiesJsonExists: data.cities_json_exists,
          giftCatalogJsonExists: data.gift_catalog_json_exists,
        };
        setGameDataPaths(paths);
        setLinkedGiftBasePath(data.gifts_base_dir);
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
  }, [pipelineKey]);

  /** Load JSON from disk via API when paths exist. */
  useEffect(() => {
    if (pipelineKey !== "gift_images" && pipelineKey !== "cities") return;
    if (!activeProjectKeyForGame || !gameDataPaths) return;
    if (gameDataLoadError) return;
    let cancelled = false;
    const loadFiles = async () => {
      try {
        if (pipelineKey === "gift_images" && gameDataPaths.giftCatalogJsonExists) {
          const res = await fetchApi(
            `/projects/${encodeURIComponent(activeProjectKeyForGame)}/game-data-file/gift_catalog`,
          );
          if (!res.ok || cancelled) return;
          const json = await res.json();
          const text = JSON.stringify(json, null, 2);
          setCatalogFileContent(text);
          setFileGifts(parseCatalogText(text));
          setFileError(null);
        } else if (pipelineKey === "cities" && gameDataPaths.citiesJsonExists) {
          const res = await fetchApi(
            `/projects/${encodeURIComponent(activeProjectKeyForGame)}/game-data-file/cities`,
          );
          if (!res.ok || cancelled) return;
          const json = await res.json();
          const text = JSON.stringify(json, null, 2);
          setCatalogFileContent(text);
          const parsed = parseCitiesText(text);
          setFileCities(parsed);
          setFileError(null);
          const opts = parsed.map((c) => ({
            id: c.name_id,
            name: c.display_name || c.name_id,
          }));
          setAvailableCities(opts);
          if (opts.length > 0) setCreateGiftCityId((prev) => prev || opts[0].id);
        }
        if (pipelineKey === "cities" && gameDataPaths.giftCatalogJsonExists) {
          const resG = await fetchApi(
            `/projects/${encodeURIComponent(activeProjectKeyForGame)}/game-data-file/gift_catalog`,
          );
          if (resG.ok && !cancelled) {
            const giftJson = await resG.json();
            setLinkedGiftsById(parseGiftLinksText(JSON.stringify(giftJson)));
          }
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
  }, [pipelineKey, activeProjectKeyForGame, gameDataPaths, gameDataLoadError]);

  useEffect(() => {
    if (pipelineKey !== "cities") return;
    if (availableCities.length > 0) return;
    const fallback = (fileCities ?? cities ?? []).map((c) => ({
      id: c.name_id,
      name: c.display_name || c.name_id,
    }));
    if (fallback.length > 0) {
      setAvailableCities(fallback);
      if (!createGiftCityId) setCreateGiftCityId(fallback[0].id);
    }
  }, [pipelineKey, fileCities, cities, availableCities.length, createGiftCityId]);

  useEffect(() => {
    if (pipelineKey !== "cities") return;
    const gift = selectedLinkedGiftId ? linkedGiftsById[selectedLinkedGiftId] : null;
    const giftImage = gift?.imageFileName?.trim();
    if (!giftImage || !linkedGiftBasePath.trim()) {
      setSelectedLinkedGiftImage(null);
      return;
    }
    let cancelled = false;
    const loadImage = async () => {
      const query = new URLSearchParams({
        catalog_path: linkedGiftBasePath.trim(),
        filename: giftImage,
      }).toString();
      try {
        const res = await fetchApi(`/games/${gameKey}/pipelines/gift_images/image?${query}`);
        if (!res.ok) {
          if (!cancelled) setSelectedLinkedGiftImage(null);
          return;
        }
        const blob = await res.blob();
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
  }, [pipelineKey, selectedLinkedGiftId, linkedGiftsById, linkedGiftBasePath, gameKey]);

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

    let cancelled = false;
    const loadImages = async () => {
      const entries: Array<[string, string]> = [];
      const baseCatalogPath = catalogPath.trim();
      for (const gift of activeGifts) {
        const fn = gift.imageFileName?.trim();
        if (!fn) continue;
        const fallbackImageUrl = baseCatalogPath
          ? `/games/${gameKey}/pipelines/${pipelineKey}/image?${new URLSearchParams({
              catalog_path: baseCatalogPath,
              filename: fn,
            }).toString()}`
          : null;
        const sourceUrl = gift.image_url || fallbackImageUrl;
        if (!sourceUrl) continue;
        try {
          const res = await fetchApi(sourceUrl);
          if (!res.ok) continue;
          const blob = await res.blob();
          if (cancelled) return;
          const objectUrl = URL.createObjectURL(blob);
          entries.push([fn, objectUrl]);
        } catch {
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
  }, [gifts, fileGifts, pipelineKey, catalogPath, gameKey]);

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

  const allGiftItems = fileGifts ?? gifts ?? [];
  const filteredGiftItems =
    pipelineKey === "gift_images" && giftSearch.trim()
      ? allGiftItems.filter((gift) => {
          const q = giftSearch.trim().toLowerCase();
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
            {pipelineKey === "cities" && giftCatalogMissingForCities && !gameDataLoadError && (
              <p style={{ margin: 0, color: "#fbbf24", fontSize: 13 }}>
                Gift catalog not found at {gameDataPaths?.giftCatalogJson}. City→gift links will not match until
                it exists.
              </p>
            )}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button type="button" onClick={runPipeline} disabled={!!gameDataLoadError}>
                Run pipeline
              </button>
              {pipelineKey === "gift_images" && (
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
              )}
            </div>
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
                  : "Search by display name, id, or description..."
              }
            />
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
                                        setCreateGiftCityId(city.name_id);
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
                        {city.location_updates.slice(0, 3).map((u, idx) => (
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
                        {linkedGiftsById[selectedLinkedGiftId].placeIds.length > 0 && (
                          <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                            places: {linkedGiftsById[selectedLinkedGiftId].placeIds.join(", ")}
                          </div>
                        )}
                        {linkedGiftsById[selectedLinkedGiftId].activityTags.length > 0 && (
                          <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                            tags: {linkedGiftsById[selectedLinkedGiftId].activityTags.join(", ")}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                          priority: {linkedGiftsById[selectedLinkedGiftId].priority} · weight:{" "}
                          {linkedGiftsById[selectedLinkedGiftId].weight}
                        </div>
                        {linkedGiftsById[selectedLinkedGiftId].presentationId !== undefined &&
                          linkedGiftsById[selectedLinkedGiftId].presentationId !== "" && (
                            <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                              presentation: {linkedGiftsById[selectedLinkedGiftId].presentationId}
                            </div>
                          )}
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
                    ? `${imagesDir}/${imgName}`
                    : baseGiftsPath
                    ? `${baseGiftsPath}/Images/${imgName}`
                    : null
                  : null;
                return (
                  <div
                    key={gift.id || gift.displayName}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "140px 1fr",
                      gap: "1rem",
                      padding: "1rem",
                      background: "rgba(15, 23, 42, 0.45)",
                      borderRadius: 8,
                    }}
                  >
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
                          style={{ width: "100%", height: "100%", objectFit: "contain" }}
                        />
                      ) : (
                        "No image found"
                      )}
                    </div>
                    <div>
                      <strong>{gift.displayName || gift.id || "Untitled gift"}</strong>
                      {gift.placeIds.length > 0 && (
                        <div style={{ color: "var(--muted, #94a3b8)", fontSize: 13 }}>
                          Places: {gift.placeIds.join(", ")}
                        </div>
                      )}
                      {gift.activityTags.length > 0 && (
                        <div style={{ color: "var(--muted, #94a3b8)", fontSize: 13 }}>
                          Tags: {gift.activityTags.join(", ")}
                        </div>
                      )}
                      <div style={{ color: "var(--muted, #94a3b8)", fontSize: 13 }}>
                        Priority {gift.priority} · Weight {gift.weight}
                      </div>
                      {gift.description && <p style={{ marginTop: "0.5rem" }}>{gift.description}</p>}
                      {imgName && (
                        <div style={{ marginTop: "0.5rem", fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                          File: {imgName}
                        </div>
                      )}
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
              Fields match the catalog JSON: <code style={{ fontSize: 11 }}>placeIds</code>,{" "}
              <code style={{ fontSize: 11 }}>activityTags</code>, etc. If{" "}
              <strong>Place IDs</strong> is empty, the selected city is used as the only place.
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
              <span>Place IDs (comma-separated)</span>
              <input
                value={createGiftPlaceIds}
                onChange={(e) => setCreateGiftPlaceIds(e.target.value)}
                placeholder="paris, london_fr"
              />
            </label>
            <label style={{ display: "grid", gap: "0.25rem" }}>
              <span>City (used when Place IDs is empty)</span>
              <select value={createGiftCityId} onChange={(e) => setCreateGiftCityId(e.target.value)}>
                {availableCities.length === 0 && <option value="">No cities loaded</option>}
                {availableCities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
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
            <label style={{ display: "grid", gap: "0.25rem" }}>
              <span>Presentation ID</span>
              <input
                value={createGiftPresentationId}
                onChange={(e) => setCreateGiftPresentationId(e.target.value)}
                placeholder="Optional; use empty for none"
              />
            </label>
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
              {createGiftImageMode === "generate" && (
                <button
                  type="button"
                  disabled
                  style={{ opacity: 0.65, alignSelf: "flex-start", padding: "0.35rem 0.75rem" }}
                  title="Coming soon"
                >
                  Generate image (coming soon)
                </button>
              )}
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
                  setCreateGiftPlaceIds("");
                  setCreateGiftActivityTags("");
                  setCreateGiftPriority("10");
                  setCreateGiftWeight("2");
                  setCreateGiftPresentationId("");
                  setCreateGiftCityId(availableCities[0]?.id ?? "");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const giftCatalogPathForCreate = gameDataPaths?.giftCatalogJson?.trim() ?? "";
                  if (!giftCatalogPathForCreate) {
                    setCreateGiftStatus(
                      "Gift catalog path is not available. Set the project path in Admin and ensure gifts_catalog.json exists.",
                    );
                    return;
                  }
                  if (!createGiftId.trim()) {
                    setCreateGiftStatus("Gift id is required.");
                    return;
                  }
                  const placeIdsList = splitCsvToList(createGiftPlaceIds);
                  const cityTrim = createGiftCityId.trim();
                  if (!placeIdsList?.length && !cityTrim) {
                    setCreateGiftStatus("Enter at least one place ID (comma-separated) or select a city.");
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
                  const payloadBase = {
                    catalog_path: giftCatalogPathForCreate,
                    city_id: cityTrim,
                    gift_id: createGiftId.trim(),
                    description: createGiftDescription.trim(),
                    ...(createGiftDisplayName.trim()
                      ? { display_name: createGiftDisplayName.trim() }
                      : {}),
                    ...(placeIdsList ? { place_ids: placeIdsList } : {}),
                    ...(tagsList ? { activity_tags: tagsList } : {}),
                    priority: pr,
                    weight: w,
                    presentation_id: createGiftPresentationId.trim(),
                  };
                  setCreateGiftStatus("Creating...");
                  try {
                    let res: Response;
                    if (createGiftImageMode === "file" && createGiftImageFile) {
                      const form = new FormData();
                      form.append("catalog_path", giftCatalogPathForCreate);
                      form.append("city_id", cityTrim);
                      form.append("gift_id", createGiftId.trim());
                      form.append("description", createGiftDescription.trim());
                      form.append("display_name", createGiftDisplayName.trim());
                      form.append("place_ids_csv", createGiftPlaceIds.trim());
                      form.append("activity_tags_csv", createGiftActivityTags.trim());
                      form.append("priority_str", String(pr));
                      form.append("weight_str", String(w));
                      form.append("presentation_id", createGiftPresentationId.trim());
                      form.append("image", createGiftImageFile);
                      res = await fetchApi(`/games/${gameKey}/pipelines/gift_images/gifts/upload`, {
                        method: "POST",
                        body: form,
                      });
                    } else {
                      res = await fetchApi(`/games/${gameKey}/pipelines/gift_images/gifts`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payloadBase),
                      });
                    }
                    if (!res.ok) {
                      const errBody = (await res.json().catch(() => ({}))) as { detail?: string };
                      throw new Error(errBody.detail || `Create failed: ${res.status}`);
                    }
                    const data = (await res.json()) as {
                      gifts?: GiftItem[];
                      images_dir?: string;
                      created?: Record<string, unknown>;
                    };
                    setGifts(data.gifts || []);
                    setFileGifts(null);
                    setImagesDir(data.images_dir || null);
                    const created = data.created;
                    if (created && typeof created.id === "string") {
                      const id = created.id as string;
                      const c = created as Record<string, unknown>;
                      const placeIds = Array.isArray(c.placeIds)
                        ? c.placeIds.map((p) => String(p).trim()).filter(Boolean)
                        : typeof c.cityId === "string" && c.cityId.trim()
                        ? [c.cityId.trim()]
                        : [];
                      const tags = Array.isArray(c.activityTags)
                        ? c.activityTags.map((t) => String(t).trim()).filter(Boolean)
                        : [];
                      const pri = c.priority;
                      const priority =
                        typeof pri === "number" && !Number.isNaN(pri) ? pri : Number(pri) || 10;
                      const w = c.weight;
                      const weight = typeof w === "number" && !Number.isNaN(w) ? w : Number(w) || 2;
                      setLinkedGiftsById((prev) => ({
                        ...prev,
                        [id]: {
                          id,
                          displayName: String(c.displayName ?? ""),
                          description: String(c.description ?? ""),
                          placeIds,
                          activityTags: tags,
                          priority,
                          weight,
                          presentationId: String(c.presentationId ?? ""),
                          imageFileName: resolveGiftImageFileName(c),
                        },
                      }));
                    }
                    setCreateGiftStatus("Gift created.");
                    setShowCreateGift(false);
                    setCreateGiftId("");
                    setCreateGiftDisplayName("");
                    setCreateGiftDescription("");
                    setCreateGiftPlaceIds("");
                    setCreateGiftActivityTags("");
                    setCreateGiftPriority("10");
                    setCreateGiftWeight("2");
                    setCreateGiftPresentationId("");
                    setCreateGiftCityId(availableCities[0]?.id ?? "");
                    setCreateGiftImageFile(null);
                    setCreateGiftImageMode("file");
                  } catch (err) {
                    const message = err instanceof Error ? err.message : "Create failed.";
                    setCreateGiftStatus(message);
                  }
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
