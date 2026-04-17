"""
UI Builder Breakdown: vision JSON for UI element boxes, strip-text via image gen, export crops + background plate.
"""

from __future__ import annotations

import base64
import io
import json
import os
import re
from pathlib import Path
from typing import Any

import requests
from PIL import Image, ImageChops, ImageOps

from core.code_settings import IMAGE_MODEL_REGISTRY, resolve_image_model
from services.image_tool import (
    ALLOWED_FILENAME_RE,
    build_image_filename,
    build_ui_canvas_nested_url,
    find_image_path,
    generate_image,
    get_ui_canvas_images_dir,
    validate_image_filename,
)

# Gemini model for labeling SAM regions (not for drawing boxes).
GEMINI_LABEL_MODEL = os.getenv("UI_BREAKDOWN_LABEL_MODEL", "gemini-2.5-flash")

_LABEL_REGIONS_JSON_SCHEMA = """Return a JSON object with this exact shape (no markdown, no code fences):
{"labels":[{"id":"string","label":"string","role":"string"}]}
For each region id listed in the user message, provide a short English label (2–6 words) and a short snake_case role (e.g. primary_button, header_bar, icon, panel). Use the ids exactly as given."""


def _pil_canonical_rgba(path: Path) -> Image.Image:
    """Apply EXIF orientation so pixel coordinates match browser display and vision output."""
    return ImageOps.exif_transpose(Image.open(path)).convert("RGBA")


def _decode_full_image_mask_l(el: dict[str, Any]) -> Image.Image | None:
    """SAM mask PNG from local agent: full-image grayscale, white = inside segment."""
    raw_b64 = el.get("mask_png_base64") or el.get("maskPngBase64")
    if not raw_b64:
        return None
    s = str(raw_b64).strip()
    if not s:
        return None
    try:
        data = base64.standard_b64decode(s)
        return Image.open(io.BytesIO(data)).convert("L")
    except Exception:
        return None


def _apply_mask_alpha_to_crop(
    crop_rgba: Image.Image,
    mask_full_l: Image.Image,
    *,
    iw: int,
    ih: int,
    crop_box: tuple[int, int, int, int],
) -> Image.Image:
    """Multiply SAM mask into the crop alpha so non-rectangular shapes export with transparency."""
    x0, y0, x1, y1 = crop_box
    if mask_full_l.size != (iw, ih):
        mask_full_l = mask_full_l.resize((iw, ih), Image.Resampling.NEAREST)
    m = mask_full_l.crop((x0, y0, x1, y1))
    if m.size != crop_rgba.size:
        m = m.resize(crop_rgba.size, Image.Resampling.NEAREST)
    r, g, b, a = crop_rgba.split()
    new_a = ImageChops.multiply(m, a)
    return Image.merge("RGBA", (r, g, b, new_a))


def _encode_png_for_vision(img: Image.Image) -> tuple[bytes, str]:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue(), "image/png"


def _extract_json_object(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return json.loads(text)


def _gemini_vision_raw(
    prompt: str,
    image_bytes: bytes,
    mime_type: str,
    *,
    temperature: float = 0.2,
    use_json_mime: bool = True,
    model_name: str | None = None,
) -> str:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("Gemini API key is missing. Set GEMINI_API_KEY.")

    resolved_model = (model_name or "").strip() or GEMINI_LABEL_MODEL
    b64 = base64.b64encode(image_bytes).decode("ascii")
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{resolved_model}:generateContent"
    )
    parts = [
        {"text": prompt},
        {"inline_data": {"mime_type": mime_type, "data": b64}},
    ]
    generation_config: dict[str, Any] = {
        "temperature": temperature,
        "maxOutputTokens": 8192,
    }
    if use_json_mime:
        generation_config["responseMimeType"] = "application/json"

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": generation_config,
    }

    response = requests.post(
        url,
        params={"key": api_key},
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=120,
    )
    if not response.ok:
        if use_json_mime:
            return _gemini_vision_raw(
                prompt,
                image_bytes,
                mime_type,
                temperature=temperature,
                use_json_mime=False,
                model_name=model_name,
            )
        raise ValueError(f"Gemini vision request failed: {response.status_code} {response.text[:500]}")

    data = response.json()
    parts_out = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    out: list[str] = []
    for p in parts_out:
        if isinstance(p, dict) and isinstance(p.get("text"), str):
            out.append(p["text"])
    if not out:
        raise ValueError("Gemini returned no text.")
    return "\n".join(out)


