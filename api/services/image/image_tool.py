import base64
import io
import mimetypes
import os
import re
import shutil
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Optional

import requests
from openai import OpenAI
from PIL import Image, ImageDraw, ImageFont, ImageOps

from core.local_paths import require_local_project_path
from services.core.rag import resolve_project_path
from core.local_settings import load_image_defaults
from core.code_settings import (
    ALLOWED_IMAGE_DIMENSIONS,
    IMAGE_MAX_IMAGES,
    IMAGE_MAX_PROMPT_LEN,
    IMAGE_MODEL_REGISTRY,
    resolve_image_model,
)

MAX_FILENAME_LEN = 120
ALLOWED_FILENAME_RE = re.compile(r"[^a-zA-Z0-9._-]+")
ALLOWED_IMAGE_RE = re.compile(r"^[a-zA-Z0-9._-]+$")
ALLOWED_FORMATS = {"png", "jpg", "jpeg", "webp"}
ALLOWED_DIMENSIONS = ALLOWED_IMAGE_DIMENSIONS
MAX_PROMPT_LEN = IMAGE_MAX_PROMPT_LEN
MAX_IMAGES = IMAGE_MAX_IMAGES

_OPENAI_GPT_IMAGE_2_MODEL = "gpt-image-2"
_OPENAI_GPT_IMAGE_2_MIN_PIXELS = 655_360
_OPENAI_GPT_IMAGE_2_MAX_PIXELS = 8_294_400
_OPENAI_GPT_IMAGE_2_MAX_EDGE = 3840
_OPENAI_GPT_IMAGE_2_MIN_ASPECT_N = 68


def _is_gpt_image_2_model(model_name: str) -> bool:
    cleaned = (model_name or "").strip()
    if cleaned == _OPENAI_GPT_IMAGE_2_MODEL:
        return True
    registry_entry = IMAGE_MODEL_REGISTRY.get(cleaned)
    if registry_entry:
        return str(registry_entry.get("provider_model", cleaned)) == _OPENAI_GPT_IMAGE_2_MODEL
    return False


def _openai_edit_supports_input_fidelity(model_name: str) -> bool:
    """gpt-image-2 rejects input_fidelity; only 1.x / 1.5 support it on images.edit."""
    if _is_gpt_image_2_model(model_name):
        return False
    cleaned = (model_name or "").strip()
    if cleaned in ("gpt-image-1", "gpt-image-1.5", "gpt-image-1-mini"):
        return True
    registry_entry = IMAGE_MODEL_REGISTRY.get(cleaned)
    if registry_entry and registry_entry.get("provider") == "openai":
        provider_model = str(registry_entry.get("provider_model", cleaned))
        return provider_model in ("gpt-image-1", "gpt-image-1.5", "gpt-image-1-mini")
    return cleaned.startswith("gpt-image-1")


def _openai_legacy_preset_size(width: int, height: int) -> str:
    """GPT Image 1.x / 1.5 fixed presets (3:2 landscape, 2:3 portrait)."""
    safe_width = max(256, int(width))
    safe_height = max(256, int(height))
    if safe_width == safe_height:
        return "1024x1024"
    if safe_width > safe_height:
        return "1536x1024"
    return "1024x1536"


