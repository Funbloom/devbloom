export type ImageModelOption = {
  value: string;
  label: string;
};

export const IMAGE_MODEL_OPTIONS: ImageModelOption[] = [
  { value: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image" },
  { value: "leonardo-gemini-2.5-flash-image", label: "Leonardo (Gemini 2.5 Flash Image)" },
  { value: "gpt-image-1.5", label: "GPT Image 1.5" },
];

export const DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image";
