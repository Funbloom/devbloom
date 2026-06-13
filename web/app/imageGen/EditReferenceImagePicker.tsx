"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import {
  buildLocalImageServeUrl,
  getImageGenerated,
  importImageFile,
  normalizeImageUrl,
  putImageGenerated,
  resolveImageDisplayUrl,
  resolveReferenceForEditApi,
} from "./client";
import { filterImagesForProject, imageBelongsToProject, parseStoredImages, toPayload } from "./persistence";
import type { GeneratedImage } from "./types";

export const MAX_EDIT_REFERENCE_IMAGES = 15;

const LOG_PREFIX = "[EditRefPicker]";

function logRefError(step: string, detail?: unknown): void {
  if (detail === undefined) {
    console.error(`${LOG_PREFIX} ${step}`);
    return;
  }
  console.error(`${LOG_PREFIX} ${step}`, detail);
}

function canUseAsEditReference(img: GeneratedImage): boolean {
  try {
    resolveReferenceForEditApi(img);
    return true;
  } catch {
    return false;
  }
}

function imageLabel(img: GeneratedImage): string {
  const prompt = (img.prompt || "").trim();
  if (prompt) {
    return prompt.length > 48 ? `${prompt.slice(0, 48)}…` : prompt;
  }
  const fn = (img.filename || "").trim();
  if (fn) {
    return fn.length > 48 ? `${fn.slice(0, 48)}…` : fn;
  }
  return "Image";
}

function buildImportedImage(
  file: File,
  imported: { url?: string; filename?: string },
  index: number,
  projectKey: string,
): GeneratedImage | null {
  const filename =
    typeof imported.filename === "string" && imported.filename.trim()
      ? imported.filename.trim()
      : (() => {
          const raw = String(imported.url || "").trim();
          if (!raw) {
            return "";
          }
          try {
            const u = new URL(raw, typeof window !== "undefined" ? window.location.origin : "http://localhost");
            const pathname = u.pathname || "";
            const idx = pathname.lastIndexOf("/");
            return idx >= 0 ? decodeURIComponent(pathname.slice(idx + 1)) : "";
          } catch {
            return "";
          }
        })();
  if (!filename) {
    return null;
  }
  const now = new Date().toISOString();
  const item: GeneratedImage = {
    id: `${now}-edit-ref-${index}-${Math.random().toString(36).slice(2)}`,
    url: "",
    filename,
    prompt: `Reference: ${file.name.trim() || "uploaded image"}`,
    createdAt: now,
    tab: "image",
    location: "local",
  };
  const canonical = buildLocalImageServeUrl(item, projectKey);
  if (canonical) {
    item.url = canonical;
  } else {
    const raw = String(imported.url || "").trim();
    item.url = raw.startsWith("http") ? raw : normalizeImageUrl(raw || `/images/${filename}`);
  }
  return item;
}

type Props = {
  projectKey: string;
  sourceImageId: string | null;
  selectedIds: string[];
  onSelectedIdsChange: (value: string[] | ((prev: string[]) => string[])) => void;
  onSelectedImagesChange?: (images: GeneratedImage[]) => void;
  disabled?: boolean;
};