def _openai_gpt_image_2_size(width: int, height: int) -> str:
    """gpt-image-2 custom size: true 16:9 landscape, 9:16 portrait, square; OpenAI constraints applied."""
    w = max(16, int(width))
    h = max(16, int(height))

    if w == h:
        side = max(256, ((w + 15) // 16) * 16)
        while side * side < _OPENAI_GPT_IMAGE_2_MIN_PIXELS:
            side += 16
        while side > _OPENAI_GPT_IMAGE_2_MAX_EDGE or side * side > _OPENAI_GPT_IMAGE_2_MAX_PIXELS:
            side -= 16
        if side < 256:
            side = 256
        return f"{side}x{side}"

    landscape = w >= h
    if landscape:
        n = max((w + 15) // 16, (h + 8) // 9)
    else:
        n = max((h + 15) // 16, (w + 8) // 9)
    n = max(n, _OPENAI_GPT_IMAGE_2_MIN_ASPECT_N)
    while n > 0:
        if landscape:
            out_w, out_h = 16 * n, 9 * n
        else:
            out_w, out_h = 9 * n, 16 * n
        pixels = out_w * out_h
        if (
            out_w <= _OPENAI_GPT_IMAGE_2_MAX_EDGE
            and out_h <= _OPENAI_GPT_IMAGE_2_MAX_EDGE
            and _OPENAI_GPT_IMAGE_2_MIN_PIXELS <= pixels <= _OPENAI_GPT_IMAGE_2_MAX_PIXELS
        ):
            return f"{out_w}x{out_h}"
        n -= 1
    return "1088x612" if landscape else "612x1088"


def resolve_openai_image_size(model_name: str, width: int, height: int) -> str:
    if _is_gpt_image_2_model(model_name):
        return _openai_gpt_image_2_size(width, height)
    return _openai_legacy_preset_size(width, height)


def _load_rembg():
    try:
        from rembg import new_session, remove as rembg_remove  # type: ignore
    except Exception:
        return None, None
    return rembg_remove, new_session


def _shorten_prompt(prompt: str, max_len: int = MAX_PROMPT_LEN) -> str:
    cleaned = " ".join(prompt.split())
    if len(cleaned) <= max_len:
        return cleaned
    # Try to cut at a sentence boundary near the limit.
    slice_candidate = cleaned[:max_len]
    for separator in (". ", "; ", ", "):
        idx = slice_candidate.rfind(separator)
        if idx > max_len * 0.6:
            return slice_candidate[: idx + 1].strip()
    return slice_candidate.rstrip()


def get_images_dir(project_key: Optional[str] = None) -> Path:
    raw = os.getenv("IMAGES_OUTPUT_DIR")
    if not raw:
        project_dir = resolve_project_path(project_key)
        raw = str(Path(project_dir) / "Images") if project_dir else "./output/images"
    elif not Path(raw).is_absolute():
        project_dir = resolve_project_path(project_key)
        if project_dir:
            raw = str(Path(project_dir) / raw)
    output_dir = Path(os.path.expandvars(raw)).expanduser()
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def get_ui_canvas_images_dir(project_key: Optional[str] = None) -> Path:
    """UI Builder / UI Canvas assets: <project>/Gen/Images/UI."""
    project_dir = resolve_project_path(project_key)
    if project_dir:
        out = Path(project_dir).joinpath("Gen", "Images", "UI")
    else:
        out = Path("./output/images/Gen/Images/UI")
    out = Path(os.path.expandvars(str(out))).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    return out


def find_image_path(filename: str, project_key: Optional[str] = None) -> Optional[Path]:
    """Resolve a bare filename to project Images/ or Gen/Images/UI/ if the file exists."""
    safe_name = validate_image_filename(filename)
    p1 = safe_resolve_path(safe_name, project_key)
    if p1.exists():
        return p1
    ui_dir = get_ui_canvas_images_dir(project_key).resolve()
    p2 = (ui_dir / safe_name).resolve()
    if ui_dir not in p2.parents and p2 != ui_dir:
        raise ValueError("Invalid filename path.")
    if p2.exists():
        return p2
    return None


def sanitize_filename(value: str, default_ext: str = "png") -> str:
    cleaned = value.replace("\\", "_").replace("/", "_").strip()
    cleaned = cleaned.replace("..", "_")
    cleaned = ALLOWED_FILENAME_RE.sub("_", cleaned).strip(" ._")
    if not cleaned:
        cleaned = "image"
    if "." not in cleaned:
        cleaned = f"{cleaned}.{default_ext}"
    if len(cleaned) > MAX_FILENAME_LEN:
        base, ext = cleaned.rsplit(".", 1)
        base = base[: MAX_FILENAME_LEN - (len(ext) + 1)].rstrip(" ._")
        cleaned = f"{base}.{ext}"
    return cleaned


def validate_image_filename(filename: str) -> str:
    cleaned = filename.strip()
    if not cleaned:
        raise ValueError("Filename is required.")
    if "/" in cleaned or "\\" in cleaned or ":" in cleaned:
        raise ValueError("Invalid filename.")
    if ".." in cleaned:
        raise ValueError("Invalid filename.")
    if not ALLOWED_IMAGE_RE.match(cleaned):
        raise ValueError("Filename contains invalid characters.")
    ext = cleaned.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_FORMATS:
        raise ValueError("Unsupported image format.")
    if len(cleaned) > MAX_FILENAME_LEN:
        raise ValueError("Filename is too long.")
    return cleaned


def safe_resolve_path(filename: str, project_key: Optional[str] = None) -> Path:
    output_dir = get_images_dir(project_key).resolve()
    candidate = (output_dir / filename).resolve()
    if output_dir not in candidate.parents and candidate != output_dir:
        raise ValueError("Invalid filename path.")
    return candidate


def build_image_filename(prefix: str = "image", ext: str = "png") -> str:
    safe_prefix = ALLOWED_FILENAME_RE.sub("_", prefix).strip(" ._").lower() or "image"
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    suffix = uuid.uuid4().hex[:6]
    return sanitize_filename(f"{safe_prefix}_{timestamp}_{suffix}.{ext}", ext)


def save_bytes_to_file(
    data: bytes,
    filename: str,
    project_key: Optional[str] = None,
    *,
    base_dir: Optional[Path] = None,
) -> Path:
    safe_name = sanitize_filename(filename)
    output_dir = (base_dir.resolve() if base_dir is not None else get_images_dir(project_key).resolve())
    output_path = (output_dir / safe_name).resolve()
    if output_dir not in output_path.parents and output_path != output_dir:
        raise ValueError("Invalid filename path.")
    output_path.write_bytes(data)
    print(f"[image_tool] Saved image to: {output_path.resolve()}")
    return output_path


def save_bytes_to_dir(data: bytes, filename: str, output_dir: Path) -> Path:
    safe_name = sanitize_filename(filename)
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = (output_dir / safe_name).resolve()
    if output_dir not in output_path.parents and output_path != output_dir:
        raise ValueError("Invalid output path.")
    output_path.write_bytes(data)
    print(f"[image_tool] Saved image to: {output_path.resolve()}")
    return output_path


def build_image_url(filename: str, project_key: Optional[str] = None) -> str:
    url = f"/images/{filename}"
    if project_key:
        url = f"{url}?project_key={project_key}"
    return url


def resolve_ui_canvas_nested_file(project_key: str, relative: str) -> Path:
    """
    Resolve a file under <project>/Gen/Images/UI/ given a relative path (forward slashes).
    Example: MyExport/background.png
    """
    pk = (project_key or "").strip()
    if not pk:
        raise ValueError("project_key is required.")
    rel = (relative or "").strip().replace("\\", "/").lstrip("/")
    if not rel or ".." in rel:
        raise ValueError("Invalid path.")
    parts = [p for p in rel.split("/") if p]
    if not parts:
        raise ValueError("Invalid path.")
    segment_re = re.compile(r"^[a-zA-Z0-9._-]+$")
    for p in parts:
        if not segment_re.match(p):
            raise ValueError("Invalid path segment.")
    base = get_ui_canvas_images_dir(pk).resolve()
    candidate = base.joinpath(*parts).resolve()
    if base not in candidate.parents and candidate != base:
        raise ValueError("Invalid path.")
    return candidate


def build_ui_canvas_nested_url(relative: str, project_key: str) -> str:
    """URL for a file under Gen/Images/UI/<relative>."""
    from urllib.parse import quote

    q = quote(relative, safe="")
    pk = quote(project_key.strip(), safe="")
    return f"/images/ui_file?project_key={pk}&rel={q}"


def public_url_for_saved_project_image(output_path: Path, project_key: Optional[str]) -> str:
    """
    Prefer /images/ui_file?rel=... for files under Gen/Images/UI (nested exports);
    otherwise /images/<filename> for project Images/.
    """
    fn = output_path.name
    if not project_key or not str(project_key).strip():
        return build_image_url(fn, project_key)
    pk = str(project_key).strip()
    try:
        ui_root = get_ui_canvas_images_dir(pk).resolve()
        outp = output_path.resolve()
        if ui_root in outp.parents or outp.parent == ui_root:
            rel = outp.relative_to(ui_root).as_posix()
            return build_ui_canvas_nested_url(rel, pk)
    except ValueError:
        pass
    return build_image_url(fn, project_key)


_IMPORT_MAX_BYTES = 25 * 1024 * 1024
_IMPORT_CT_TO_EXT: dict[str, str] = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/pjpeg": "jpg",
    "image/jfif": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
}


def _guess_import_ext(
    content_type: Optional[str],
    original_filename: Optional[str],
    data: Optional[bytes] = None,
) -> Optional[str]:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct in _IMPORT_CT_TO_EXT:
        return _IMPORT_CT_TO_EXT[ct]
    fn = (original_filename or "").lower()
    for ext in ("png", "jpg", "jpeg", "webp", "gif", "jfif", "jpe", "pjp"):
        if fn.endswith(f".{ext}"):
            return "jpg" if ext in ("jpeg", "jfif", "jpe", "pjp") else ext
    # Some browsers send application/octet-stream; sniff common image signatures.
    if data and len(data) >= 3 and data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data and len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data and len(data) >= 6 and data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if data and len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def import_uploaded_image(
    data: bytes,
    content_type: Optional[str],
    original_filename: Optional[str],
    project_key: Optional[str],
    replace_filename: Optional[str] = None,
    *,
    save_to_ui_canvas: bool = False,
) -> dict:
    """Save an uploaded image to project Images/ or Gen/Images/UI/ (UI Builder)."""
    pk = (project_key or "").strip() or None
    if not pk:
        raise ValueError("project_key is required.")
    if len(data) > _IMPORT_MAX_BYTES:
        raise ValueError("File too large (max 25 MB).")
    ext = _guess_import_ext(content_type, original_filename, data=data)
    if not ext:
        raise ValueError("Unsupported image type. Use PNG, JPEG, WebP, or GIF.")
    if replace_filename and replace_filename.strip():
        output_name = validate_image_filename(replace_filename.strip())
        name_ext = output_name.rsplit(".", 1)[-1].lower()
        if name_ext == "jpeg":
            name_ext = "jpg"
        upload_ext = ext
        if upload_ext == "jpeg":
            upload_ext = "jpg"
        if name_ext != upload_ext:
            raise ValueError("Uploaded image type must match the file extension being replaced.")
    else:
        output_name = build_image_filename("import", ext)
    base_dir = get_ui_canvas_images_dir(pk) if save_to_ui_canvas else None
    save_bytes_to_file(data, output_name, pk, base_dir=base_dir)
    return {"filename": output_name, "url": build_image_url(output_name, pk)}


def _clamp_dimension(value: int) -> int:
    return value if value in ALLOWED_DIMENSIONS else 1024


def _find_first_key(payload: object, keys: set[str], depth: int = 0) -> str | None:
    if depth > 5:
        return None
    if isinstance(payload, dict):
        for key in keys:
            value = payload.get(key)
            if isinstance(value, str):
                return value
        for value in payload.values():
            found = _find_first_key(value, keys, depth + 1)
            if found:
                return found
    if isinstance(payload, list):
        for item in payload:
            found = _find_first_key(item, keys, depth + 1)
            if found:
                return found
    return None


def _extract_generation_id(payload: dict) -> str | None:
    return _find_first_key(payload, {"generationId", "generation_id", "id"})


def _collect_image_urls(payload: object, depth: int = 0) -> list[str]:
    if depth > 6:
        return []
    urls: list[str] = []
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key in {"images", "generated_images"} and isinstance(value, list):
                for item in value:
                    if isinstance(item, dict) and item.get("url"):
                        urls.append(item["url"])
            else:
                urls.extend(_collect_image_urls(value, depth + 1))
    elif isinstance(payload, list):
        for item in payload:
            urls.extend(_collect_image_urls(item, depth + 1))
    return urls


def _extract_image_urls(payload: object) -> list[str]:
    return _collect_image_urls(payload)


def _placeholder_image(width: int, height: int, text: str) -> bytes:
    img = Image.new("RGB", (width, height), color=(30, 41, 59))
    draw = ImageDraw.Draw(img)
    message = text[:80]
    draw.text((20, 20), message, fill=(226, 232, 240), font=ImageFont.load_default())
    output = io.BytesIO()
    img.save(output, format="PNG")
    return output.getvalue()


def list_ui_canvas_nested_images(project_key: str, subfolder: str | None = None) -> list[dict[str, str]]:
    """
    List image files under Gen/Images/UI in subfolders (e.g. breakdown exports: folder/widget.png).
    Skips loose files directly under Gen/Images/UI root (polish/strip outputs).
    If subfolder is set, only files under Gen/Images/UI/<subfolder>/ (that folder only).
    """
    pk = (project_key or "").strip()
    if not pk:
        raise ValueError("project_key is required.")
    sub = (subfolder or "").strip().replace("\\", "/").strip("/")
    if sub:
        segment_re = re.compile(r"^[a-zA-Z0-9._-]+$")
        if not segment_re.match(sub):
            raise ValueError("Invalid subfolder name.")
    base = get_ui_canvas_images_dir(pk).resolve()
    if not base.exists():
        return []
    out: list[dict[str, str]] = []
    exts = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    for p in base.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in exts:
            continue
        try:
            rel = p.relative_to(base).as_posix()
        except ValueError:
            continue
        if rel.count("/") < 1:
            continue
        if sub:
            first = rel.split("/")[0]
            if first != sub:
                continue
        out.append(
            {
                "relative_path": rel,
                "url": build_ui_canvas_nested_url(rel, pk),
            }
        )
    out.sort(key=lambda x: x["relative_path"].lower())
    return out


def delete_ui_canvas_nested_file(project_key: str, relative: str) -> None:
    """Delete a file under Gen/Images/UI (same rules as resolve_ui_canvas_nested_file)."""
    path = resolve_ui_canvas_nested_file(project_key, relative)
    if not path.is_file():
        raise ValueError("File not found.")
    path.unlink()


def resolve_project_root_relative_file(project_key: str, relative: str) -> Path:
    """
    Resolve a file path under the project's local root (same segment rules as Gen/Images/UI nested paths).
    Example relative: Assets/StreamingAssets/MyGame/data/sprite.png
    """
    pk = (project_key or "").strip()
    if not pk:
        raise ValueError("project_key is required.")
    root = Path(require_local_project_path(pk)).resolve()
    rel = (relative or "").strip().replace("\\", "/").lstrip("/")
    if not rel or ".." in rel:
        raise ValueError("Invalid path.")
    parts = [p for p in rel.split("/") if p]
    if not parts:
        raise ValueError("Invalid path.")
    segment_re = re.compile(r"^[a-zA-Z0-9._-]+$")
    for p in parts:
        if not segment_re.match(p):
            raise ValueError("Invalid path segment.")
    candidate = root.joinpath(*parts).resolve()
    if root not in candidate.parents and candidate != root:
        raise ValueError("Invalid path.")
    return candidate


def delete_project_relative_file(project_key: str, relative: str) -> None:
    """Delete a single file under the project's local root (not directories)."""
    path = resolve_project_root_relative_file(project_key, relative)
    if not path.is_file():
        raise ValueError("File not found.")
    path.unlink()


def delete_ui_canvas_export_folder(project_key: str, subfolder: str) -> None:
    """
    Delete Gen/Images/UI/<subfolder>/ and all contents (breakdown export directory).
    Subfolder must be a single safe path segment (same rules as list_ui_canvas_nested_images subfolder).
    """
    pk = (project_key or "").strip()
    if not pk:
        raise ValueError("project_key is required.")
    sub = (subfolder or "").strip().replace("\\", "/").strip("/")
    if not sub:
        raise ValueError("subfolder is required.")
    segment_re = re.compile(r"^[a-zA-Z0-9._-]+$")
    if not segment_re.match(sub):
        raise ValueError("Invalid subfolder name.")
    base = get_ui_canvas_images_dir(pk).resolve()
    target = (base / sub).resolve()
    try:
        target.relative_to(base)
    except ValueError as exc:
        raise ValueError("Invalid path.") from exc
    if target == base:
        raise ValueError("Cannot delete UI root.")
    if not target.exists():
        return
    if not target.is_dir():
        raise ValueError("Not a directory.")
    shutil.rmtree(target)


def _ensure_openai_reference_filename(name_hint: str, mime_type: str) -> str:
    """Filename with an extension accepted by OpenAI image edit (png, jpg, webp)."""
    n = (name_hint or "ref").strip() or "ref"
    lower = n.lower()
    if lower.endswith((".png", ".jpg", ".jpeg", ".webp")):
        return n
    mt = (mime_type or "").lower()
    if "jpeg" in mt or mt.endswith("/jpg"):
        stem = n.rsplit(".", 1)[0] if "." in n else n
        return f"{stem}.jpg"
    if "webp" in mt:
        stem = n.rsplit(".", 1)[0] if "." in n else n
        return f"{stem}.webp"
    stem = n.rsplit(".", 1)[0] if "." in n else n
    return f"{stem}.png"


def _load_reference_image_bytes(
    source: str, project_key: Optional[str] = None
) -> Optional[tuple[str, bytes, str]]:
    """
    Load reference image bytes from a URL or project path.
    Returns (upload_filename, raw_bytes, mime_type) for Gemini/OpenAI.
    """
    s = str(source or "").strip()
    if not s:
        return None
    data: bytes
    mime_type: str
    name_hint: str

    if s.startswith("http://") or s.startswith("https://"):
        try:
            resp = requests.get(s, timeout=60)
            resp.raise_for_status()
            data = resp.content
            ct = (resp.headers.get("content-type") or "").split(";")[0].strip()
            mime_type = ct if ct.startswith("image/") else (
                mimetypes.guess_type(s.split("?", 1)[0])[0] or "image/png"
            )
            path_part = s.split("?", 1)[0].rstrip("/")
            name_hint = path_part.rsplit("/", 1)[-1] or "ref"
        except Exception as exc:
            print(f"[image_tool] reference URL fetch failed ({s[:96]}…): {exc}")
            return None
    else:
        try:
            pk = (project_key or "").strip()
            if pk and ("/" in s or "\\" in s):
                rel = s.replace("\\", "/").lstrip("/")
                if ".." not in rel:
                    try:
                        nested_path = resolve_ui_canvas_nested_file(pk, rel)
                        if nested_path.is_file():
                            data = nested_path.read_bytes()
                            mime_type, _ = mimetypes.guess_type(nested_path.name)
                            if not mime_type:
                                mime_type = "image/png"
                            name_hint = nested_path.name
                            fname = _ensure_openai_reference_filename(name_hint, mime_type)
                            return (fname, data, mime_type)
                    except ValueError:
                        pass
                    root_str = resolve_project_path(pk)
                    if root_str:
                        root = Path(root_str).resolve()
                        candidate = (root / rel).resolve()
                        if candidate.is_file() and (root in candidate.parents or candidate == root):
                            data = candidate.read_bytes()
                            mime_type, _ = mimetypes.guess_type(candidate.name)
                            if not mime_type:
                                mime_type = "image/png"
                            name_hint = candidate.name
                            fname = _ensure_openai_reference_filename(name_hint, mime_type)
                            return (fname, data, mime_type)
            safe_name = validate_image_filename(s)
            image_path = find_image_path(safe_name, project_key)
            if not image_path:
                print(f"[image_tool] reference file missing: {safe_name!r}")
                return None
            data = image_path.read_bytes()
            mime_type, _ = mimetypes.guess_type(image_path.name)
            if not mime_type:
                mime_type = "image/png"
            name_hint = image_path.name
        except Exception as exc:
            print(f"[image_tool] reference local load failed ({s[:80]}): {exc}")
            return None
        fname = _ensure_openai_reference_filename(name_hint, mime_type)
        return (fname, data, mime_type)

    fname = _ensure_openai_reference_filename(name_hint, mime_type)
    return (fname, data, mime_type)


def _gemini_reference_inline_part(
    source: str, project_key: Optional[str] = None
) -> Optional[dict]:
    """
    Build one Gemini content part (inline image) from either:
    - https?://... URL (fetched; used for storyboard Supabase URLs), or
    - relative path under Gen/Images/UI (e.g. MyExport/widget.png) when it contains /, or
    - relative path under the resolved project root (e.g. Assets/StreamingAssets/.../card.png), or
    - bare filename under the project Images directory (existing behavior).
    """
    loaded = _load_reference_image_bytes(source, project_key)
    if not loaded:
        return None
    _fname, data, mime_type = loaded
    b64 = base64.b64encode(data).decode("ascii")
    return {
        "inline_data": {
            "mime_type": mime_type,
            "data": b64,
        }
    }


def _extract_error_details(payload: object) -> str:
    if isinstance(payload, dict):
        return str(payload.get("error") or payload.get("detail") or payload)
    if isinstance(payload, list) and payload:
        first = payload[0]
        if isinstance(first, dict):
            extensions = first.get("extensions") or {}
            if isinstance(extensions, dict):
                return str(extensions.get("details") or first.get("message") or payload)
        return str(first)
    return str(payload)


_GEMINI_TRANSPARENT_BG_SUFFIX = (
    "\n\nOutput: PNG with real alpha. Use transparent pixels (not white or gray) for any area "
    "that should not occlude layers beneath—no solid full-canvas backdrop behind the UI unless "
    "the reference clearly shows opaque chrome; prefer transparency for empty margins and "
    "where the design allows layering."
)


def _generate_image_gemini(
    prompt: str,
    width: int,
    height: int,
    quantity: int,
    project_key: Optional[str],
    reference_image_filenames: Optional[Iterable[str]] = None,
    images_output_dir: Optional[Path] = None,
    transparent_background: bool | None = None,
) -> dict:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("Gemini API key is missing. Set GEMINI_API_KEY.")

    if transparent_background is True:
        prompt = f"{prompt.strip()}{_GEMINI_TRANSPARENT_BG_SUFFIX}"

    # Basic aspect ratio + size mapping based on requested dimensions.
    if width == height:
        aspect_ratio = "1:1"
    elif width > height:
        aspect_ratio = "16:9"
    else:
        aspect_ratio = "9:16"

    max_dim = max(width, height)
    if max_dim <= 512:
        image_size = "512"
    elif max_dim <= 1024:
        image_size = "1K"
    elif max_dim <= 2048:
        image_size = "2K"
    else:
        image_size = "4K"

    parts: list[dict] = [{"text": prompt}]

    # Each entry: bare filename (project Images/) or http(s) URL (e.g. storyboard Supabase).
    sources = list(reference_image_filenames or [])
    for src in sources[:14]:
        inline = _gemini_reference_inline_part(src, project_key)
        if inline:
            parts.append(inline)

    payload = {
        "contents": [
            {
                "parts": parts,
            }
        ],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {
                "aspectRatio": aspect_ratio,
                "imageSize": image_size,
            },
        },
    }

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-3.1-flash-image-preview:generateContent"
    )
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    response = requests.post(url, json=payload, headers=headers, timeout=120)
    response_text = response.text
    try:
        data = response.json()
    except ValueError:
        data = response_text

    if not response.ok:
        raise ValueError(f"Gemini request failed: {_extract_error_details(data)}")

    if isinstance(data, dict) and any(
        key in data for key in ("error", "errors", "detail")
    ):
        raise ValueError(f"Gemini request failed: {_extract_error_details(data)}")

    images_bytes: list[bytes] = []
    if isinstance(data, dict):
        for candidate in data.get("candidates", []) or []:
            content = candidate.get("content") or {}
            parts_list = content.get("parts") or []
            for part in parts_list:
                if not isinstance(part, dict):
                    continue
                inline = part.get("inline_data") or part.get("inlineData")
                if not isinstance(inline, dict):
                    continue
                b64 = inline.get("data")
                if not isinstance(b64, str) or not b64:
                    continue
                try:
                    images_bytes.append(base64.b64decode(b64))
                except Exception:
                    continue

    if not images_bytes:
        raise ValueError("Gemini image generation returned no image data.")

    images: list[dict] = []
    for idx, data_bytes in enumerate(images_bytes[:quantity]):
        filename = build_image_filename("gemini", "png")
        output_path = save_bytes_to_file(data_bytes, filename, project_key, base_dir=images_output_dir)
        images.append(
            {
                "filename": filename,
                "url": public_url_for_saved_project_image(output_path, project_key),
                "path": str(output_path),
            }
        )
    return {"images": images}


def _generate_image_leonardo(
    prompt: str,
    width: int,
    height: int,
    quantity: int,
    project_key: Optional[str],
    negative_prompt: str | None = None,
    seed: int | None = None,
    provider_model: str = "gemini-2.5-flash-image",
    images_output_dir: Optional[Path] = None,
) -> dict:
    width = _clamp_dimension(width)
    height = _clamp_dimension(height)
    quantity = max(1, min(quantity, MAX_IMAGES))

    api_key = os.getenv("LEONARDO_API_KEY")
    if not api_key:
        image_bytes = _placeholder_image(width, height, "Leonardo API key missing.")
        filename = build_image_filename("leonardo_stub", "png")
        output_path = save_bytes_to_file(image_bytes, filename, project_key, base_dir=images_output_dir)
        return {
            "images": [
                {
                    "filename": filename,
                    "url": public_url_for_saved_project_image(output_path, project_key),
                    "path": str(output_path),
                }
            ]
        }

    base_url = os.getenv("LEONARDO_API_BASE", "https://cloud.leonardo.ai/api/rest/v2").rstrip("/")
    base_url_v1 = os.getenv("LEONARDO_API_BASE_V1", "https://cloud.leonardo.ai/api/rest/v1").rstrip("/")
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "authorization": f"Bearer {api_key}",
    }

    payload = {
        "model": provider_model,
        "parameters": {
            "width": width,
            "height": height,
            "prompt": prompt,
            "quantity": quantity,
            "prompt_enhance": "OFF",
            "style_ids": ["111dc692-d470-4eec-b791-3475abac4c46"],
        },
        "public": False,
    }
    if negative_prompt:
        payload["parameters"]["negative_prompt"] = negative_prompt
    if seed is not None:
        payload["parameters"]["seed"] = seed

    response = requests.post(f"{base_url}/generations", json=payload, headers=headers, timeout=120)
    response_text = response.text
    try:
        data = response.json()
    except ValueError:
        data = response_text

    if not response.ok:
        print(f"[leonardo] generate failed: {response.status_code} payload={payload} body={data}")
        raise ValueError(f"Leonardo request failed: {_extract_error_details(data)}")

    if isinstance(data, dict) and any(key in data for key in ("error", "errors", "detail")):
        print(f"[leonardo] generate error payload: {data} payload={payload}")
        raise ValueError(f"Leonardo request failed: {_extract_error_details(data)}")

    if isinstance(data, list):
        print(f"[leonardo] generate error list: {data} payload={payload}")
        raise ValueError(f"Leonardo request failed: {_extract_error_details(data)}")

    urls = _extract_image_urls(data)
    if not urls:
        generation_id = None
        if isinstance(data, dict) and isinstance(data.get("generate"), dict):
            generation_id = data["generate"].get("generationId")
        if not generation_id:
            generation_id = _extract_generation_id(data)
            if not generation_id:
                top_keys = list(data.keys()) if isinstance(data, dict) else type(data).__name__
                print(f"[leonardo] response body: {data}")
                raise ValueError(f"Leonardo response missing generation id. Keys: {top_keys}")

        poll_url = f"{base_url_v1}/generations/{generation_id}"
        urls = []
        start = time.time()
        while time.time() - start < 120:
            poll_response = requests.get(poll_url, headers=headers, timeout=30)
            poll_response.raise_for_status()
            poll_data = poll_response.json()
            urls = _extract_image_urls(poll_data)
            if urls:
                break
            time.sleep(2)

        if not urls:
            raise ValueError("Leonardo generation timed out.")

    images: list[dict] = []
    for idx, url in enumerate(urls[:quantity]):
        image_response = requests.get(url, timeout=60)
        image_response.raise_for_status()
        filename = build_image_filename(f"leonardo_{idx+1}", "png")
        output_path = save_bytes_to_file(image_response.content, filename, project_key, base_dir=images_output_dir)
        images.append(
            {
                "filename": filename,
                "url": public_url_for_saved_project_image(output_path, project_key),
                "path": str(output_path),
            }
        )

    return {"images": images}