def sanitize_export_folder(name: str) -> str:
    cleaned = (name or "").strip().replace("..", "_")
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "_", cleaned).strip("._-")
    if not cleaned:
        cleaned = "export"
    return cleaned[:80]


def sanitize_widget_filename(name: str) -> str:
    base = ALLOWED_FILENAME_RE.sub("_", name.strip())[:100]
    if not base.lower().endswith(".png"):
        base = f"{base}.png"
    return base


def _safe_label_fragment(label: str) -> str:
    s = ALLOWED_FILENAME_RE.sub("_", (label or "").strip().lower())[:40]
    return s or "item"


def _label_regions_with_gemini(
    elements: list[dict[str, Any]],
    image_bytes: bytes,
    mime_type: str,
    iw: int,
    ih: int,
    *,
    temperature: float = 0.2,
    model_name: str | None = None,
) -> list[dict[str, Any]]:
    """Assign human-readable labels to pre-segmented regions (SAM geometry unchanged)."""
    if not elements:
        return elements

    regions_desc = []
    for el in elements:
        regions_desc.append(
            {
                "id": el["id"],
                "x_min": round(float(el["x_min"]), 6),
                "y_min": round(float(el["y_min"]), 6),
                "x_max": round(float(el["x_max"]), 6),
                "y_max": round(float(el["y_max"]), 6),
            }
        )
    regions_json = json.dumps(regions_desc, indent=2)
    prompt = (
        "You analyze a UI screenshot. Regions below were found by a segmentation model (SAM). "
        f"The image is {iw}×{ih} pixels. Coordinates are normalized 0–1 (fraction of width/height).\n\n"
        f"Regions:\n{regions_json}\n\n"
        f"{_LABEL_REGIONS_JSON_SCHEMA}\n"
        "Respond with JSON only."
    )

    raw = _gemini_vision_raw(
        prompt,
        image_bytes,
        mime_type,
        temperature=temperature,
        use_json_mime=True,
        model_name=model_name,
    )
    try:
        parsed = _extract_json_object(raw)
    except json.JSONDecodeError as exc:
        raw2 = _gemini_vision_raw(
            prompt + "\nIMPORTANT: Output valid JSON only, one object, no markdown.",
            image_bytes,
            mime_type,
            temperature=0.05,
            use_json_mime=False,
            model_name=model_name,
        )
        try:
            parsed = _extract_json_object(raw2)
        except json.JSONDecodeError as exc2:
            raise ValueError(f"Could not parse label JSON from Gemini: {exc!s}; retry: {exc2!s}") from exc2

    labels_raw = parsed.get("labels")
    if not isinstance(labels_raw, list):
        raise ValueError("Invalid response: missing labels array.")

    id_to_text: dict[str, str] = {}
    for item in labels_raw:
        if not isinstance(item, dict):
            continue
        eid = str(item.get("id") or "").strip()
        if not eid:
            continue
        label = str(item.get("label") or "").strip() or "segment"
        role = str(item.get("role") or "").strip()
        if role:
            id_to_text[eid] = f"{label} ({role})"
        else:
            id_to_text[eid] = label

    out: list[dict[str, Any]] = []
    for el in elements:
        eid = str(el.get("id") or "")
        text = id_to_text.get(eid) or el.get("label") or "segment"
        row = dict(el)
        row["label"] = text
        out.append(row)
    return out


def detect_ui_breakdown(
    project_key: str,
    source_filename: str,
    *,
    prefetched_elements: list[dict[str, Any]],
    skip_vlm_label: bool = False,
    label_temperature: float = 0.2,
    label_model: str | None = None,
) -> dict[str, Any]:
    """
    Merge SAM geometry from the local agent with optional Gemini VLM labeling.
    SAM itself runs only in local_agent (see POST /ui_breakdown/sam).
    """
    safe = validate_image_filename(source_filename)
    path = find_image_path(safe, project_key)
    if not path:
        raise ValueError("Source image not found on the API server (needed for labeling).")
    pil_full = _pil_canonical_rgba(path)
    iw, ih = pil_full.size

    elements: list[dict[str, Any]] = []
    for raw in prefetched_elements:
        if not isinstance(raw, dict):
            continue
        try:
            elements.append(
                {
                    "id": str(raw["id"]),
                    "label": str(raw.get("label") or "segment"),
                    "x_min": float(raw["x_min"]),
                    "y_min": float(raw["y_min"]),
                    "x_max": float(raw["x_max"]),
                    "y_max": float(raw["y_max"]),
                }
            )
        except (KeyError, TypeError, ValueError):
            continue

    if not skip_vlm_label and elements:
        image_bytes, mime = _encode_png_for_vision(pil_full)
        elements = _label_regions_with_gemini(
            elements,
            image_bytes,
            mime,
            iw,
            ih,
            temperature=label_temperature,
            model_name=label_model,
        )

    return {
        "elements": elements,
        "image_width": iw,
        "image_height": ih,
    }


