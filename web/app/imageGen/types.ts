export type ImageTab = "image" | "characters" | "styles" | "ui_canvas";

export type ImageLocation = "local" | "cloud";

export type GeneratedImage = {
  id: string;
  url: string;
  filename?: string;
  prompt: string;
  styleName?: string;
  createdAt: string;
  tab: ImageTab;
  location?: ImageLocation;
};
