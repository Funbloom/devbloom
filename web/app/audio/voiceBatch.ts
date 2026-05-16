import type { InworldVoiceOption } from "./client";

/** One line in narrative batch JSON (Voice Gen → Batch tab). */
export type NarrationBatchClip = {
  id: string;
  character_name: string;
  voice_name: string;
  script_text: string;
  mood: string | null;
};

const DELIVERY_TOKENS = new Set(["STABLE", "BALANCED", "CREATIVE"]);

function parseClipId(record: Record<string, unknown>): string {
  const raw =
    record.id ?? record.clip_id ?? record.clipId ?? record.clipID ?? record.narrative_id ?? record.line_id;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  throw new Error('missing unique "id" (string or number).');
}

function parseCharacterName(record: Record<string, unknown>): string {
  const raw = record.character_name ?? record.characterName ?? record.character;
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) {
    throw new Error('missing "character_name".');
  }
  return name;
}

/**
 * Parses batch JSON shaped as `{ "clips": [...] }` or a bare array.
 * Each item requires unique `id`, `character_name`, `voice_name`, `script_text`, optional `mood`.
 */
export function parseNarrationBatchJson(jsonText: string): NarrationBatchClip[] {
  let root: unknown;
  try {
    root = JSON.parse(jsonText) as unknown;
  } catch {
    throw new Error("That file is not valid JSON.");
  }

  let items: unknown;
  if (Array.isArray(root)) {
    items = root;
  } else if (root !== null && typeof root === "object" && Array.isArray((root as { clips?: unknown }).clips)) {
    items = (root as { clips: unknown[] }).clips;
  } else {
    throw new Error('JSON must be an array of clips or `{ "clips": [ ... ] }`.');
  }

  const clips: NarrationBatchClip[] = [];
  const seenIds = new Set<string>();
  const arr = items as unknown[];
  for (let index = 0; index < arr.length; index++) {
    const entry = arr[index];
    if (entry === null || typeof entry !== "object") {
      throw new Error(`Clip ${index + 1}: expected an object.`);
    }
    const record = entry as Record<string, unknown>;

    let id: string;
    let character_name: string;
    try {
      id = parseClipId(record);
      character_name = parseCharacterName(record);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Clip ${index + 1}: ${msg}`);
    }

    const idNormalized = id.toLowerCase();
    if (seenIds.has(idNormalized)) {
      throw new Error(`Duplicate clip id "${id}" — ids must be unique in the batch.`);
    }
    seenIds.add(idNormalized);

    const voiceRaw = record.voice_name ?? record.voiceName;
    const scriptRaw = record.script_text ?? record.script ?? record.scriptText;
    const moodRaw = record.mood ?? record.delivery ?? null;

    const voice_name = typeof voiceRaw === "string" ? voiceRaw.trim() : "";
    const script_text = typeof scriptRaw === "string" ? scriptRaw.trim() : "";
    if (!voice_name) {
      throw new Error(`Clip "${id}": missing "voice_name".`);
    }
    if (!script_text) {
      throw new Error(`Clip "${id}": missing "script_text".`);
    }
    const mood =
      moodRaw !== null && moodRaw !== undefined && String(moodRaw).trim().length > 0
        ? String(moodRaw).trim()
        : null;

    clips.push({ id, character_name, voice_name, script_text, mood });
  }

  return clips;
}

/** * Matches `voice_name` against Inworld list: exact voiceId first, then display name (case-insensitive).
 */
export function resolveVoiceIdByName(query: string, options: InworldVoiceOption[]): string | null {
  const q = query.trim();
  if (!q) {
    return null;
  }
  const lower = q.toLowerCase();
  for (let i = 0; i < options.length; i++) {
    if (options[i].voiceId === q) {
      return options[i].voiceId;
    }
  }
  for (let j = 0; j < options.length; j++) {
    const opt = options[j];
    if (opt.voiceId.toLowerCase() === lower) {
      return opt.voiceId;
    }
    const parens = /\(([^)]+)\)$/.exec(opt.label);
    const displayPart = parens ? opt.label.slice(0, opt.label.lastIndexOf("(")).trim() : opt.label.trim();
    if (displayPart.toLowerCase() === lower) {
      return opt.voiceId;
    }
  }
  for (let k = 0; k < options.length; k++) {
    const optLabel = options[k].label.trim().toLowerCase();
    if (optLabel.includes(lower)) {
      return options[k].voiceId;
    }
  }
  return null;
}

/**
 * If mood is a delivery token, returns it uppercase; otherwise null (caller may prepend steering brackets for TTS-2).
 */
export function moodAsDeliveryMode(mood: string | null): string | undefined {
  if (!mood) {
    return undefined;
  }
  const upper = mood.trim().toUpperCase();
  if (DELIVERY_TOKENS.has(upper)) {
    return upper;
  }
  return undefined;
}

/** Build synthesis text when mood is descriptive (steering tag for Inworld TTS-2 style). */
export function applyMoodSteering(scriptText: string, mood: string | null, modelId: string): string {
  if (!mood || !mood.trim()) {
    return scriptText;
  }
  const asDelivery = moodAsDeliveryMode(mood);
  if (asDelivery) {
    return scriptText;
  }
  if (modelId === "inworld-tts-2") {
    return `[${mood.trim()}]\n${scriptText}`;
  }
  return scriptText;
}