def _generate_image_openai(
    prompt: str,
    width: int,
    height: int,
    quantity: int,
    project_key: Optional[str],
    negative_prompt: str | None = None,
    model_name: str = "gpt-image-1.5",
    quality: str | None = None,
    style: str | None = None,
    transparent_background: bool | None = None,
    images_output_dir: Optional[Path] = None,
    reference_image_filenames: Optional[Iterable[str]] = None,
) -> dict:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OpenAI API key is missing. Set OPENAI_API_KEY.")

    safe_width = max(256, int(width))
    safe_height = max(256, int(height))
    size = resolve_openai_image_size(model_name, safe_width, safe_height)
    if negative_prompt:
        prompt = f"{prompt}\nNegative prompt: {negative_prompt}"

    client = OpenAI(api_key=api_key)
    params: dict = {
        "model": model_name,
        "prompt": prompt,
        "size": size,
        "n": max(1, min(quantity, MAX_IMAGES)),
        "user": project_key or None,
    }
    if quality:
        params["quality"] = quality
    if transparent_background is True:
        params["background"] = "transparent"
    elif transparent_background is False:
        params["background"] = "opaque"

    # images.generate does not accept reference inputs; GPT Image models accept up to 16
    # images on images.edit with input_fidelity (storyboard character/location refs).
    ref_files: list[tuple[str, bytes]] = []
    for src in list(reference_image_filenames or [])[:16]:
        loaded = _load_reference_image_bytes(src, project_key)
        if loaded:
            fname, data, _mime = loaded
            ref_files.append((fname, data))
    if list(reference_image_filenames or []) and not ref_files:
        print(
            "[image_tool] OpenAI: reference images were requested but none could be loaded; "
            "falling back to text-only generation."
        )

    if ref_files:
        params["image"] = ref_files
        if _openai_edit_supports_input_fidelity(model_name):
            params["input_fidelity"] = "high"
        # images.edit does not support quality="hd" (images.generate does).
        if params.get("quality") == "hd":
            params["quality"] = "high"
        response = client.images.edit(**params)
    else:
        response = client.images.generate(**params)

    images: list[dict] = []
    for idx, item in enumerate(response.data or []):
        b64 = getattr(item, "b64_json", None)
        if not b64 and isinstance(item, dict):
            b64 = item.get("b64_json")
        if not b64:
            continue
        data_bytes = base64.b64decode(b64)
        filename = build_image_filename(f"gpt_image_{idx+1}", "png")
        output_path = save_bytes_to_file(data_bytes, filename, project_key, base_dir=images_output_dir)
        images.append(
            {
                "filename": filename,
                "url": public_url_for_saved_project_image(output_path, project_key),
                "path": str(output_path),
            }
        )

    if not images:
        raise ValueError("OpenAI image generation returned no images.")

    return {"images": images}


