"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { IMAGEGEN_DEFAULT_IMAGE_MODEL } from "../../lib/imageModels";
import { normalizeImageUrl } from "../client";
import {
  IMAGEGEN_EDIT_CONTEXT_KEY,
  IMAGEGEN_EDIT_JOB_KEY,
  IMAGEGEN_EDIT_RETURN_KEY,
} from "../editKeys";
import {
  dimensionsFromSnapshot,
  getEditDraft,
  getPanelSnapshot,
  setEditDraft,
} from "../imagegenPanelSnapshot";
import type { GeneratedImage } from "../types";

export default function ImageGenEditPage() {
  const router = useRouter();
  const [source, setSource] = useState<GeneratedImage | null>(null);
  const [changes, setChanges] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(IMAGEGEN_EDIT_CONTEXT_KEY);
      if (!raw) {
        setError("No image context. Use Edit on a tile from the Image Generation page.");
        return;
      }
      const parsed = JSON.parse(raw) as GeneratedImage;
      if (!parsed?.id || !parsed?.url) {
        setError("Invalid image context.");
        return;
      }
      setSource(parsed);
      const draft = getEditDraft(parsed.id);
      if (draft !== undefined) {
        setChanges(draft);
      }
    } catch {
      setError("Could not load image context.");
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!source || !changes.trim()) return;
    const snap = getPanelSnapshot();
    const dims = snap ? dimensionsFromSnapshot(snap) : { width: 1024, height: 1024 };
    const model = snap?.imageModel?.trim() || IMAGEGEN_DEFAULT_IMAGE_MODEL;
    sessionStorage.removeItem(IMAGEGEN_EDIT_CONTEXT_KEY);
    const returnTo = sessionStorage.getItem(IMAGEGEN_EDIT_RETURN_KEY);
    sessionStorage.removeItem(IMAGEGEN_EDIT_RETURN_KEY);
    sessionStorage.setItem(
      IMAGEGEN_EDIT_JOB_KEY,
      JSON.stringify({
        changes: changes.trim(),
        image: source,
        width: dims.width,
        height: dims.height,
        model,
        ...(returnTo?.trim() ? { returnTo: returnTo.trim() } : {}),
      }),
    );
    const qs = new URLSearchParams();
    qs.set("runEdit", "1");
    const rt = returnTo?.trim();
    if (rt) qs.set("returnTo", rt);
    const safeReturnTo = rt && rt.startsWith("/") && !rt.startsWith("//") ? rt : "";
    if (safeReturnTo.startsWith("/uiBuilder")) {
      const sep = safeReturnTo.includes("?") ? "&" : "?";
      router.push(`${safeReturnTo}${sep}${qs.toString()}`);
      return;
    }
    router.push(`/imageGen?${qs.toString()}`);
  };

  return (
    <main
      className="imagegen-edit-page"
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        margin: 0,
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        overflow: "hidden",
        alignSelf: "stretch",
        alignItems: "center",
        justifyContent: "flex-start",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "min(960px, 100%)",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          overflow: "hidden",
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            flexShrink: 0,
            width: "100%",
          }}
        >
          <button
            type="button"
            className="imagegen-delete-button"
            onClick={() => {
              const rt = sessionStorage.getItem(IMAGEGEN_EDIT_RETURN_KEY)?.trim();
              if (rt?.startsWith("/") && !rt.startsWith("//")) {
                router.push(rt);
              } else {
                router.push("/imageGen");
              }
            }}
          >
            Back
          </button>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>Edit image</h1>
        </div>
        {error && (
          <div className="status" style={{ flexShrink: 0, textAlign: "center" }}>
            {error}
          </div>
        )}
        {source && !error && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              overflow: "hidden",
              alignItems: "center",
              width: "100%",
            }}
          >
            <div
              style={{
                flex: 1,
                minHeight: 0,
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(15, 23, 42, 0.45)",
                borderRadius: 12,
                border: "1px solid rgba(148, 163, 184, 0.2)",
                padding: "8px",
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              <img
                src={normalizeImageUrl(source.url)}
                alt=""
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  width: "auto",
                  height: "auto",
                  objectFit: "contain",
                  borderRadius: 8,
                }}
              />
            </div>

            <form
              onSubmit={handleSubmit}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                width: "100%",
                maxWidth: "min(520px, 100%)",
                flexShrink: 0,
                alignItems: "stretch",
                alignSelf: "center",
              }}
            >
              <label
                className="imagegen-label"
                htmlFor="edit-changes"
                style={{ margin: 0, textAlign: "center" }}
              >
                Changes
              </label>
              <textarea
                id="edit-changes"
                className="imagegen-textarea"
                value={changes}
                onChange={(e) => {
                  const v = e.target.value;
                  setChanges(v);
                  if (source?.id) {
                    setEditDraft(source.id, v);
                  }
                }}
                rows={3}
                placeholder="Describe what to change (e.g. add a red hat, make the background darker)"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  resize: "none",
                  maxHeight: "22vh",
                  minHeight: 0,
                }}
              />
              <button type="submit" className="imagegen-generate-button" disabled={!changes.trim()}>
                Submit
              </button>
            </form>
            <p
              style={{
                fontSize: 12,
                color: "var(--muted, #94a3b8)",
                margin: 0,
                flexShrink: 0,
                lineHeight: 1.35,
                textAlign: "center",
                width: "100%",
                maxWidth: "min(520px, 100%)",
                alignSelf: "center",
              }}
            >
              Uses the Image Gen panel settings (size, quality, model) from when you opened Edit — in memory until you refresh the app.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
