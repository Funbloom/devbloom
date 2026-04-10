import type { UiPenTaskId } from "./penPalette";
import { UI_PEN_TASKS } from "./penPalette";

function roleForPenTask(id: UiPenTaskId): string {
  switch (id) {
    case "background":
      return "page or screen background, outer chrome";
    case "panel":
      return "cards, panels, grouped sections, sidebars";
    case "button":
      return "buttons, clickable controls, primary actions";
    case "title":
      return "headings, screen titles, section titles, prominent labels";
    case "textContent":
      return "body text, paragraphs, descriptions, secondary copy";
    case "textbox":
      return "text inputs, search fields, labels for fields";
    case "scroll":
      return "scrollable areas, lists, or regions that scroll (scroll box)";
  }
}

/**
 * Prompt for turning a UI Builder wireframe sketch into a polished UI mockup.
 * Includes the wireframe color legend so the model maps strokes to UI semantics.
 */
export function buildUiCanvasPolishPrompt(sketchTitle: string): string {
  const legend = UI_PEN_TASKS.map((t) => {
    return `- Hex ${t.color} — ${t.label}: ${roleForPenTask(t.id)}.`;
  }).join("\n");

  const titleLine = sketchTitle.trim()
    ? `Sketch title: "${sketchTitle.trim()}".`
    : "";

  return [
    "You are given a reference wireframe image drawn on a dark canvas (#0f1115).",
    "The colored strokes are not decorative — they encode UI intent using this legend:",
    legend,
    "",
    titleLine,
    "",
    "Task: Transform this wireframe into one polished, production-quality UI mockup.",
    "Respect the layout, proportions, and regions suggested by the sketch.",
    "Use clear typography hierarchy, sensible spacing, modern controls, and subtle depth (shadows/borders) where appropriate.",
    "The final image should look like a single cohesive app or screen — not a collage.",
    "Do not add unrelated characters or marketing photos unless implied by the sketch.",
  ]
    .filter(Boolean)
    .join("\n");
}

const MAX_UI_STYLE_REFERENCE_IMAGES = 3;

/** How many style-only reference slots the UI Builder allows (upload / gallery). */
export function maxUiStyleReferenceImages(): number {
  return MAX_UI_STYLE_REFERENCE_IMAGES;
}

/**
 * Appended when style reference images are passed after the wireframe in the API payload.
 * Tells the model to use look-and-feel only, not content or layout from those images.
 */
export function buildStyleReferencePromptAppend(numStyleRefs: number): string {
  if (numStyleRefs <= 0) return "";
  const n = numStyleRefs === 1 ? "image" : "images";
  return [
    "Reference image order:",
    "• The first reference image is the UI wireframe sketch — follow its layout, regions, proportions, and structure.",
    `• The next ${numStyleRefs} reference ${n} are style references only: take inspiration from their visual language (color palette, typography weight and pairing, spacing rhythm, corner radii, shadows, borders, and material/surface treatment).`,
    "Do not copy subject matter, text, icons, logos, photos, or layout from those style images — only the stylistic feel.",
    "Produce a single polished UI that matches the wireframe while feeling visually consistent with those style examples.",
  ].join("\n");
}