def generate_openai_image_to_dir(
    prompt: str,
    output_dir: Path,
    filename: str,
    width: int = 1024,
    height: int = 1024,
    quality: str | None = None,
    style: str | None = None,
    transparent_background: bool | None = None,
    model_name: str = "gpt-image-1.5",
    project_key: Optional[str] = None,
) -> dict:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OpenAI API key is missing. Set OPENAI_API_KEY.")

    safe_width = max(256, int(width))
    safe_height = max(256, int(height))
    size = resolve_openai_image_size(model_name, safe_width, safe_height)

    client = OpenAI(api_key=api_key)
    params: dict = {
        "model": model_name,
        "prompt": prompt,
        "size": size,
        "n": 1,
        "user": project_key or None,
    }
    if quality:
        params["quality"] = quality
    if transparent_background is True:
        params["background"] = "transparent"
    elif transparent_background is False:
        params["background"] = "opaque"

    response = client.images.generate(**params)
    data_item = response.data[0] if response.data else None
    b64 = getattr(data_item, "b64_json", None) if data_item else None
    if not b64 and isinstance(data_item, dict):
        b64 = data_item.get("b64_json")
    if not b64:
        raise ValueError("OpenAI image generation returned no image data.")
    data_bytes = base64.b64decode(b64)
    output_path = save_bytes_to_dir(data_bytes, filename, output_dir)
    return {"filename": output_path.name, "path": str(output_path)}


