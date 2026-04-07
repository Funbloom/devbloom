"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getLocalProjectPath, localAgent } from "../lib/localAgentClient";

function isStrictLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1";
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fileToBase64Raw(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  return arrayBufferToBase64(buf);
}

export default function MeshGenPage() {
  const [eligible, setEligible] = useState(false);
  const [projectKey, setProjectKey] = useState("");
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [localAgentOk, setLocalAgentOk] = useState(false);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [seed, setSeed] = useState("1234");
  const [octreeResolution, setOctreeResolution] = useState("128");
  const [numInferenceSteps, setNumInferenceSteps] = useState("5");
  const [guidanceScale, setGuidanceScale] = useState("5.0");
  const [texture, setTexture] = useState(false);
  const [faceCount, setFaceCount] = useState("12000");
  const [exportType, setExportType] = useState<"glb" | "obj">("glb");

  const [status, setStatus] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);

  useEffect(() => {
    setEligible(isStrictLocalhost());
  }, []);

  const refreshProject = useCallback(() => {
    const key = typeof window !== "undefined" ? window.localStorage.getItem("activeProjectKey")?.trim() ?? "" : "";
    setProjectKey(key);
    setProjectRoot(key ? getLocalProjectPath(key) : null);
  }, []);

  useEffect(() => {
    refreshProject();
    const onChange = () => refreshProject();
    window.addEventListener("activeProjectChanged", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("activeProjectChanged", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refreshProject]);

  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    void localAgent.health().then((ok) => {
      if (!cancelled) setLocalAgentOk(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [eligible]);

  const handleGenerate = async () => {
    setStatus(null);
    setLastSavedPath(null);
    if (!eligible) {
      setStatus(
        "MeshGen only runs on http://localhost or http://127.0.0.1 (browser must reach the local agent running Hunyuan3D in-process)."
      );
      return;
    }
    if (!projectRoot?.trim()) {
      setStatus("Set a local project path in Admin → Projects for the active project.");
      return;
    }
    if (!imageFile) {
      setStatus("Choose an input image.");
      return;
    }
    if (!localAgentOk) {
      setStatus("Start the local agent (e.g. local_agent/run.bat) so files can be saved under the project.");
      return;
    }

    const seedN = Number.parseInt(seed, 10);
    const octree = Number.parseInt(octreeResolution, 10);
    const steps = Number.parseInt(numInferenceSteps, 10);
    const guidance = Number.parseFloat(guidanceScale);
    const faces = Number.parseInt(faceCount, 10);
    if (!Number.isFinite(seedN) || !Number.isFinite(octree) || !Number.isFinite(steps) || !Number.isFinite(guidance)) {
      setStatus("Seed, octree resolution, steps, and guidance must be valid numbers.");
      return;
    }
    if (!Number.isFinite(faces) || faces < 500 || faces > 500000) {
      setStatus("Max faces must be a number between 500 and 500000 (lower = fewer triangles / vertices).");
      return;
    }

    setIsWorking(true);
    try {
      await localAgent.approveProjectRoot(projectRoot.trim());
      const imageB64 = await fileToBase64Raw(imageFile);

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeStem =
        (imageFile.name || "mesh").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 48) || "mesh";
      const relPath = `gen/3dmesh/${safeStem}_${stamp}.${exportType}`;

      const result = await localAgent.meshgenGenerate({
        project_root: projectRoot.trim(),
        relative_path: relPath,
        image: imageB64,
        seed: seedN,
        octree_resolution: octree,
        num_inference_steps: steps,
        guidance_scale: guidance,
        texture,
        type: exportType,
        face_count: faces,
      });
      const displayPath = (result.path || "").trim();
      if (displayPath) {
        setLastSavedPath(displayPath);
        setStatus(`Saved mesh to:\n${displayPath}`);
      } else {
        setLastSavedPath(null);
        setStatus(`Saved mesh (relative to project): ${result.relative_path ?? relPath}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed.";
      setStatus(`Error: ${msg}`);
    } finally {
      setIsWorking(false);
    }
  };

  if (!eligible) {
    return (
      <div style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem" }}>
        <h1 style={{ marginTop: 0 }}>Mesh Gen</h1>
        <p style={{ color: "var(--muted, #94a3b8)" }}>
          This tool is only available when you open the app at{" "}
          <strong>http://localhost</strong> or <strong>http://127.0.0.1</strong>. It calls{" "}
          <a href="https://github.com/Tencent-Hunyuan/Hunyuan3D-2">Hunyuan3D-2</a> inside the local agent on your machine.
        </p>
        <Link href="/">Back</Link>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        maxWidth: 720,
        margin: "2rem auto",
        padding: "0 1rem",
        display: "grid",
        gap: "1.25rem",
        ...(isWorking ? { minHeight: "min(70vh, 900px)" } : {}),
      }}
    >
      {isWorking && (
        <div className="generate-overlay" aria-live="polite" aria-busy="true">
          <div className="generate-spinner" />
          <div className="generate-overlay-text">Generating mesh…</div>
        </div>
      )}
      <div>
        <h1 style={{ marginTop: 0 }}>Mesh Gen</h1>
        <p style={{ margin: 0, color: "var(--muted, #94a3b8)", fontSize: 14 }}>
          Image → 3D mesh using{" "}
          <a href="https://github.com/Tencent-Hunyuan/Hunyuan3D-2?tab=readme-ov-file#">Hunyuan3D-2</a> loaded{" "}
          <strong>in-process</strong> inside the local agent (same Python env as <code>local_agent/run.bat</code>).
          Output is written to <code style={{ fontSize: 12 }}>gen/3dmesh/</code> under your approved project root.
          Install Hunyuan3D-2 and PyTorch/CUDA in that venv per upstream docs; texture uses the paint pipeline on first
          textured request.
        </p>
        <p style={{ margin: "0.75rem 0 0", color: "var(--muted, #94a3b8)", fontSize: 13 }}>
          <strong>Skeletons / rigging:</strong> Hunyuan3D-2 does <strong>not</strong> create bones or skin weights—only mesh
          (and optional textures). There is no model option for auto-rigging here. Typical workflow: export GLB/OBJ, then
          rig in a DCC or service (e.g. Blender with Rigify, or an auto-rig upload tool), or rig in Unity/Unreal after
          import.
        </p>
      </div>

      <div
        style={{
          padding: "0.75rem",
          borderRadius: 8,
          background: "rgba(15, 23, 42, 0.5)",
          border: "1px solid rgba(148, 163, 184, 0.2)",
          fontSize: 13,
        }}
      >
        <div>
          <strong>Active project</strong>: {projectKey || "—"}
        </div>
        <div style={{ marginTop: "0.35rem", wordBreak: "break-all" }}>
          <strong>Local path</strong>: {projectRoot || "—"}{" "}
          {!projectRoot && projectKey ? (
            <span style={{ color: "#fbbf24" }}>(set in Admin → Projects)</span>
          ) : null}
        </div>
        <div style={{ marginTop: "0.35rem" }}>
          <strong>Local agent</strong>:{" "}
          {localAgentOk ? (
            <span style={{ color: "#22c55e" }}>online</span>
          ) : (
            <span style={{ color: "#f87171" }}>offline</span>
          )}
        </div>
      </div>

      <label style={{ display: "grid", gap: "0.35rem" }}>
        <span>Input image</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          <span>seed</span>
          <input value={seed} onChange={(e) => setSeed(e.target.value)} inputMode="numeric" />
        </label>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          <span>octree_resolution</span>
          <input value={octreeResolution} onChange={(e) => setOctreeResolution(e.target.value)} inputMode="numeric" />
          <span style={{ fontSize: 11, color: "var(--muted, #94a3b8)" }}>Lower (e.g. 64–96) = coarser shape before face cap.</span>
        </label>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          <span>num_inference_steps</span>
          <input value={numInferenceSteps} onChange={(e) => setNumInferenceSteps(e.target.value)} inputMode="numeric" />
        </label>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          <span>guidance_scale</span>
          <input value={guidanceScale} onChange={(e) => setGuidanceScale(e.target.value)} inputMode="decimal" />
        </label>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
        <input type="checkbox" checked={texture} onChange={(e) => setTexture(e.target.checked)} />
        <span>
          texture — requires building Hunyuan&apos;s <code>custom_rasterizer</code> + differentiable_renderer (
          <a href="https://github.com/Tencent-Hunyuan/Hunyuan3D-2#install-requirements">upstream README</a>
          ); leave off for shape-only mesh
        </span>
      </label>

      <label style={{ display: "grid", gap: "0.25rem" }}>
        <span>max_faces (triangle cap)</span>
        <input value={faceCount} onChange={(e) => setFaceCount(e.target.value)} inputMode="numeric" />
        <span style={{ fontSize: 11, color: "var(--muted, #94a3b8)" }}>
          Hunyuan reduces the mesh to at most this many faces (≈ half as many vertices for closed meshes). Try 8k–15k for
          lighter assets; raise if you need more detail.
        </span>
      </label>

      <label style={{ display: "grid", gap: "0.25rem" }}>
        <span>type (export format)</span>
        <select value={exportType} onChange={(e) => setExportType(e.target.value as "glb" | "obj")}>
          <option value="glb">glb</option>
          <option value="obj">obj</option>
        </select>
      </label>

      <button type="button" disabled={isWorking} onClick={() => void handleGenerate()}>
        {isWorking ? "Generating…" : "Generate mesh & save to project"}
      </button>

      {status && (
        <div
          style={{
            fontSize: 14,
            color: lastSavedPath ? "var(--muted, #94a3b8)" : undefined,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {status}
        </div>
      )}
    </div>
  );
}
