export type ImageTab = "image" | "characters" | "styles";

export type GeneratedImage = {
  id: string;
  url: string;
  prompt: string;
  styleName?: string;
  createdAt: string;
  tab: ImageTab;
};