def generate_openai_image_bytes(
    prompt: str,
    width: int = 1024,
    height: int = 1024,
    quality: str | None = None,
    transparent_background: bool | None = None,
    model_name: str = "gpt-image-1.5",
    project_key: Optional[str] = None,
    reference_image_bytes: Optional[bytes] = None,
) -> bytes:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OpenAI API key is missing. Set OPENAI_API_KEY.")

    safe_width = max(256, int(width))
    safe_height = max(256, int(height))

    registry_entry = IMAGE_MODEL_REGISTRY.get(model_name)
    openai_model = str(registry_entry.get("provider_model", model_name)) if registry_entry else model_name
    size = resolve_openai_image_size(openai_model, safe_width, safe_height)
    if reference_image_bytes is not None and len(reference_image_bytes) > 0:
        if not registry_entry or registry_entry.get("provider") != "openai":
            raise ValueError(
                "Reference image conditioning for image bytes requires an OpenAI GPT Image model "
                "(e.g. gpt-image-1.5 or gpt-image-2)."
            )

    client = OpenAI(api_key=api_key)
    params: dict = {
        "model": openai_model,
        "prompt": prompt,
        "size": size,
        "n": 1,
        "user": project_key or None,
    }
    if quality:
        params["quality"] = quality
    if transparent_background is True:
        params["background"] = "transparent"
    elif transparent_background is False:
        params["background"] = "opaque"

    ref_bytes = reference_image_bytes if reference_image_bytes else None
    if ref_bytes:
        params["image"] = [("reference.png", ref_bytes)]
        if _openai_edit_supports_input_fidelity(openai_model):
            params["input_fidelity"] = "high"
        if params.get("quality") == "hd":
            params["quality"] = "high"
        response = client.images.edit(**params)
    else:
        response = client.images.generate(**params)
    data_item = response.data[0] if response.data else None
    b64 = getattr(data_item, "b64_json", None) if data_item else None
    if not b64 and isinstance(data_item, dict):
        b64 = data_item.get("b64_json")
    if not b64:
        raise ValueError("OpenAI image generation returned no image data.")
    return base64.b64decode(b64)


