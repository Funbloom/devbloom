import { fetchApi } from "../lib/api";

export type InworldVoiceRow = {
  voiceId?: string;
  displayName?: string;
  langCode?: string;
  description?: string;
  source?: string;
  name?: string;
};

export type InworldVoiceOption = {
  voiceId: string;
  label: string;
};

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
      return { voiceId, label: formatVoiceLabel(row, voiceId) };
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
};

export async function synthesizeInworldMp3(params: SynthesizeSpeechParams): Promise<Blob> {
  const payload: Record<string, string> = {
    text: params.text.trim(),
    voice_id: params.voiceId.trim(),
    model_id: (params.modelId ?? "inworld-tts-2").trim(),
  };
  const mode = params.deliveryMode?.trim();
  if (mode) {
    payload.delivery_mode = mode;
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
