export type ImageModelOption = {
  value: string;
  label: string;
};

export const IMAGE_MODEL_OPTIONS: ImageModelOption[] = [
  { value: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image" },
  { value: "leonardo-gemini-2.5-flash-image", label: "Leonardo (Gemini 2.5 Flash Image)" },
  { value: "gpt-image-1.5", label: "GPT Image 1.5" },
];

/** Default for storyboard tiles and any shared UI that does not override. */
export const DEFAULT_IMAGE_MODEL = "gpt-image-1.5";

/** Default model on the Image Gen page (GPT Image / ChatGPT path). */
export const IMAGEGEN_DEFAULT_IMAGE_MODEL = "gpt-image-1.5";