def strip_text_ui_image(
    project_key: str,
    source_filename: str,
    *,
    prompt_suffix: str = "",
    width: int = 1024,
    height: int = 1024,
    model: str | None = None,
) -> dict[str, Any]:
    safe = validate_image_filename(source_filename)
    path = find_image_path(safe, project_key)
    if not path:
        raise ValueError("Source image not found.")

    base_prompt = (
        "You are given a reference image of a user interface. "
        "Remove all text, labels, captions, and typography. "
        "Keep the same layout, colors, materials, and overall style. "
        "Fill former text areas with plausible background surfaces that match the surrounding UI. "
        "Do not add new interactive controls."
    )
    if prompt_suffix.strip():
        base_prompt = f"{base_prompt}\n\nAdditional instructions:\n{prompt_suffix.strip()}"

    model_key = resolve_image_model("imagegen", model)
    reg = IMAGE_MODEL_REGISTRY.get(model_key, {})
    if reg.get("provider") != "gemini":
        model_key = resolve_image_model("imagegen", "gemini-2.5-flash-image")

    ui_dir = get_ui_canvas_images_dir(project_key)

    result = generate_image(
        prompt=base_prompt,
        width=width,
        height=height,
        num_images=1,
        model=model_key,
        project_key=project_key,
        reference_image_filenames=[safe],
        images_output_dir=ui_dir,
    )
    images = result.get("images") or []
    if not images:
        raise ValueError("Image generation returned no images.")

    first = images[0]
    fn = first.get("filename")
    if not fn:
        raise ValueError("Missing filename in generation result.")
    return {
        "filename": fn,
        "url": first.get("url") or f"/images/{fn}?project_key={project_key}",
        "path": first.get("path"),
    }