def generate_image(
    prompt: str,
    negative_prompt: str | None = None,
    width: int = 1024,
    height: int = 1024,
    num_images: int = 1,
    seed: int | None = None,
    model: str = "gpt-image-1.5",
    quality: str | None = None,
    style: str | None = None,
    transparent_background: bool | None = None,
    project_key: Optional[str] = None,
    reference_image_filenames: Optional[Iterable[str]] = None,  # filenames in project Images/ or https URLs
    images_output_dir: Optional[Path] = None,
    *,
    max_prompt_chars: Optional[int] = None,
) -> dict:
    if not prompt or len(prompt.strip()) == 0:
        raise ValueError("Prompt is required.")
    eff_max = max_prompt_chars if max_prompt_chars is not None else MAX_PROMPT_LEN
    eff_max = max(256, min(int(eff_max), 32000))
    prompt = _shorten_prompt(prompt, eff_max)
    reference_sources = list(reference_image_filenames or [])

    if model not in IMAGE_MODEL_REGISTRY:
        raise ValueError(f"Unsupported image model: {model}")

    provider = IMAGE_MODEL_REGISTRY[model]["provider"]
    provider_model = IMAGE_MODEL_REGISTRY[model].get("provider_model", model)
    quantity = max(1, min(num_images, MAX_IMAGES))

    if provider == "gemini":
        gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not gemini_key:
            raise ValueError("Gemini API key is missing. Set GEMINI_API_KEY.")
        safe_width = max(144, int(width))
        safe_height = max(144, int(height))
        return _generate_image_gemini(
            prompt=prompt,
            width=safe_width,
            height=safe_height,
            quantity=quantity,
            project_key=project_key,
            reference_image_filenames=reference_sources,
            images_output_dir=images_output_dir,
            transparent_background=transparent_background,
        )

    if provider == "leonardo":
        if reference_sources:
            gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if not gemini_key:
                raise ValueError("Gemini API key is missing. Set GEMINI_API_KEY.")
            safe_width = max(144, int(width))
            safe_height = max(144, int(height))
            return _generate_image_gemini(
                prompt=prompt,
                width=safe_width,
                height=safe_height,
                quantity=quantity,
                project_key=project_key,
                reference_image_filenames=reference_sources,
                images_output_dir=images_output_dir,
                transparent_background=transparent_background,
            )
        return _generate_image_leonardo(
            prompt=prompt,
            width=width,
            height=height,
            quantity=quantity,
            project_key=project_key,
            negative_prompt=negative_prompt,
            seed=seed,
            provider_model=provider_model,
            images_output_dir=images_output_dir,
        )

    if provider == "openai":
        return _generate_image_openai(
            prompt=prompt,
            width=width,
            height=height,
            quantity=quantity,
            project_key=project_key,
            negative_prompt=negative_prompt,
            model_name=provider_model,
            quality=quality,
            style=style,
            transparent_background=transparent_background,
            images_output_dir=images_output_dir,
            reference_image_filenames=reference_sources,
        )

    raise ValueError(f"Unsupported image provider: {provider}")


