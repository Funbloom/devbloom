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
  | "scroll";

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
    label: "Text box",
    shortLabel: "Field",
    // Soft lilac — inputs / labels
    color: "#c9a0dc",
  },
  {
    id: "scroll",
    label: "Scroll box",
    shortLabel: "Scroll",
    // Warm brown — scrollable regions
    color: "#b07d4a",
  },
];

export type DrawTool = "eraser" | UiPenTaskId;

export function penColorForTool(tool: DrawTool): string | null {
  if (tool === "eraser") return null;
  return UI_PEN_TASKS.find((t) => t.id === tool)?.color ?? "#cbd5e1";
}
