/**
 * Wireframe / UI sketch pens — distinct hues on dark canvas (#0f1115), labeled by role.
 * Colors chosen for separation and readability (muted professional palette).
 */
export type UiPenTaskId =
  | "background"
  | "panel"
  | "button"
  | "title"
  | "textContent"
  | "textbox"
  | "gameLabel"
  | "scroll"
  | "label";

export const UI_PEN_TASKS: ReadonlyArray<{
  id: UiPenTaskId;
  label: string;
  /** Short label for tight UI */
  shortLabel: string;
  color: string;
}> = [
  {
    id: "background",
    label: "Background",
    shortLabel: "Bg",
    // Steel blue — page / screen background
    color: "#6b8cae",
  },
  {
    id: "panel",
    label: "Panel",
    shortLabel: "Panel",
    // Sage gray-green — cards / sections
    color: "#8faf9e",
  },
  {
    id: "button",
    label: "Button",
    shortLabel: "Btn",
    // Clear sky blue — primary actions
    color: "#2d9cdb",
  },
  {
    id: "title",
    label: "Title",
    shortLabel: "Title",
    // Warm gold — headings, screen titles, section headers
    color: "#e6b84d",
  },
  {
    id: "textContent",
    label: "Text content",
    shortLabel: "Text",
    // Cool slate — body copy, paragraphs, descriptions
    color: "#94b0c4",
  },
  {
    id: "textbox",
    label: "Input field",
    shortLabel: "Input",
    // Lilac — editable text inputs, search fields, form fields (not page titles)
    color: "#c9a0dc",
  },
  {
    id: "gameLabel",
    label: "Game label",
    shortLabel: "Game",
    // Rose pink — read-only labels/values the game fills in (list rows, stats; not an input)
    color: "#df8bbd",
  },
  {
    id: "scroll",
    label: "Scroll box",
    shortLabel: "Scroll",
    // Warm brown — scrollable regions
    color: "#b07d4a",
  },
  {
    id: "label",
    label: "Label box",
    shortLabel: "Label",
    // Coral — drag a rectangle marking where specific copy or micro-labels belong
    color: "#d06767",
  },
];

/** Eraser, UI pens, or place literal on-canvas text (not a colored stroke). */
export type DrawTool = "eraser" | UiPenTaskId | "text";

export function penColorForTool(tool: DrawTool): string | null {
  if (tool === "eraser") return null;
  if (tool === "text") return "#f1f5f9";
  return UI_PEN_TASKS.find((t) => t.id === tool)?.color ?? "#cbd5e1";
}
