import { API_BASE } from "./config";
import { normalizeImageUrl, parseNestedUiRelFromUrl } from "./client";
import type { GeneratedImage, ImageLocation, ImageTab } from "./types";

function parseTab(o: Record<string, unknown>): ImageTab {
  const t = o.tab;
  if (t === "characters") return "characters";
  if (t === "ui_canvas") return "ui_canvas";
  if (t === "styles") return "styles";
  return "image";
}

export function parseStoredImages(raw: unknown[]): GeneratedImage[] {
  return raw
    .filter(
      (img) =>
        img &&
        typeof (img as Record<string, unknown>).id === "string" &&
        typeof (img as Record<string, unknown>).url === "string",
    )
    .map((img) => {
      const o = img as Record<string, unknown>;
      const rawUrl = typeof o.url === "string" ? o.url : "";
      const url = normalizeImageUrl(rawUrl);
      const tab = parseTab(o);

      let location: ImageLocation = "local";
      if (typeof o.location === "string" && (o.location === "local" || o.location === "cloud")) {
        location = o.location;
      } else if (url.includes("/images/")) {
        location = "local";
      } else {
        location = "cloud";
      }

      const filename =
        typeof o.filename === "string" && o.filename
          ? o.filename
          : (() => {
              try {
                const u = new URL(url, API_BASE);
                const pathname = u.pathname || "";
                const idx = pathname.lastIndexOf("/");
                return idx >= 0 ? pathname.slice(idx + 1) : "";
              } catch {
                return "";
              }
            })();

      let nestedUiRelativePath: string | undefined;
      if (typeof o.nestedUiRelativePath === "string" && o.nestedUiRelativePath.trim()) {
        nestedUiRelativePath = o.nestedUiRelativePath.trim();
      } else if (tab === "ui_canvas") {
        const fromUrl = parseNestedUiRelFromUrl(url);
        if (fromUrl) nestedUiRelativePath = fromUrl;
      }

      return {
        id: String(o.id),
        url,
        filename: filename || undefined,
        prompt: typeof o.prompt === "string" ? o.prompt : "",
        styleName: typeof o.styleName === "string" ? o.styleName : undefined,
        createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date(0).toISOString(),
        tab,
        location,
        fromSketch: o.fromSketch === true,
        sourceSketchFilename:
          typeof o.sourceSketchFilename === "string" && o.sourceSketchFilename.trim()
            ? o.sourceSketchFilename.trim()
            : undefined,
        ...(nestedUiRelativePath ? { nestedUiRelativePath } : {}),
      };
    });
}

export function toPayload(img: GeneratedImage): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: img.id,
    url: img.url,
    filename: img.filename,
    prompt: img.prompt,
    styleName: img.styleName,
    createdAt: img.createdAt,
    tab: img.tab,
    location: img.location,
  };
  if (img.fromSketch === true) payload.fromSketch = true;
  if (img.sourceSketchFilename?.trim()) payload.sourceSketchFilename = img.sourceSketchFilename.trim();
  if (img.nestedUiRelativePath?.trim()) payload.nestedUiRelativePath = img.nestedUiRelativePath.trim();
  return payload;
}
