"use client";

import { use, useEffect, useState } from "react";
import { fetchApi } from "../../../../lib/api";

type PipelineInfo = { key: string; name: string; description?: string };
type GiftItem = {
  id: string;
  name: string;
  description: string;
  rarity: string;
  image_filename?: string | null;
  image_exists: boolean;
  image_url?: string | null;
};
type GiftRunResponse = {
  ok: boolean;
  catalog_path: string;
  images_dir: string;
  gifts: GiftItem[];
};

type PageProps = {
  params: Promise<{
    gameKey: string;
    pipelineKey: string;
  }>;
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
      for (const gift of activeGifts) {
        if (!gift.image_url || !gift.image_exists || !gift.image_filename) continue;
        try {
          const res = await fetchApi(gift.image_url);
          if (!res.ok) continue;
          const blob = await res.blob();
          if (cancelled) return;
          const objectUrl = URL.createObjectURL(blob);
          entries.push([gift.image_filename, objectUrl]);
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
  }, [gifts, fileGifts, pipelineKey]);

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
    if (pipelineKey === "gift_images" && !catalogPath.trim()) {
      setStatus("Enter a catalog JSON path.");
      return;
    }
    if (pipelineKey !== "gift_images" && !selected) {
      setStatus("Select an input file.");
      return;
    }
    setStatus("Running...");
    setResult(null);
    setGifts(null);
    setFileGifts(null);
    setFileError(null);
    setImagesDir(null);
    try {
      const res = await fetchApi(`/games/${gameKey}/pipelines/${pipelineKey}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:
          pipelineKey === "gift_images"
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
      } else {
        setResult(JSON.stringify(data, null, 2));
      }
      setStatus("Done.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Run failed.";
      setStatus(`Error: ${message}`);
    }
  };

  return (
    <div style={{ maxWidth: 960, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ marginBottom: "0.5rem" }}>
        {pipeline?.name ?? pipelineKey}
      </h1>
      {pipeline?.description && (
        <p style={{ color: "var(--muted, #94a3b8)" }}>{pipeline.description}</p>
      )}

      <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem", alignItems: "center" }}>
        {pipelineKey === "gift_images" ? (
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1 }}>
            <span>Gift catalog JSON path</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setCatalogPath(e.target.value || file.name);
                setFileError(null);
                setFileGifts(null);
                const reader = new FileReader();
                reader.onerror = () => {
                  setFileError("Failed to read the selected file.");
                };
                reader.onload = () => {
                  try {
                    const text = typeof reader.result === "string" ? reader.result : "";
                    const parsed = JSON.parse(text) as { items?: unknown; gifts?: unknown };
                    const rawItems = Array.isArray(parsed.items) ? parsed.items : parsed.gifts;
                    if (!Array.isArray(rawItems)) {
                      throw new Error("Missing 'items' array in JSON.");
                    }
                    const mapped = rawItems
                      .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
                      .map((gift) => ({
                        id: String(gift.id ?? ""),
                        name: String(gift.displayName ?? gift.name ?? ""),
                        description: String(gift.description ?? ""),
                        rarity: String(gift.rarity ?? ""),
                        image_filename: gift.image_filename
                          ? String(gift.image_filename)
                          : gift.imageFileName
                          ? String(gift.imageFileName)
                          : gift.image
                          ? String(gift.image)
                          : null,
                        image_exists: false,
                        image_url:
                          typeof gift.image_url === "string"
                            ? gift.image_url
                            : typeof gift.image === "string" && gift.image.startsWith("http")
                            ? gift.image
                            : null,
                      }));
                    setFileGifts(mapped);
                  } catch (err) {
                    const message = err instanceof Error ? err.message : "Invalid JSON file.";
                    setFileError(message);
                  }
                };
                reader.readAsText(file);
              }}
            />
            <input
              value={catalogPath}
              onChange={(e) => setCatalogPath(e.target.value)}
              placeholder="D:/path/to/gift_catalog.json"
            />
          </label>
        ) : (
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
        )}
        <button type="button" onClick={runPipeline}>
          Run pipeline
        </button>
        {status && <span style={{ color: "var(--muted, #94a3b8)" }}>{status}</span>}
      </div>

      {imagesDir && pipelineKey === "gift_images" && (
        <p style={{ marginTop: "0.75rem", color: "var(--muted, #94a3b8)" }}>
          Images output: {imagesDir}
        </p>
      )}
      {fileError && pipelineKey === "gift_images" && (
        <p style={{ marginTop: "0.75rem", color: "#fca5a5" }}>{fileError}</p>
      )}

      {(fileGifts || gifts) && pipelineKey === "gift_images" && (
        <div style={{ marginTop: "1.5rem", display: "grid", gap: "1rem" }}>
          {(fileGifts ?? gifts ?? []).length === 0 && <p>No gifts found in catalog.</p>}
          {(fileGifts ?? gifts ?? []).map((gift) => {
            const imageUrl = gift.image_filename ? imageBlobs[gift.image_filename] : null;
            return (
              <div
                key={gift.id || gift.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr",
                  gap: "1rem",
                  padding: "1rem",
                  background: "rgba(15, 23, 42, 0.6)",
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
                  {imageUrl && gift.image_exists ? (
                    <img
                      src={imageUrl}
                      alt={gift.name}
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  ) : (
                    "No image found"
                  )}
                </div>
                <div>
                  <strong>{gift.name || gift.id || "Untitled gift"}</strong>
                  {gift.rarity && <div style={{ color: "var(--muted, #94a3b8)" }}>{gift.rarity}</div>}
                  {gift.description && <p style={{ marginTop: "0.5rem" }}>{gift.description}</p>}
                  {gift.image_filename && (
                    <div style={{ marginTop: "0.5rem", fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                      {gift.image_filename}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
    </div>
  );
}
