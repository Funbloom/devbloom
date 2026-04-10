"""
UI Builder wireframe → polished UI: prompt text (pen legend + instructions).
Kept in sync with web/app/uiBuilder/penPalette.ts and former uicanvasPrompt.ts intent.
"""

from __future__ import annotations

MAX_UI_STYLE_REFERENCE_IMAGES = 3

# Scroll box stroke color — must match penPalette `scroll` and legend below.
SCROLL_BOX_HEX = "#b07d4a"
# Label box stroke — must match penPalette `label`.
LABEL_BOX_HEX = "#d06767"
# Game-filled label slots — must match penPalette `gameLabel`.
GAME_LABEL_HEX = "#df8bbd"
# Editable inputs — must match penPalette `textbox`.
INPUT_FIELD_HEX = "#c9a0dc"

# (task_id, label, hex, role_line) — mirrors UI_PEN_TASKS + roleForPenTask
_UI_PEN_TASKS: tuple[tuple[str, str, str, str], ...] = (
    ("background", "Background", "#6b8cae", "page or screen background, outer chrome"),
    ("panel", "Panel", "#8faf9e", "cards, panels, grouped sections, sidebars"),
    ("button", "Button", "#2d9cdb", "buttons, clickable controls, primary actions"),
    ("title", "Title", "#e6b84d", "headings, screen titles, section titles, prominent labels"),
    ("textContent", "Text content", "#94b0c4", "body text, paragraphs, descriptions, secondary copy"),
    (
        "textbox",
        "Input field",
        INPUT_FIELD_HEX,
        "editable text inputs, search fields, and form fields — render as input controls (not as large static titles or hero headings)",
    ),
    (
        "gameLabel",
        "Game label",
        GAME_LABEL_HEX,
        "read-only label or value slots that the game fills at runtime (e.g. list rows, stats); not an editable field — use a different treatment than input fields",
    ),
    ("scroll", "Scroll box", "#b07d4a", "scrollable areas, lists, or regions that scroll (scroll box)"),
    (
        "label",
        "Label box",
        LABEL_BOX_HEX,
        "optional: rectangle outline in this color only when you explicitly drew a rectangle — marks annotation areas; do not infer this for every line of text",
    ),
)


def build_layout_fidelity_block(layout_fidelity: int) -> str:
    """
    0 = creative layout; 100 = match wireframe placement closely.
    Style references / style bank still apply to look-and-feel at all levels.
    """
    f = max(0, min(100, layout_fidelity))
    if f >= 85:
        return (
            f"Layout fidelity: {f}/100 (high). Treat the wireframe as a strict layout guide: match element placement, "
            "relative region sizes, grouping, alignment, and reading order as closely as the drawing. "
            "Polish surfaces, typography, and depth for a beautiful result, but do not move major blocks to new areas or reorder sections. "
            "Style bank and style reference images inform visual finish (palette, materials, type) only — not structure."
        )
    if f >= 60:
        return (
            f"Layout fidelity: {f}/100. Stay close to the sketch: same sections, order, and approximate positions; "
            "small spacing and alignment tweaks for balance are fine. Do not invent a different screen structure."
        )
    if f >= 35:
        return (
            f"Layout fidelity: {f}/100 (balanced). Keep the wireframe’s elements and general structure, but spacing and "
            "minor layout adjustments are allowed; light rearrangement within the canvas is OK if clarity improves. "
            "Style reference images are not layout templates — use them only for colors, type, and materials (see reference section below)."
        )
    if f >= 1:
        return (
            f"Layout fidelity: {f}/100 (loose). The sketch defines which controls, labels, and copy belong on this screen; "
            "you may reorganize spacing, grid, and composition for a stronger design while keeping the same elements and semantics. "
            "Do NOT copy panel layout, grid, or composition from any style reference image — those images are paint swatches only, not a substitute wireframe."
        )
    return (
        "Layout fidelity: 0/100 (creative). The wireframe sketch defines WHAT belongs on the screen (which inputs, buttons, rows, text). "
        "You may rearrange layout and composition freely. "
        "Do NOT use style reference images as a layout blueprint: never paste their structure, hierarchy, or panel arrangement. "
        "References supply only visual language (palette, typography, materials, shadows) — like a theme, not a second mockup to follow. "
        "Keep all wireframe elements and literal sketch text; prioritize a cohesive polished UI."
    )