def resize_image(
    input_filename: str,
    width: int,
    height: int,
    mode: str = "contain",
    output_filename: str | None = None,
    project_key: Optional[str] = None,
) -> dict:
    safe_name = validate_image_filename(input_filename)
    input_path = find_image_path(safe_name, project_key)
    if not input_path:
        raise ValueError("Input image not found.")

    width = _clamp_dimension(width)
    height = _clamp_dimension(height)
    mode = mode if mode in {"contain", "cover", "stretch"} else "contain"

    image = Image.open(input_path)
    if mode == "stretch":
        resized = image.resize((width, height))
    elif mode == "cover":
        resized = ImageOps.fit(image, (width, height))
    else:
        resized = ImageOps.contain(image, (width, height))
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        offset = ((width - resized.width) // 2, (height - resized.height) // 2)
        canvas.paste(resized, offset)
        resized = canvas

    output_name = output_filename or build_image_filename("resize", "png")
    output_name = sanitize_filename(output_name, "png")
    output_dir = input_path.parent.resolve()
    output_path = (output_dir / output_name).resolve()
    if output_dir not in output_path.parents and output_path != output_dir:
        raise ValueError("Invalid output path.")
    resized.save(output_path, format="PNG")
    return {
        "filename": output_name,
        "url": build_image_url(output_name, project_key),
        "path": str(output_path),
    }


def crop_image(
    input_filename: str,
    x: int,
    y: int,
    width: int,
    height: int,
    output_filename: str | None = None,
    project_key: Optional[str] = None,
) -> dict:
    safe_name = validate_image_filename(input_filename)
    input_path = find_image_path(safe_name, project_key)
    if not input_path:
        raise ValueError("Input image not found.")

    image = Image.open(input_path)
    x = max(0, x)
    y = max(0, y)
    width = max(1, width)
    height = max(1, height)
    right = min(image.width, x + width)
    lower = min(image.height, y + height)
    if right <= x or lower <= y:
        raise ValueError("Invalid crop area.")

    cropped = image.crop((x, y, right, lower))
    output_name = output_filename or build_image_filename("crop", "png")
    output_name = sanitize_filename(output_name, "png")
    output_dir = input_path.parent.resolve()
    output_path = (output_dir / output_name).resolve()
    if output_dir not in output_path.parents and output_path != output_dir:
        raise ValueError("Invalid output path.")
    cropped.save(output_path, format="PNG")
    return {
        "filename": output_name,
        "url": build_image_url(output_name, project_key),
        "path": str(output_path),
    }


def convert_image(
    input_filename: str,
    format: str,
    quality: int | None = None,
    output_filename: str | None = None,
    project_key: Optional[str] = None,
) -> dict:
    safe_name = validate_image_filename(input_filename)
    input_path = find_image_path(safe_name, project_key)
    if not input_path:
        raise ValueError("Input image not found.")

    target_format = format.lower()
    if target_format not in {"png", "jpg", "jpeg", "webp"}:
        raise ValueError("Unsupported format.")

    image = Image.open(input_path)
    save_kwargs = {}
    if target_format in {"jpg", "jpeg"}:
        image = image.convert("RGB")
        if quality:
            save_kwargs["quality"] = max(1, min(int(quality), 95))

    ext = "jpg" if target_format == "jpeg" else target_format
    output_name = output_filename or build_image_filename("convert", ext)
    output_name = sanitize_filename(output_name, ext)
    output_dir = input_path.parent.resolve()
    output_path = (output_dir / output_name).resolve()
    if output_dir not in output_path.parents and output_path != output_dir:
        raise ValueError("Invalid output path.")
    image.save(output_path, format=target_format.upper(), **save_kwargs)
    return {
        "filename": output_name,
        "url": build_image_url(output_name, project_key),
        "path": str(output_path),
    }


def _requested_model_from_tool_args(args: dict) -> str:
    """Map chat tool `model` to a registry id. LLMs often send placeholders like \"default\"."""
    raw = args.get("model")
    if raw is None:
        return resolve_image_model("imagegen", None)
    s = str(raw).strip()
    if not s:
        return resolve_image_model("imagegen", None)
    lowered = s.lower()
    if lowered in (
        "default",
        "server",
        "server default",
        "auto",
        "none",
    ):
        return resolve_image_model("imagegen", None)
    return resolve_image_model("imagegen", s)


def run_generate_image_tool(args: dict) -> dict:
    defaults = load_image_defaults()
    prompt = str(args.get("prompt", "")).strip()
    return generate_image(
        prompt=prompt,
        negative_prompt=args.get("negative_prompt"),
        width=int(args.get("width", defaults.get("width", 1024))),
        height=int(args.get("height", defaults.get("height", 1024))),
        num_images=int(args.get("num_images", defaults.get("num_images", 1))),
        seed=args.get("seed"),
        model=_requested_model_from_tool_args(args),
        project_key=str(args.get("project_key", "")).strip() or None,
    )


def run_resize_image_tool(args: dict) -> dict:
    return resize_image(
        input_filename=str(args.get("input_filename", "")).strip(),
        width=int(args.get("width", 1024)),
        height=int(args.get("height", 1024)),
        mode=str(args.get("mode", "contain")).strip(),
        output_filename=args.get("output_filename"),
        project_key=str(args.get("project_key", "")).strip() or None,
    )


def run_crop_image_tool(args: dict) -> dict:
    return crop_image(
        input_filename=str(args.get("input_filename", "")).strip(),
        x=int(args.get("x", 0)),
        y=int(args.get("y", 0)),
        width=int(args.get("width", 1)),
        height=int(args.get("height", 1)),
        output_filename=args.get("output_filename"),
        project_key=str(args.get("project_key", "")).strip() or None,
    )


def run_convert_image_tool(args: dict) -> dict:
    return convert_image(
        input_filename=str(args.get("input_filename", "")).strip(),
        format=str(args.get("format", "")).strip(),
        quality=args.get("quality"),
        output_filename=args.get("output_filename"),
        project_key=str(args.get("project_key", "")).strip() or None,
    )


def remove_background(
    input_filename: str,
    input_url: str | None = None,
    output_filename: str | None = None,
    project_key: Optional[str] = None,
    model: str | None = None,
    alpha_matting: bool | None = None,
    alpha_matting_foreground_threshold: int | None = None,
    alpha_matting_background_threshold: int | None = None,
    *,
    input_ui_nested_rel: str | None = None,
) -> dict:
    input_bytes: bytes | None = None
    input_name: str = "input.png"
    output_base_dir: Path | None = None
    nested = (input_ui_nested_rel or "").strip()
    if nested:
        pk = (project_key or "").strip()
        if not pk:
            raise ValueError("project_key is required for nested UI paths.")
        input_path = resolve_ui_canvas_nested_file(pk, nested.replace("\\", "/"))
        if not input_path.exists() or not input_path.is_file():
            raise ValueError("Input image not found.")
        input_bytes = input_path.read_bytes()
        input_name = input_path.name
        output_base_dir = input_path.parent
    else:
        safe_name = validate_image_filename(input_filename)
        input_path = find_image_path(safe_name, project_key)
        if input_path:
            input_bytes = input_path.read_bytes()
            input_name = input_path.name
            output_base_dir = input_path.parent
        else:
            source_url = (input_url or "").strip()
            if not source_url:
                raise ValueError("Input image not found.")
            try:
                response = requests.get(source_url, timeout=60)
                response.raise_for_status()
                input_bytes = response.content
                path_part = source_url.split("?", 1)[0].rstrip("/")
                url_name = path_part.rsplit("/", 1)[-1]
                if url_name:
                    input_name = url_name
            except Exception as exc:
                raise ValueError(f"Input image not found. URL fetch failed: {exc}") from exc
    technique = (os.getenv("BKGROMOVALTECH") or "rembg").strip().lower()

    output_name = output_filename or build_image_filename("nobg", "png")
    output_name = sanitize_filename(output_name, "png")

    if technique in {"rembg", "open", "opensource"}:
        rembg_remove, new_session = _load_rembg()
        if rembg_remove is None:
            raise ValueError("rembg is not installed. Install it or switch BKGROMOVALTECH to ClipDrop.")
        assert input_bytes is not None
        try:
            session = None
            if model and new_session is not None:
                session = new_session(model_name=model)
            def _clamp_threshold(value: int | None, default: int) -> int:
                if value is None:
                    return default
                return max(0, min(255, int(value)))

            output_bytes = rembg_remove(
                input_bytes,
                session=session,
                alpha_matting=bool(alpha_matting) if alpha_matting is not None else False,
                alpha_matting_foreground_threshold=_clamp_threshold(alpha_matting_foreground_threshold, 240),
                alpha_matting_background_threshold=_clamp_threshold(alpha_matting_background_threshold, 10),
            )
        except Exception as exc:
            raise ValueError(f"rembg failed: {exc}") from exc
        output_path = save_bytes_to_file(output_bytes, output_name, project_key, base_dir=output_base_dir)
    else:
        api_key = os.getenv("CLIPDROP_API_KEY")
        if not api_key:
            raise ValueError("CLIPDROP_API_KEY is missing.")
        assert input_bytes is not None
        response = requests.post(
            "https://clipdrop-api.co/remove-background/v1",
            files={"image_file": (input_name, input_bytes)},
            headers={"x-api-key": api_key},
            timeout=120,
        )

        if not response.ok:
            try:
                error_payload = response.json()
            except ValueError:
                error_payload = response.text
            raise ValueError(f"Clipdrop request failed: {error_payload}")
        output_path = save_bytes_to_file(response.content, output_name, project_key, base_dir=output_base_dir)
    pk_out = (project_key or "").strip()
    if nested and pk_out:
        try:
            rel_out = output_path.resolve().relative_to(get_ui_canvas_images_dir(pk_out).resolve()).as_posix()
            out_url = build_ui_canvas_nested_url(rel_out, pk_out)
        except ValueError:
            out_url = build_image_url(output_name, project_key)
    else:
        out_url = build_image_url(output_name, project_key)
    return {
        "filename": output_name,
        "url": out_url,
        "path": str(output_path),
    }
