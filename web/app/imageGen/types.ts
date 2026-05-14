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
  /** UI Builder: sketch Images/ filename this polish was generated from (wireframe ref). */
  sourceSketchFilename?: string;
  /** Gen/Images/UI relative path (e.g. subfolder/widget.png) for breakdown exports; not persisted in image JSON. */
  nestedUiRelativePath?: string;
  /**
   * Project-relative path under the resolved local project root (forward slashes), e.g.
   * `Assets/StreamingAssets/Solitaire/Cards/classic_ace_spades.png`. Used by Image Gen edit when `url` is a blob.
   */
  projectRelativeImagePath?: string;
  /** When set, Image Gen edit submit uses these dimensions instead of size/quality presets. */
  editWidth?: number;
  editHeight?: number;
};
