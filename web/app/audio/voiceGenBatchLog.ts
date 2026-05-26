import type { NarrationBatchClip } from "./voiceBatch";
import { localAgent } from "../lib/localAgentClient";

/** Written next to batch MP3s in the chosen output folder. */
export const VOICE_GEN_BATCH_LOG_FILE = "voice_gen_batch_log.json";

export type VoiceGenBatchLogEntry = {
  id: string;
  mp3_file_name: string;
  character_name: string;
  voice_name: string;
  voice_id: string;
  script_text: string;
  mood: string | null;
  /** Text actually sent to TTS (after mood steering). */
  synth_text: string;
  model_id: string;
  delivery_mode: string | null;
  content_signature: string;
  generated_at: string;
};

export type VoiceGenBatchLog = {
  version: 1;
  updated_at: string;
  entries: Record<string, VoiceGenBatchLogEntry>;
};

export function emptyVoiceGenBatchLog(): VoiceGenBatchLog {
  return { version: 1, updated_at: new Date(0).toISOString(), entries: {} };
}

export function buildBatchClipContentSignature(
  clip: NarrationBatchClip,
  voiceId: string,
  modelId: string,
  synthText: string,
  deliveryMode: string | undefined
): string {
  return [
    clip.script_text,
    clip.mood ?? "",
    clip.voice_name,
    voiceId,
    modelId,
    deliveryMode ?? "",
    synthText,
  ].join("\u001f");
}

export function batchClipNeedsGeneration(
  logEntry: VoiceGenBatchLogEntry | undefined,
  signature: string
): boolean {
  if (!logEntry) {
    return true;
  }
  return logEntry.content_signature !== signature;
}

function normalizeLogEntry(raw: unknown): VoiceGenBatchLogEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (!id) {
    return null;
  }
  return {
    id,
    mp3_file_name: typeof row.mp3_file_name === "string" ? row.mp3_file_name : "",
    character_name: typeof row.character_name === "string" ? row.character_name : "",
    voice_name: typeof row.voice_name === "string" ? row.voice_name : "",
    voice_id: typeof row.voice_id === "string" ? row.voice_id : "",
    script_text: typeof row.script_text === "string" ? row.script_text : "",
    mood: row.mood === null || row.mood === undefined ? null : String(row.mood),
    synth_text: typeof row.synth_text === "string" ? row.synth_text : "",
    model_id: typeof row.model_id === "string" ? row.model_id : "",
    delivery_mode:
      row.delivery_mode === null || row.delivery_mode === undefined
        ? null
        : String(row.delivery_mode),
    content_signature: typeof row.content_signature === "string" ? row.content_signature : "",
    generated_at: typeof row.generated_at === "string" ? row.generated_at : "",
  };
}

export function normalizeVoiceGenBatchLog(raw: unknown): VoiceGenBatchLog {
  if (!raw || typeof raw !== "object") {
    return emptyVoiceGenBatchLog();
  }
  const row = raw as Record<string, unknown>;
  const entriesRaw = row.entries;
  const entries: Record<string, VoiceGenBatchLogEntry> = {};
  if (entriesRaw && typeof entriesRaw === "object" && !Array.isArray(entriesRaw)) {
    for (const [key, value] of Object.entries(entriesRaw)) {
      const entry = normalizeLogEntry(value);
      if (entry) {
        entries[key] = entry;
      }
    }
  }
  return {
    version: 1,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
    entries,
  };
}

export async function readVoiceGenBatchLog(projectRoot: string): Promise<VoiceGenBatchLog> {
  try {
    const response = await localAgent.readJson(projectRoot, VOICE_GEN_BATCH_LOG_FILE);
    return normalizeVoiceGenBatchLog(response.data);
  } catch {
    return emptyVoiceGenBatchLog();
  }
}

export async function writeVoiceGenBatchLog(projectRoot: string, log: VoiceGenBatchLog): Promise<void> {
  const payload: VoiceGenBatchLog = {
    ...log,
    version: 1,
    updated_at: new Date().toISOString(),
  };
  await localAgent.writeJson(projectRoot, VOICE_GEN_BATCH_LOG_FILE, payload);
}

export function upsertVoiceGenBatchLogEntry(
  log: VoiceGenBatchLog,
  entry: VoiceGenBatchLogEntry
): VoiceGenBatchLog {
  return {
    ...log,
    entries: {
      ...log.entries,
      [entry.id]: entry,
    },
  };
}
