import { joinLocalProjectSubpath, localAgent } from "../../../lib/localAgentClient";
import { DEFAULT_MISSIONS_RELATIVE } from "./narrativePaths";

const UNITY_SUBFOLDER = "PocketVoyagerUnity";

export function normalizeProjectRelativePath(input: string): string {
  return input.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

export function relativePathFromProjectRoot(projectRoot: string, absolutePath: string): string | null {
  const rootNorm = projectRoot.replace(/[/\\]+$/, "").replace(/\\/g, "/");
  const pickNorm = absolutePath.replace(/\\/g, "/");
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

export function splitAbsoluteFilePath(filePath: string): { dir: string; name: string } {
  const trimmed = filePath.trim();
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (idx < 0 || idx === trimmed.length - 1) {
    throw new Error("Invalid file path.");
  }
  return { dir: trimmed.slice(0, idx), name: trimmed.slice(idx + 1) };
}

async function missionsFolderExists(projectRoot: string): Promise<boolean> {
  try {
    await localAgent.approveProjectRoot(projectRoot);
    await localAgent.listDir(projectRoot, "Assets/StreamingAssets/Missions");
    return true;
  } catch {
    return false;
  }
}

/**
 * Admin may point at the game repo root; narrative files live under PocketVoyagerUnity/.
 */
export async function resolveNarrativeProjectRoot(projectRoot: string): Promise<string> {
  const trimmed = projectRoot.trim().replace(/[/\\]+$/, "");
  if (!trimmed) {
    throw new Error("Set a local project path in Admin → Projects.");
  }
  if (await missionsFolderExists(trimmed)) {
    return trimmed;
  }
  const nested = joinLocalProjectSubpath(trimmed, UNITY_SUBFOLDER);
  if (nested !== trimmed && (await missionsFolderExists(nested))) {
    return nested;
  }
  throw new Error(
    `Could not find missions under "${trimmed}". ` +
      `Set the project path to your Unity folder (e.g. …\\${UNITY_SUBFOLDER}) ` +
      `or ensure ${DEFAULT_MISSIONS_RELATIVE} exists.`
  );
}

export async function readJsonFromProject(
  projectRoot: string,
  relativePath: string
): Promise<Record<string, unknown>> {
  const root = await resolveNarrativeProjectRoot(projectRoot);
  const rel = normalizeProjectRelativePath(relativePath);
  const payload = await localAgent.readJson(root, rel);
  if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
    throw new Error(`Expected JSON object in ${rel}`);
  }
  return payload.data as Record<string, unknown>;
}

export async function readJsonFromAbsolutePath(absolutePath: string): Promise<Record<string, unknown>> {
  const { dir, name } = splitAbsoluteFilePath(absolutePath);
  await localAgent.approveProjectRoot(dir);
  const payload = await localAgent.readJson(dir, name);
  if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
    throw new Error(`Expected JSON object at ${absolutePath}`);
  }
  return payload.data as Record<string, unknown>;
}

export async function writeJsonToProject(
  projectRoot: string,
  relativePath: string,
  data: Record<string, unknown>
): Promise<void> {
  const root = await resolveNarrativeProjectRoot(projectRoot);
  const rel = normalizeProjectRelativePath(relativePath);
  await localAgent.writeJson(root, rel, data);
}

export async function writeJsonToAbsolutePath(
  absolutePath: string,
  data: Record<string, unknown>
): Promise<void> {
  const { dir, name } = splitAbsoluteFilePath(absolutePath);
  await localAgent.approveProjectRoot(dir);
  await localAgent.writeJson(dir, name, data);
}

export function downloadJson(filename: string, data: Record<string, unknown>): void {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function parseUploadedJsonFile(file: File): Promise<Record<string, unknown>> {
  const text = await file.text();
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${file.name}: expected a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}
