import { fetchApi } from "../lib/api";

export type InworldVoiceRow = {
  voiceId?: string;
  displayName?: string;
  langCode?: string;
  lang_code?: string;
  description?: string;
  source?: string;
  name?: string;
  languages?: string[];
  tags?: string[];
  categories?: string[];
  ageGroup?: string;
  age_group?: string;
  gender?: string;
};

export type InworldVoiceOption = {
  voiceId: string;
  label: string;
  displayName: string;
  description: string;
  tags: string[];
  categories: string[];
  ageGroup: string;
  gender: string;
  source: string;
  langCode: string;
};

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item: unknown) => (typeof item === "string" ? item.trim() : ""))
    .filter((item: string) => item.length > 0);
}

function pickAgeGroup(row: InworldVoiceRow): string {
  const camel = row.ageGroup?.trim() ?? "";
  if (camel) {
    return camel;
  }
  const snake = row.age_group?.trim() ?? "";
  return snake;
}

function pickLangCode(row: InworldVoiceRow): string {
  const camel = row.langCode?.trim() ?? "";
  if (camel) {
    return camel;
  }
  const snake = row.lang_code?.trim() ?? "";
  if (snake) {
    return snake;
  }
  if (Array.isArray(row.languages) && row.languages.length > 0) {
    const first = row.languages[0]?.trim() ?? "";
    if (first) {
      return first.replace(/-/g, "_").toUpperCase();
    }
  }
  return "";
}

function pickVoiceId(row: InworldVoiceRow): string {
  const camel = row.voiceId?.trim() ?? "";
  if (camel) {
    return camel;
  }
  const dotted = typeof row.name === "string" ? row.name.trim() : "";
  if (dotted.includes("/")) {
    const last = dotted.split("/").pop();
    return (last ?? "").trim() || dotted;
  }
  return dotted;
}

function formatVoiceLabel(row: InworldVoiceRow, voiceId: string): string {
  const display = row.displayName?.trim() ?? "";
  if (display && display !== voiceId) {
    return `${display} (${voiceId})`;
  }
  return voiceId || "Unknown voice";
}

/**
 * Voices for the authenticated Inworld workspace (system + workspace clones).
 */
export async function fetchInworldVoices(): Promise<InworldVoiceOption[]> {
  const response: Response = await fetchApi("/inworld/voices", { method: "GET" });
  const text = await response.text();
  if (!response.ok) {
    let detail = text || `Voice list failed (${response.status}).`;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed.detail === "string") {
        detail = parsed.detail;
      }
    } catch {
      // keep detail
    }
    throw new Error(detail);
  }
  let data: { voices?: InworldVoiceRow[] };
  try {
    data = JSON.parse(text) as { voices?: InworldVoiceRow[] };
  } catch {
    throw new Error("Invalid voice list response.");
  }
  const voices: InworldVoiceRow[] = Array.isArray(data.voices) ? data.voices : [];
  const options: InworldVoiceOption[] = voices
    .map((row: InworldVoiceRow) => {
      const voiceId = pickVoiceId(row);
      if (!voiceId) {
        return null;
      }
      return {
        voiceId,
        label: formatVoiceLabel(row, voiceId),
        displayName: row.displayName?.trim() || voiceId,
        description: row.description?.trim() ?? "",
        tags: normalizeStringArray(row.tags),
        categories: normalizeStringArray(row.categories),
        ageGroup: pickAgeGroup(row),
        gender: row.gender?.trim() ?? "",
        source: row.source?.trim() ?? "",
        langCode: pickLangCode(row),
      };
    })
    .filter((option: InworldVoiceOption | null): option is InworldVoiceOption => option !== null);
  options.sort((a, b) => a.label.localeCompare(b.label));
  return options;
}

export type SynthesizeSpeechParams = {
  text: string;
  voiceId: string;
  modelId?: string;
  deliveryMode?: string;
  temperature?: number;
};

export type VoicePreviewParams = {
  voiceId: string;
  modelId?: string;
};

export async function fetchInworldVoicePreviewMp3(params: VoicePreviewParams): Promise<Blob> {
  const voiceId = encodeURIComponent(params.voiceId.trim());
  const modelId = encodeURIComponent((params.modelId ?? "inworld-tts-2").trim());
  const response: Response = await fetchApi(
    `/inworld/voices/preview?voice_id=${voiceId}&model_id=${modelId}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const text = await response.text();
    let detail = text || `Voice preview failed (${response.status}).`;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed.detail === "string") {
        detail = parsed.detail;
      }
    } catch {
      // keep
    }
    throw new Error(detail);
  }
  return await response.blob();
}

export async function synthesizeInworldMp3(params: SynthesizeSpeechParams): Promise<Blob> {
  const payload: Record<string, string | number> = {
    text: params.text.trim(),
    voice_id: params.voiceId.trim(),
    model_id: (params.modelId ?? "inworld-tts-2").trim(),
  };
  const mode = params.deliveryMode?.trim();
  if (mode) {
    payload.delivery_mode = mode;
  }
  if (params.temperature !== undefined) {
    payload.temperature = params.temperature;
  }
  const response: Response = await fetchApi("/inworld/tts/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    let detail = text || `TTS failed (${response.status}).`;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed.detail === "string") {
        detail = parsed.detail;
      }
    } catch {
      // keep
    }
    throw new Error(detail);
  }
  return await response.blob();
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

/** Encode MP3 Blob for local_agent.files.binary.write content_base64. */
export async function blobToRawBase64(blob: Blob): Promise<string> {
  const buffer: ArrayBuffer = await blob.arrayBuffer();
  return arrayBufferToBase64(buffer);
}
