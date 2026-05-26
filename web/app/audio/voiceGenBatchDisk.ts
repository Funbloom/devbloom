import { localAgent } from "../lib/localAgentClient";
import { parseNarrationBatchJson, type NarrationBatchClip } from "./voiceBatch";
import { writeVoiceGenBatch } from "./voiceGenBatchStorage";

export function splitAbsoluteFilePath(filePath: string): { dir: string; name: string } {
  const trimmed = filePath.trim();
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (idx < 0 || idx === trimmed.length - 1) {
    throw new Error("Invalid batch JSON path.");
  }
  return { dir: trimmed.slice(0, idx), name: trimmed.slice(idx + 1) };
}

export async function readBatchJsonFromDisk(filePath: string): Promise<{ text: string; fileName: string }> {
  const { dir, name } = splitAbsoluteFilePath(filePath);
  await localAgent.approveProjectRoot(dir);
  const blob: Blob = await localAgent.readBinary(dir, name);
  const text: string = await blob.text();
  if (!text.trim()) {
    throw new Error("Batch JSON file is empty.");
  }
  return { text, fileName: name };
}

/** Re-read batch JSON from disk, parse clips, and persist to localStorage. */
export async function reloadVoiceGenBatchFromDisk(filePath: string): Promise<NarrationBatchClip[]> {
  const { text, fileName } = await readBatchJsonFromDisk(filePath);
  const clips: NarrationBatchClip[] = parseNarrationBatchJson(text);
  writeVoiceGenBatch({
    fileName,
    jsonText: text,
    clips,
    filePath,
  });
  return clips;
}