def process_ui_breakdown(
    project_key: str,
    source_filename: str,
    export_folder: str,
    elements: list[dict[str, Any]],
    *,
    crop_padding_px: int = 4,
    background_prompt_suffix: str = "",
    width: int = 1024,
    height: int = 1024,
    regen_model: str | None = None,
    transparent_background: bool = True,
    only_element_id: str | None = None,
) -> dict[str, Any]:
    safe = validate_image_filename(source_filename)
    path = find_image_path(safe, project_key)
    if not path:
        raise ValueError("Source image not found.")

    folder_safe = sanitize_export_folder(export_folder)
    ui_root = get_ui_canvas_images_dir(project_key)
    out_dir = ui_root / folder_safe
    out_dir.mkdir(parents=True, exist_ok=True)
    out_resolved = out_dir.resolve()
    ui_resolved = ui_root.resolve()
    if ui_resolved not in out_resolved.parents and out_resolved != ui_resolved:
        raise ValueError("Invalid export folder.")

    img = _pil_canonical_rgba(path)
    iw, ih = img.size
    pad = max(0, int(crop_padding_px))

    files_out: list[dict[str, str]] = []

    # Top-to-bottom, then left-to-right — export widgets in visual order; empty background plate is last.
    sorted_elements: list[dict[str, Any]] = []
    for el in elements:
        if not isinstance(el, dict):
            continue
        try:
            float(el["x_min"])
            float(el["y_min"])
            float(el["x_max"])
            float(el["y_max"])
        except (KeyError, TypeError, ValueError):
            continue
        sorted_elements.append(el)
    sorted_elements.sort(key=lambda e: (float(e["y_min"]), float(e["x_min"])))

    oid = (only_element_id or "").strip()
    if oid:
        filtered = [e for e in sorted_elements if str(e.get("id") or "") == oid]
        if not filtered:
            raise ValueError(
                f"No region matches id {oid!r}. Select a region in the preview or list before exporting selection only."
            )
        sorted_elements = filtered

    for i, el in enumerate(sorted_elements):
        try:
            x_min = float(el["x_min"])
            y_min = float(el["y_min"])
            x_max = float(el["x_max"])
            y_max = float(el["y_max"])
        except (KeyError, TypeError, ValueError):
            continue
        x0 = int(x_min * iw) - pad
        y0 = int(y_min * ih) - pad
        x1 = int(x_max * iw) + pad
        y1 = int(y_max * ih) + pad
        x0 = max(0, min(iw - 1, x0))
        y0 = max(0, min(ih - 1, y0))
        x1 = max(x0 + 1, min(iw, x1))
        y1 = max(y0 + 1, min(ih, y1))
        crop = img.crop((x0, y0, x1, y1))
        mask_full = _decode_full_image_mask_l(el)
        if mask_full is not None:
            crop = _apply_mask_alpha_to_crop(
                crop,
                mask_full,
                iw=iw,
                ih=ih,
                crop_box=(x0, y0, x1, y1),
            )
        eid = str(el.get("id") or f"w{i+1}")
        lbl = _safe_label_fragment(str(el.get("label") or "widget"))
        wname = sanitize_widget_filename(f"widget_{eid}_{lbl}")
        wpath = out_dir / wname
        crop.save(wpath, format="PNG")
        rel = f"{folder_safe}/{wname}"
        files_out.append(
            {
                "role": "widget",
                "filename": wname,
                "relative_path": rel,
                "url": build_ui_canvas_nested_url(rel, project_key),
            }
        )

    if oid:
        return {
            "folder": folder_safe,
            "files": files_out,
        }

    bg_prompt = (
        "Recreate the same window frame and main panel surfaces as the reference UI image. "
        "Remove every button, icon, control, input, list, and all text. "
        "Critical: where a button or control was, do NOT leave a recessed well, darker pad, inset slot, "
        "embossed outline, or empty 'placeholder' shape—those areas must be filled with the same continuous "
        "material as the surrounding panel (same green/glass/chrome), so the surface looks flat and uniform. "
        "No sunken rectangles or shadows that suggest a missing control. "
        "The background plate must look like a plain shell: one continuous panel with no holes or control-shaped voids. "
        "Suitable as a static layer; widgets will be composited on top separately."
    )
    if background_prompt_suffix.strip():
        bg_prompt = f"{bg_prompt}\n\nAdditional instructions:\n{background_prompt_suffix.strip()}"

    # Always Gemini + source filename as reference. OpenAI image generation has no image input; using it
    # for transparent PNG produced unrelated gray plates. Alpha quality may vary vs GPT Image, but matches the UI.
    model_key = resolve_image_model("imagegen", regen_model)
    reg = IMAGE_MODEL_REGISTRY.get(model_key, {})
    if reg.get("provider") != "gemini":
        model_key = resolve_image_model("imagegen", "gemini-2.5-flash-image")
    ref_images: list[str] | None = [safe]
    if transparent_background:
        bg_prompt = (
            f"{bg_prompt}\n\n"
            "PNG with real alpha: transparency belongs in outer margins and outside the panel frame only—"
            "not as cut-outs or holes on the panel where controls were removed. The main panel fill must stay "
            "opaque and continuous (alpha 255 there), not white or gray placeholders."
        )

    result = generate_image(
        prompt=bg_prompt,
        width=width,
        height=height,
        num_images=1,
        model=model_key,
        project_key=project_key,
        reference_image_filenames=ref_images,
        images_output_dir=out_dir,
        transparent_background=True if transparent_background else None,
    )
    images = result.get("images") or []
    if images:
        bg = images[0]
        bg_fn = bg.get("filename")
        if bg_fn:
            src_path = out_dir / bg_fn
            dest_path = out_dir / "background.png"
            if src_path.exists() and src_path != dest_path:
                try:
                    if dest_path.exists():
                        dest_path.unlink()
                    src_path.rename(dest_path)
                except OSError:
                    pass
            bg_rel = f"{folder_safe}/background.png"
            if (out_dir / "background.png").exists():
                files_out.append(
                    {
                        "role": "background",
                        "filename": "background.png",
                        "relative_path": bg_rel,
                        "url": build_ui_canvas_nested_url(bg_rel, project_key),
                    },
                )
            elif bg_fn:
                alt_rel = f"{folder_safe}/{bg_fn}"
                files_out.append(
                    {
                        "role": "background",
                        "filename": bg_fn,
                        "relative_path": alt_rel,
                        "url": build_ui_canvas_nested_url(alt_rel, project_key),
                    },
                )

    return {
        "folder": folder_safe,
        "files": files_out,
    }
