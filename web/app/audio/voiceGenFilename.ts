const DEFAULT_FALLBACK_SLUG = "clip";
const DEFAULT_VOICE_FALLBACK = "voice";
const VOICE_SLUG_MAX_LEN = 20;
const TEXT_SLUG_MAX_LEN = 32;
const DISAMBIGUATOR_SLUG_MAX_LEN = 16;
const FILE_BASE_MAX_LEN = 56;

export function slugForFilename(text: string, maxLen: number): string {
  const cleaned: string = text
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLen);
  return cleaned.length > 0 ? cleaned : DEFAULT_FALLBACK_SLUG;
}

export type BuildVoiceGenMp3FileNameOptions = {
  maxBaseLen?: number;
  disambiguator?: string;
};

export function buildVoiceGenMp3FileName(
  voiceName: string,
  text: string,
  options?: BuildVoiceGenMp3FileNameOptions,
): string {
  const voiceSlug = slugForFilename(voiceName.trim() || DEFAULT_VOICE_FALLBACK, VOICE_SLUG_MAX_LEN);
  const textSlug = slugForFilename(text.trim(), TEXT_SLUG_MAX_LEN);

  let base = voiceSlug;
  if (textSlug !== DEFAULT_FALLBACK_SLUG) {
    base = `${voiceSlug}_${textSlug}`;
  }

  const disambiguator = options?.disambiguator?.trim() ?? "";
  if (disambiguator) {
    const disambiguatorSlug = slugForFilename(disambiguator, DISAMBIGUATOR_SLUG_MAX_LEN);
    if (disambiguatorSlug !== DEFAULT_FALLBACK_SLUG) {
      base = `${base}_${disambiguatorSlug}`;
    }
  }

  const maxBaseLen = options?.maxBaseLen ?? FILE_BASE_MAX_LEN;
  const trimmed = base.slice(0, maxBaseLen).replace(/_+$/g, "");
  return `${trimmed || DEFAULT_VOICE_FALLBACK}.mp3`;
}

const BATCH_CLIP_ID_SLUG_MAX_LEN = 120;

/** Batch mode: filename derived from JSON clip id (legacy behavior). */
export function buildBatchClipMp3FileName(clipId: string): string {
  return `${slugForFilename(clipId, BATCH_CLIP_ID_SLUG_MAX_LEN)}.mp3`;
}

export function batchClipMatchesMp3FileName(clipId: string, mp3FileName: string): boolean {
  return buildBatchClipMp3FileName(clipId).toLowerCase() === mp3FileName.trim().toLowerCase();
}