export function EditReferenceImagePicker({
  projectKey,
  sourceImageId,
  selectedIds,
  onSelectedIdsChange,
  onSelectedImagesChange,
  disabled = false,
}: Props) {
  const [projectImages, setProjectImages] = useState<GeneratedImage[]>([]);
  const [diskUploadsById, setDiskUploadsById] = useState<Record<string, GeneratedImage>>({});
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedGalleryProjectRef = useRef<string>("");

  const reloadProjectImages = useCallback(async (pk: string) => {
    const { images } = await getImageGenerated(pk);
    return filterImagesForProject(parseStoredImages(images, pk), pk);
  }, []);

  useEffect(() => {
    const pk = projectKey.trim();
    if (!pk) {
      loadedGalleryProjectRef.current = "";
      setProjectImages([]);
      setDiskUploadsById({});
      return;
    }
    if (loadedGalleryProjectRef.current && loadedGalleryProjectRef.current !== pk) {
      setDiskUploadsById({});
      onSelectedIdsChange([]);
    }
    let cancelled = false;
    setLoading(true);
    void reloadProjectImages(pk)
      .then((items) => {
        if (!cancelled) {
          loadedGalleryProjectRef.current = pk;
          setProjectImages(items);
          onSelectedIdsChange((prev) => {
            const valid = new Set(items.map((img) => img.id));
            return prev.filter((id) => valid.has(id));
          });
        }
      })
      .catch((err) => {
        logRefError("loadProjectImages failed", err);
        if (!cancelled) {
          setProjectImages([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectKey, reloadProjectImages, onSelectedIdsChange]);

  useEffect(() => {
    if (!dropdownOpen) {
      return;
    }
    const onDocClick = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [dropdownOpen]);

  useEffect(() => {
    if (!uploadSuccess) {
      return;
    }
    const timer = window.setTimeout(() => setUploadSuccess(null), 4000);
    return () => window.clearTimeout(timer);
  }, [uploadSuccess]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const pk = projectKey.trim();

  const imagesById = useMemo(() => {
    const map = new Map<string, GeneratedImage>();
    for (const img of projectImages) {
      map.set(img.id, img);
    }
    for (const [id, img] of Object.entries(diskUploadsById)) {
      map.set(id, img);
    }
    return map;
  }, [diskUploadsById, projectImages]);

  const selectedImages = useMemo(
    () =>
      selectedIds
        .map((id) => imagesById.get(id))
        .filter((img): img is GeneratedImage => Boolean(img))
        .filter((img) => !pk || imageBelongsToProject(img, pk)),
    [selectedIds, imagesById, pk],
  );

  useEffect(() => {
    onSelectedImagesChange?.(selectedImages);
  }, [onSelectedImagesChange, selectedImages]);

  const candidates = useMemo(() => {
    return projectImages.filter((img) => {
      if (sourceImageId && img.id === sourceImageId) {
        return false;
      }
      if (selectedSet.has(img.id)) {
        return false;
      }
      return canUseAsEditReference(img);
    });
  }, [projectImages, sourceImageId, selectedSet]);

  const atMax = selectedIds.length >= MAX_EDIT_REFERENCE_IMAGES;

  const addImage = (id: string) => {
    if (atMax || selectedSet.has(id)) {
      return;
    }
    onSelectedIdsChange((prev) => [...prev, id]);
    setDropdownOpen(false);
  };

  const removeAt = (index: number) => {
    const id = selectedIds[index];
    onSelectedIdsChange((prev) => prev.filter((_, i) => i !== index));
    if (id && diskUploadsById[id]) {
      setDiskUploadsById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const appendToProjectGallery = async (projectKeyValue: string, newItems: GeneratedImage[]) => {
    const existing = await reloadProjectImages(projectKeyValue);
    const existingIds = new Set(existing.map((img) => img.id));
    const existingFilenames = new Set(
      existing.map((img) => img.filename?.trim()).filter((fn): fn is string => Boolean(fn)),
    );
    const toAppend = newItems.filter((item) => {
      if (existingIds.has(item.id)) {
        return false;
      }
      const fn = item.filename?.trim();
      if (fn && existingFilenames.has(fn)) {
        return false;
      }
      return true;
    });
    if (toAppend.length === 0) {
      return;
    }
    await putImageGenerated(projectKeyValue, [...existing, ...toAppend].map(toPayload));
  };

  const addReferencesFromFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) {
        return;
      }
      const projectKeyValue = projectKey.trim();
      if (!projectKeyValue) {
        setUploadError("Set an active project in Admin before adding images from disk.");
        setUploadSuccess(null);
        return;
      }
      if (selectedIds.length >= MAX_EDIT_REFERENCE_IMAGES) {
        setUploadError("Maximum reference images reached.");
        setUploadSuccess(null);
        return;
      }
      setUploadError(null);
      setUploadSuccess(null);
      setUploading(true);
      try {
        const slotsLeft = MAX_EDIT_REFERENCE_IMAGES - selectedIds.length;
        const newItems: GeneratedImage[] = [];
        const failedFiles: string[] = [];
        for (const file of files) {
          if (newItems.length >= slotsLeft) {
            break;
          }
          try {
            const importedList = await importImageFile(file, projectKeyValue);
            const imported = importedList[0];
            if (!imported) {
              failedFiles.push(file.name);
              continue;
            }
            const item = buildImportedImage(file, imported, newItems.length, projectKeyValue);
            if (!item || !canUseAsEditReference(item)) {
              failedFiles.push(file.name);
              continue;
            }
            newItems.push(item);
          } catch (fileErr) {
            logRefError("importImageFile failed", { file: file.name, error: fileErr });
            failedFiles.push(file.name);
            if (newItems.length === 0 && files.length === 1) {
              throw fileErr;
            }
          }
        }
        if (newItems.length === 0) {
          logRefError("no items after import loop", { failedFiles });
          setUploadError(
            failedFiles.length
              ? `Could not add: ${failedFiles.join(", ")}`
              : "Could not add the selected file(s) as references.",
          );
          return;
        }

        const uploadsRecord: Record<string, GeneratedImage> = {};
        for (const item of newItems) {
          uploadsRecord[item.id] = item;
        }
        setDiskUploadsById((prev) => ({ ...prev, ...uploadsRecord }));
        setProjectImages((prev) => {
          const map = new Map(prev.map((img) => [img.id, img]));
          for (const item of newItems) {
            map.set(item.id, item);
          }
          return Array.from(map.values());
        });
        onSelectedIdsChange((prev) => {
          const next = [...prev];
          for (const item of newItems) {
            if (!next.includes(item.id)) {
              next.push(item.id);
            }
          }
          return next;
        });

        try {
          await appendToProjectGallery(projectKeyValue, newItems);
        } catch (persistErr) {
          logRefError("appendToProjectGallery failed", persistErr);
          const detail = persistErr instanceof Error ? persistErr.message : "Gallery save failed.";
          setUploadError(`Reference added for this edit. Gallery sync failed: ${detail}`);
        }

        const countLabel = newItems.length === 1 ? "1 reference image" : `${newItems.length} reference images`;
        setUploadSuccess(`Added ${countLabel}.`);
        if (failedFiles.length > 0) {
          setUploadError(`Some files were skipped: ${failedFiles.join(", ")}`);
        } else {
          setUploadError(null);
        }
      } catch (e) {
        logRefError("addReferencesFromFiles failed", e);
        setUploadError(e instanceof Error ? e.message : "Reference upload failed.");
        setUploadSuccess(null);
      } finally {
        setUploading(false);
      }
    },
    [onSelectedIdsChange, projectKey, reloadProjectImages, selectedIds.length],
  );

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    // FileList is live — copy before clearing input.value or it becomes empty.
    const files = Array.from(input.files ?? []);
    if (!files.length) {
      return;
    }
    void addReferencesFromFiles(files).finally(() => {
      input.value = "";
    });
  };

  return (
    <div className="imagegen-edit-ref-picker">
      <div className="imagegen-label-row" style={{ marginBottom: 4 }}>
        <span className="imagegen-label" style={{ margin: 0 }}>
          Reference images
        </span>
        <span className="imagegen-edit-ref-count" style={{ fontSize: 11, color: "var(--muted, #94a3b8)" }}>
          {selectedIds.length}/{MAX_EDIT_REFERENCE_IMAGES}
        </span>
      </div>
      <p style={{ margin: "0 0 0.5rem", fontSize: 11, color: "var(--muted, #64748b)", lineHeight: 1.35 }}>
        Optional extra images used alongside the source image during edit. Pick from the project or upload from disk.
      </p>
      {uploadSuccess && (
        <p style={{ margin: "0 0 0.35rem", fontSize: 12, color: "#4ade80" }} role="status">
          {uploadSuccess}
        </p>
      )}
      {uploadError && (
        <p style={{ margin: "0 0 0.35rem", fontSize: 12, color: "#f87171" }} role="alert">
          {uploadError}
        </p>
      )}
      {uploading && (
        <p style={{ margin: "0 0 0.35rem", fontSize: 12, color: "var(--muted, #94a3b8)" }}>Uploading…</p>
      )}
      {!pk && (
        <p style={{ margin: 0, fontSize: 12, color: "#fbbf24" }} role="status">
          Set an active project in Admin to pick reference images.
        </p>
      )}
      {selectedImages.length > 0 && (
        <ul className="imagegen-edit-ref-selected" aria-label="Selected reference images">
          {selectedImages.map((img, index) => {
            const thumbUrl =
              img.url.startsWith("blob:") || img.url.startsWith("data:")
                ? img.url
                : pk
                  ? resolveImageDisplayUrl(img, pk)
                  : img.url;
            return (
              <li key={img.id} className="imagegen-edit-ref-selected-item">
                <img src={thumbUrl} alt="" className="imagegen-edit-ref-thumb" />
                <span className="imagegen-edit-ref-label" title={imageLabel(img)}>
                  {imageLabel(img)}
                </span>
                <button
                  type="button"
                  className="imagegen-edit-ref-remove"
                  aria-label={`Remove reference ${imageLabel(img)}`}
                  disabled={disabled}
                  onClick={() => removeAt(index)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <input
        ref={fileInputRef}
        id="edit-ref-file-input"
        type="file"
        accept="image/*"
        multiple
        className="imagegen-hidden-file-input"
        onChange={onFileInputChange}
      />
      <div className="imagegen-edit-ref-actions">
        <button
          type="button"
          className="imagegen-import-button"
          disabled={disabled || !pk || atMax || uploading}
          onClick={() => {
            if (disabled || !pk || atMax || uploading) {
              return;
            }
            setUploadError(null);
            const input = fileInputRef.current;
            if (!input) {
              logRefError("file input ref is null");
              setUploadError("File picker is not available. Refresh the page and try again.");
              return;
            }
            input.click();
          }}
        >
          {uploading ? "Uploading…" : "Add from disk"}
        </button>
        <div className="imagegen-edit-ref-dropdown-wrap" ref={dropdownRef}>
          <button
            id="edit-ref-add"
            type="button"
            className="imagegen-select imagegen-edit-ref-add-button"
            disabled={disabled || !pk || atMax || loading || uploading}
            aria-expanded={dropdownOpen}
            aria-haspopup="listbox"
            onClick={() => setDropdownOpen((open) => !open)}
          >
            {loading ? "Loading images…" : atMax ? "Maximum references reached" : "Add from project…"}
          </button>
          {dropdownOpen && pk && !atMax && (
            <ul className="imagegen-edit-ref-dropdown" role="listbox" aria-label="Project images">
              {candidates.length === 0 ? (
                <li className="imagegen-edit-ref-dropdown-empty">No more images available.</li>
              ) : (
                candidates.map((img) => {
                  const thumbUrl = resolveImageDisplayUrl(img, pk);
                  const label = imageLabel(img);
                  return (
                    <li key={img.id}>
                      <button
                        type="button"
                        className="imagegen-edit-ref-dropdown-option"
                        role="option"
                        onClick={() => addImage(img.id)}
                      >
                        <img src={thumbUrl} alt="" className="imagegen-edit-ref-dropdown-thumb" />
                        <span className="imagegen-edit-ref-dropdown-label" title={label}>
                          {label}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