def build_ui_canvas_polish_prompt(sketch_title: str) -> str:
    legend = "\n".join(
        f"- Hex {color} — {label}: {role}." for _, label, color, role in _UI_PEN_TASKS
    )
    title = sketch_title.strip()
    title_line = f'Sketch title: "{title}".' if title else ""
    parts = [
        "You are given a reference wireframe image drawn on a dark canvas (#0f1115).",
        "The colored strokes encode what each region *is* (semantic tags), not how it should look in the final art.",
        "Use this legend only to identify element types and layout — not as a color palette for the polished UI:",
        legend,
        "",
        "Wireframe colors are for identification only: do not paint inputs, labels, panels, or buttons using the same lilac, rose, blue, gold, or other sketch hues as their fill, border, or text color. "
        "Render each control type with believable, production-ready styling — neutral fields, readable body text, sensible contrast — and reserve accent color for real emphasis (e.g. primary buttons) as fits the style reference or a clean default.",
        "",
        title_line,
        "",
        "Task: Transform this wireframe into one polished, production-quality UI mockup.",
        f"Hard rule — scrolling: Do not render any scrollbars, scroll tracks, or scroll thumbs unless the wireframe clearly contains the Scroll box stroke color ({SCROLL_BOX_HEX}) outlining that region. Default to non-scroll, static layouts.",
        "Use clear typography hierarchy, sensible spacing, modern controls, and subtle depth (shadows/borders) where appropriate.",
        "The final image should look like a single cohesive app or screen — not a collage.",
        "Do not add unrelated characters or marketing photos unless implied by the sketch.",
        "",
        "Sketch text: Any legible light-colored text drawn on the canvas is literal UI copy — the polished mockup must display that wording (you may refine spelling or casing for a production look) in the same approximate placement and hierarchy.",
        "",
        f"Input vs game labels (semantics, not colors): Where the sketch uses {INPUT_FIELD_HEX}, treat the region as an editable input — render a normal-looking field or search box (neutral fill, subtle border), not lilac/pink chrome. "
        f"Where it uses {GAME_LABEL_HEX}, treat the region as read-only game-filled label/value text — plain typography, not rose-tinted boxes.",
        "",
        f"Label box rectangles ({LABEL_BOX_HEX}): Only when the sketch actually shows a stroked rectangle in that color should you treat it as an explicit annotation frame. "
        "Do not add thin rectangular outlines, borders, tags, or orange/coral/red boxes around every row label, list value, or line of text.",
        "",
        "No spurious chrome: Do not reinterpret wireframe pinks, lilacs, or rose strokes as decorative bordered rectangles around each label. Flat typography and normal spacing are preferred.",
        "",
        f"Scrolling (strict): The wireframe must visibly include the Scroll box color ({SCROLL_BOX_HEX}) in a region for that region to be scrollable in the output. "
        "If you do not see that exact brown-orange stroke marking a scrollable area, you must not draw scrollbars, scrollbar tracks, thumbs, fade masks that imply overflow, or nested panes that look scrollable. "
        "Treat lists, feeds, tables, and text blocks as static, clipped, or paginated — never add vertical or horizontal scroll UI “by habit.” "
        "Do not add scroll affordances just because the layout is dense.",
        "",
        "Style references (if any): Even when reference images show scrollable UIs, do not copy scrollbars or scroll behavior into this mockup unless the wireframe itself uses the Scroll box color there.",
        "",
        "Background (strict): The entire canvas outside the UI panel must be fully transparent. "
        "No environmental scenes, no blurred photos, no cockpit/room/landscape backdrops, no full-screen gradients, and no vignette behind the mockup — only the UI chrome and content pixels are opaque. "
        "Alpha everywhere else so the image composites on any scene.",
    ]
    return "\n".join(p for p in parts if p)


def build_style_reference_prompt_append(num_style_refs: int, layout_fidelity: int = 75) -> str:
    if num_style_refs <= 0:
        return ""
    f = max(0, min(100, layout_fidelity))
    word = "image" if num_style_refs == 1 else "images"
    lines = [
        "Reference image order:",
        "• The first reference image is the UI wireframe sketch — the only source of truth for which UI elements, rows, fields, buttons, and on-screen text belong in the output.",
    ]
    if f >= 70:
        lines.append(
            "• For layout, follow this sketch according to the Layout fidelity setting at the top of the prompt."
        )
    elif f >= 35:
        lines.append(
            "• Layout may breathe per Layout fidelity; style images below must still not replace which elements exist — only how they look."
        )
    else:
        lines.append(
            "• Layout fidelity is low: you may reorganize composition, but you must still implement the same elements and copy from this sketch — not a screen copied from the style references."
        )
    lines.extend(
        [
            f"• The next {num_style_refs} reference {word} are style swatches only — use them for visual language: color palette, typography weight and pairing, corner radii, shadows, borders, gloss, and material/surface treatment.",
            "They are NOT a second UI to imitate: do not copy their layout, panel positions, grid, widget arrangement, hierarchy, or composition. "
            "Do not let those images dictate where headers, lists, or buttons sit — that comes from the wireframe sketch.",
            "Do not copy subject matter, icons, logos, photos, or environmental backgrounds from the style images. Never paste a scene behind the UI.",
            "Produce one polished UI that implements the wireframe’s elements with the stylistic feel of the references — not the references’ structure.",
        ]
    )
    return "\n".join(lines)


def build_ui_canvas_full_prompt(
    sketch_title: str,
    *,
    style_bank_prompt: str | None = None,
    extra_user_prompt: str | None = None,
    style_reference_filenames: list[str] | None = None,
    layout_fidelity: int = 75,
) -> str:
    fid = max(0, min(100, layout_fidelity))
    body = f"{build_layout_fidelity_block(fid)}\n\n{build_ui_canvas_polish_prompt(sketch_title)}"
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
        body = f"{body}\n\n{build_style_reference_prompt_append(len(refs), layout_fidelity=fid)}"
    return body
