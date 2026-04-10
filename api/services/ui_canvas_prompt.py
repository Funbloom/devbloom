"""
UI Builder wireframe → polished UI: prompt text (pen legend + instructions).
Kept in sync with web/app/uiBuilder/penPalette.ts and former uicanvasPrompt.ts intent.
"""

from __future__ import annotations

MAX_UI_STYLE_REFERENCE_IMAGES = 3

# Scroll box stroke color — must match penPalette `scroll` and legend below.
SCROLL_BOX_HEX = "#b07d4a"

# (task_id, label, hex, role_line) — mirrors UI_PEN_TASKS + roleForPenTask
_UI_PEN_TASKS: tuple[tuple[str, str, str, str], ...] = (
    ("background", "Background", "#6b8cae", "page or screen background, outer chrome"),
    ("panel", "Panel", "#8faf9e", "cards, panels, grouped sections, sidebars"),
    ("button", "Button", "#2d9cdb", "buttons, clickable controls, primary actions"),
    ("title", "Title", "#e6b84d", "headings, screen titles, section titles, prominent labels"),
    ("textContent", "Text content", "#94b0c4", "body text, paragraphs, descriptions, secondary copy"),
    ("textbox", "Text box", "#c9a0dc", "text inputs, search fields"),
    ("scroll", "Scroll box", "#b07d4a", "scrollable areas, lists, or regions that scroll (scroll box)"),
)


def build_ui_canvas_polish_prompt(sketch_title: str) -> str:
    legend = "\n".join(
        f"- Hex {color} — {label}: {role}." for _, label, color, role in _UI_PEN_TASKS
    )
    title = sketch_title.strip()
    title_line = f'Sketch title: "{title}".' if title else ""
    parts = [
        "You are given a reference wireframe image drawn on a dark canvas (#0f1115).",
        "The colored strokes are not decorative — they encode UI intent using this legend:",
        legend,
        "",
        title_line,
        "",
        "Task: Transform this wireframe into one polished, production-quality UI mockup.",
        "Respect the layout, proportions, and regions suggested by the sketch.",
        "Use clear typography hierarchy, sensible spacing, modern controls, and subtle depth (shadows/borders) where appropriate.",
        "The final image should look like a single cohesive app or screen — not a collage.",
        "Do not add unrelated characters or marketing photos unless implied by the sketch.",
        "",
        f"Scrolling: Do not add scrollable regions, scrollbars, or “infinite list” / overflow scrolling unless the wireframe visibly uses the Scroll box stroke color ({SCROLL_BOX_HEX}). "
        "If that color does not appear where you would put a scrolling area, do not imply scrolling — use fixed, non-scroll layouts instead.",
        "",
        "Background: The output must have a fully transparent background outside the UI (no solid backdrop, gradient fill, or faux “device frame” canvas behind the mockup). "
        "Preserve alpha at the edges so the image can be placed on any background.",
    ]
    return "\n".join(p for p in parts if p)


def build_style_reference_prompt_append(num_style_refs: int) -> str:
    if num_style_refs <= 0:
        return ""
    word = "image" if num_style_refs == 1 else "images"
    return "\n".join(
        [
            "Reference image order:",
            "• The first reference image is the UI wireframe sketch — follow its layout, regions, proportions, and structure.",
            f"• The next {num_style_refs} reference {word} are style references only: take inspiration from their visual language (color palette, typography weight and pairing, spacing rhythm, corner radii, shadows, borders, and material/surface treatment).",
            "Do not copy subject matter, text, icons, logos, photos, or layout from those style images — only the stylistic feel.",
            "Produce a single polished UI that matches the wireframe while feeling visually consistent with those style examples.",
        ]
    )


def build_ui_canvas_full_prompt(
    sketch_title: str,
    *,
    style_bank_prompt: str | None = None,
    extra_user_prompt: str | None = None,
    style_reference_filenames: list[str] | None = None,
) -> str:
    body = build_ui_canvas_polish_prompt(sketch_title)
    sb = (style_bank_prompt or "").strip()
    if sb:
        body = f"{sb}\n\n{body}"
    extra = (extra_user_prompt or "").strip()
    if extra:
        body = f"{body}\n\nAdditional instructions from the user:\n{extra}"
    refs = [str(x).strip() for x in (style_reference_filenames or []) if str(x).strip()][
        :MAX_UI_STYLE_REFERENCE_IMAGES
    ]
    if refs:
        body = f"{body}\n\n{build_style_reference_prompt_append(len(refs))}"
    return body
