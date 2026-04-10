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
  /** Saved from UI Builder Draw tab; Edit reopens the sketch canvas instead of Image Gen. */
  fromSketch?: boolean;
};
