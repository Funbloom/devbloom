/** User declined the expensive Gemini image confirmation dialog. */
export const GEMINI_IMAGE_CONFIRM_CANCELLED = "GEMINI_IMAGE_CONFIRM_CANCELLED";

const MESSAGE =
  "You are about to use gemini image model which is expensive, proceed?";

/** Models that call the Gemini image API directly (or via Leonardo wrapping the same model). */
export function isGeminiFamilyImageModel(modelId: string | null | undefined): boolean {
  const m = (modelId || "").trim();
  return m === "gemini-2.5-flash-image" || m === "leonardo-gemini-2.5-flash-image";
}

/**
 * True when the selected image model is Gemini-family (server uses Gemini for that id).
 * Reference images alone do not imply Gemini — GPT Image uses `images.edit` with refs in this app.
 */
export function willServerUseGeminiImage(params: {
  modelId?: string | null;
  referenceImageFilenames?: string[] | null;
}): boolean {
  void params.referenceImageFilenames;
  return isGeminiFamilyImageModel(params.modelId);
}

/**
 * Prompts before any call that will use Gemini image generation. Throws GEMINI_IMAGE_CONFIRM_CANCELLED if the user declines.
 * @param forceGemini — set when the API route always uses Gemini (e.g. strip text / breakdown paths that still require Gemini).
 */
export function confirmGeminiImageIfNeeded(params: {
  modelId?: string | null;
  referenceImageFilenames?: string[] | null;
  forceGemini?: boolean;
}): void {
  const needs =
    params.forceGemini === true ||
    willServerUseGeminiImage({
      modelId: params.modelId,
      referenceImageFilenames: params.referenceImageFilenames,
    });
  if (!needs) {
    return;
  }
  if (typeof window === "undefined") {
    return;
  }
  if (!window.confirm(MESSAGE)) {
    throw new Error(GEMINI_IMAGE_CONFIRM_CANCELLED);
  }
}

export function isGeminiImageConfirmCancelled(err: unknown): boolean {
  return err instanceof Error && err.message === GEMINI_IMAGE_CONFIRM_CANCELLED;
}
