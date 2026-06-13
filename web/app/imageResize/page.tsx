"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DismissButton } from "../components/DismissButton";
import { isLocalAgentContext, localAgent } from "../lib/localAgentClient";

type ImagePreview = {
  name: string;
  relativePath: string;
  url: string | null;
  width: number | null;
  height: number | null;
  error: string | null;
};

const SUPPORTED_IMAGE_EXTENSIONS: Set<string> = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".bmp",
  ".gif",
]);

function isSupportedImageFileName(name: string): boolean {
  const trimmed: string = name.trim();
  const dot: number = trimmed.lastIndexOf(".");
  if (dot < 0) {
    return false;
  }
  return SUPPORTED_IMAGE_EXTENSIONS.has(trimmed.slice(dot).toLowerCase());
}

function parsePositiveInteger(value: string): number | null {
  const parsed: number = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

function readImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image: HTMLImageElement = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Failed to decode image preview."));
    image.src = url;
  });
}

export default function ImageResizePage() {
  const [eligible, setEligible] = useState<boolean>(false);
  const [localAgentOk, setLocalAgentOk] = useState<boolean>(false);
  const [directory, setDirectory] = useState<string>("");
  const [sizeX, setSizeX] = useState<string>("1024");
  const [sizeY, setSizeY] = useState<string>("1024");
  const [status, setStatus] = useState<string | null>(null);
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState<boolean>(false);
  const [resizing, setResizing] = useState<boolean>(false);
  const previewUrlsRef = useRef<string[]>([]);

  const replaceImages = useCallback((nextImages: ImagePreview[]) => {
    for (const url of previewUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    previewUrlsRef.current = nextImages
      .map((image) => image.url)
      .filter((url): url is string => typeof url === "string" && url.length > 0);
    setImages(nextImages);
  }, []);

  useEffect(() => {
    setEligible(isLocalAgentContext());
  }, []);

  useEffect(() => {
    if (!eligible) {
      return;
    }
    let cancelled: boolean = false;
    void localAgent.health().then((ok) => {
      if (!cancelled) {
        setLocalAgentOk(ok);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [eligible]);

  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  const loadDirectory = useCallback(
    async (rawDirectory: string) => {
      const trimmed: string = rawDirectory.trim();
      if (!trimmed) {
        replaceImages([]);
        return;
      }
      setLoadingDirectory(true);
      try {
        await localAgent.approveProjectRoot(trimmed);
        const listing = await localAgent.listDir(trimmed, ".");
        const entries = listing.entries
          .filter((entry) => entry.is_file && isSupportedImageFileName(entry.name))
          .sort((a, b) => a.name.localeCompare(b.name));

        const nextImages: ImagePreview[] = await Promise.all(
          entries.map(async (entry) => {
            let objectUrl: string | null = null;
            try {
              const blob: Blob = await localAgent.readBinary(trimmed, entry.name);
              objectUrl = URL.createObjectURL(blob);
              const dims = await readImageDimensions(objectUrl);
              return {
                name: entry.name,
                relativePath: entry.name,
                url: objectUrl,
                width: dims.width,
                height: dims.height,
                error: null,
              };
            } catch (error) {
              if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
              }
              const message: string = error instanceof Error ? error.message : "Failed to load image preview.";
              return {
                name: entry.name,
                relativePath: entry.name,
                url: null,
                width: null,
                height: null,
                error: message,
              };
            }
          })
        );
        replaceImages(nextImages);
        if (nextImages.length === 0) {
          setStatus("No supported images were found in that directory.");
        } else {
          setStatus(null);
        }
      } catch (error) {
        replaceImages([]);
        const message: string = error instanceof Error ? error.message : "Failed to load directory.";
        setStatus(`Error: ${message}`);
      } finally {
        setLoadingDirectory(false);
      }
    },
    [replaceImages]
  );

  const handleBrowseDirectory = useCallback(async () => {
    setStatus(null);
    try {
      const picked = await localAgent.pickDirectory();
      if (picked.cancelled) {
        return;
      }
      const nextDirectory: string = picked.path.trim();
      setDirectory(nextDirectory);
      await loadDirectory(nextDirectory);
    } catch (error) {
      const message: string = error instanceof Error ? error.message : "Directory picker failed.";
      setStatus(`Error: ${message}`);
    }
  }, [loadDirectory]);

  const handleResize = useCallback(async () => {
    const trimmedDirectory: string = directory.trim();
    const width: number | null = parsePositiveInteger(sizeX);
    const height: number | null = parsePositiveInteger(sizeY);
    if (!trimmedDirectory) {
      setStatus("Choose a directory first.");
      return;
    }
    if (width === null || height === null) {
      setStatus("Size X and Size Y must both be positive integers.");
      return;
    }
    setResizing(true);
    setStatus(null);
    try {
      await localAgent.approveProjectRoot(trimmedDirectory);
      const result = await localAgent.resizeImagesInDirectory({
        directory_path: trimmedDirectory,
        width,
        height,
      });
      if (result.processed_count === 0 && result.failed_count === 0) {
        setStatus("No supported images were found in that directory.");
      } else if (result.failed_count > 0) {
        setStatus(
          `Resized ${result.processed_count} image(s) to ${width} x ${height}. ${result.failed_count} file(s) failed.`
        );
      } else {
        setStatus(`Resized ${result.processed_count} image(s) to ${width} x ${height}.`);
      }
      await loadDirectory(trimmedDirectory);
    } catch (error) {
      const message: string = error instanceof Error ? error.message : "Resize failed.";
      setStatus(`Error: ${message}`);
    } finally {
      setResizing(false);
    }
  }, [directory, loadDirectory, sizeX, sizeY]);

  if (!eligible) {
    return (
      <div style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem" }}>
        <div className="app-modal-header app-modal-header--center" style={{ marginBottom: "1rem" }}>
          <h1 style={{ margin: 0, flex: 1 }}>ImageResize</h1>
          <DismissButton href="/" label="Back" />
        </div>
        <p style={{ color: "var(--muted, #94a3b8)" }}>
          This tool is only available when you open the app at <strong>http://localhost</strong> or{" "}
          <strong>http://127.0.0.1</strong>. It uses the local agent on your machine to browse folders and resize files
          directly on disk.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "calc(100vw - 24px)",
        margin: "2rem auto",
        padding: "0 1rem",
        display: "grid",
        gridTemplateColumns: "320px minmax(0, 1fr)",
        gap: "1rem",
        alignItems: "start",
      }}
    >
      <section className="imagegen-panel" style={{ position: "sticky", top: 84 }}>
        <h2 className="imagegen-panel-title">ImageResize</h2>
        <div className="imagegen-panel-body">
          <p style={{ margin: 0, color: "var(--muted, #94a3b8)", fontSize: 13 }}>
            Choose a directory, preview the images on the right, then set every image in that folder to the same size.
          </p>

          <div
            style={{
              padding: "0.75rem",
              borderRadius: 10,
              border: "1px solid rgba(148, 163, 184, 0.2)",
              background: "rgba(15, 23, 42, 0.4)",
              fontSize: 13,
              display: "grid",
              gap: "0.35rem",
            }}
          >
            <div>
              <strong>Local agent</strong>:{" "}
              {localAgentOk ? (
                <span style={{ color: "#22c55e" }}>online</span>
              ) : (
                <span style={{ color: "#f87171" }}>offline</span>
              )}
            </div>
          </div>

          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span className="imagegen-label">directory</span>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.5rem" }}>
              <input
                value={directory}
                onChange={(event) => setDirectory(event.target.value)}
                onBlur={() => void loadDirectory(directory)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void loadDirectory(directory);
                  }
                }}
                placeholder="Choose a folder"
              />
              <button type="button" onClick={() => void handleBrowseDirectory()} disabled={loadingDirectory || resizing}>
                Browse
              </button>
            </div>
          </label>

          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span className="imagegen-label">Size X</span>
            <input value={sizeX} onChange={(event) => setSizeX(event.target.value)} inputMode="numeric" />
          </label>

          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span className="imagegen-label">Size Y</span>
            <input value={sizeY} onChange={(event) => setSizeY(event.target.value)} inputMode="numeric" />
          </label>

          <button type="button" onClick={() => void handleResize()} disabled={loadingDirectory || resizing}>
            {resizing ? "Resizing..." : "Set Images Size"}
          </button>

          {status ? (
            <div
              style={{
                whiteSpace: "pre-wrap",
                fontSize: 13,
                color: status.startsWith("Error:") ? "#fca5a5" : "var(--muted, #cbd5e1)",
              }}
            >
              {status}
            </div>
          ) : null}
        </div>
      </section>

      <section className="imagegen-panel" style={{ minHeight: "calc(100vh - 116px)" }}>
        <div className="imagegen-results-header">
          <h2 className="imagegen-panel-title">Images</h2>
          <div style={{ fontSize: 13, color: "var(--muted, #94a3b8)" }}>
            {loadingDirectory ? "Loading..." : `${images.length} image(s)`}
          </div>
        </div>
        <div className="imagegen-panel-body" style={{ gap: "0.9rem" }}>
          <div style={{ fontSize: 13, color: "var(--muted, #94a3b8)", wordBreak: "break-all" }}>
            {directory.trim() ? directory.trim() : "Choose a directory to preview its images."}
          </div>

          {images.length === 0 ? (
            <div style={{ color: "var(--muted, #94a3b8)", fontSize: 13 }}>
              {loadingDirectory ? "Reading images..." : "No images to show."}
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: "0.9rem",
                alignItems: "start",
              }}
            >
              {images.map((image) => (
                <div
                  key={image.relativePath}
                  style={{
                    border: "1px solid #2a2f3a",
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "#0f1115",
                    display: "grid",
                    gap: 0,
                  }}
                >
                  <div
                    style={{
                      aspectRatio: "1 / 1",
                      background: "#0b0e13",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {image.url ? (
                      <img
                        src={image.url}
                        alt={image.name}
                        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                      />
                    ) : (
                      <div style={{ padding: "0.75rem", fontSize: 12, color: "#fca5a5", textAlign: "center" }}>
                        {image.error || "Preview unavailable"}
                      </div>
                    )}
                  </div>
                  <div style={{ padding: "0.75rem", display: "grid", gap: "0.35rem" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, wordBreak: "break-word" }}>{image.name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                      {image.width !== null && image.height !== null
                        ? `${image.width} x ${image.height}`
                        : image.error || "Unknown size"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
