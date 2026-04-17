import mimetypes
import logging
import base64
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from core.auth import get_current_user
from core.code_settings import (
    IMAGE_MODEL_REGISTRY,
    UI_CANVAS_POLISH_MAX_PROMPT_LEN,
    resolve_image_model,
)
from services.usage import check_can_generate_images, increment_usage
from services.image_tool import (
    convert_image,
    crop_image,
    find_image_path,
    generate_image,
    get_images_dir,
    get_ui_canvas_images_dir,
    import_uploaded_image,
    delete_ui_canvas_nested_file,
    delete_ui_canvas_export_folder,
    list_ui_canvas_nested_images,
    remove_background,
    resize_image,
    resolve_ui_canvas_nested_file,
    validate_image_filename,
    generate_openai_image_bytes,
)
from services.storyboard import list_styles
from services.ui_breakdown import detect_ui_breakdown, process_ui_breakdown, strip_text_ui_image
from services.ui_canvas_prompt import (
    MAX_UI_STYLE_REFERENCE_IMAGES,
    build_ui_canvas_full_prompt,
)

image_router = APIRouter()
logger = logging.getLogger(__name__)

CHARACTER_PROMPT_SUFFIX = (
    " Full-body game character, standing in a neutral A-pose, on a plain bright green background without shadows."
    "Show the character twice, once in a front view and once in a side view. Clear silhouette, suitable for character sheet reference."
)


class GenerateCharacterImageRequest(BaseModel):
    role: str | None = None
    physical_description: str | None = None
    age: str | None = None
    outfit: str | None = None
    negative_prompt: str | None = None
    style_id: str | None = None
    model: str | None = None
    width: int = 1024
    height: int = 1024
    quality: str | None = None
    style: str | None = None
    transparent_background: bool | None = None
    project_key: str | None = None


class GenerateImageRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    negative_prompt: str | None = None
    width: int = 1024
    height: int = 1024
    num_images: int = 1
    seed: int | None = None
    model: str | None = None
    quality: str | None = None
    style: str | None = None
    transparent_background: bool | None = None
    project_key: str | None = None
    """Filenames in project Images/ or https URLs; passed to Gemini as reference images (wireframe conditioning)."""
    reference_image_filenames: list[str] | None = None


class UiCanvasPolishRequest(BaseModel):
    """UI Builder: wireframe sketch + optional style bank / user snippet / style refs — server builds the full prompt."""

    project_key: str = Field(min_length=1)
    sketch_filename: str = Field(min_length=1)
    sketch_title: str | None = None
    style_id: str | None = None
    extra_user_prompt: str | None = None
    style_reference_filenames: list[str] | None = None
    model: str | None = None
    width: int = 1024
    height: int = 1024
    layout_fidelity: int = Field(
        default=75,
        ge=0,
        le=100,
        description="0=creative layout; 100=match wireframe placement; style refs still drive look.",
    )
    transparent_background: bool = Field(
        default=True,
        description="OpenAI/GPT Image: API background mode. Gemini path ignores; prompt still requests transparency.",
    )


class GenerateImageBytesRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    width: int = Field(default=1024, ge=256, le=2048)
    height: int = Field(default=1024, ge=256, le=2048)
    quality: str | None = None
    transparent_background: bool | None = None
    model: str | None = None
    project_key: str | None = None


class EditImageNanobananaRequest(BaseModel):
    """Edit with a reference image (Gemini / OpenAI per model registry; refs require Gemini path)."""

    changes: str = Field(min_length=1, max_length=4000)
    reference: str = Field(
        min_length=1,
        max_length=4000,
        description="HTTPS URL to the image, or bare filename under project Images/",
    )
    project_key: str | None = None
    width: int = 1024
    height: int = 1024
    model: str | None = Field(
        default=None,
        description="Image model id (same as /tools/generate_image); defaults to gemini-2.5-flash-image.",
    )


class ResizeImageRequest(BaseModel):
    input_filename: str
    width: int
    height: int
    mode: str = "contain"
    output_filename: str | None = None
    project_key: str | None = None


class CropImageRequest(BaseModel):
    input_filename: str
    x: int
    y: int
    width: int
    height: int
    output_filename: str | None = None
    project_key: str | None = None


class ConvertImageRequest(BaseModel):
    input_filename: str
    format: str
    quality: int | None = None
    output_filename: str | None = None
    project_key: str | None = None


class RemoveBackgroundRequest(BaseModel):
    input_filename: str = ""
    output_filename: str | None = None
    project_key: str | None = None
    model: str | None = None
    alpha_matting: bool | None = None
    alpha_matting_foreground_threshold: int | None = Field(default=None, ge=0, le=255)
    alpha_matting_background_threshold: int | None = Field(default=None, ge=0, le=255)
    input_ui_nested_rel: str | None = Field(
        default=None,
        description="Relative path under Gen/Images/UI (e.g. export/widget.png); omit input_filename when using this.",
    )


class ListUiCanvasNestedImagesRequest(BaseModel):
    project_key: str = Field(min_length=1)
    subfolder: str | None = Field(
        default=None,
        description="If set, only list images under Gen/Images/UI/<subfolder>/ (single path segment).",
    )


class DeleteUiCanvasNestedImageRequest(BaseModel):
    project_key: str = Field(min_length=1)
    relative_path: str = Field(min_length=1, description="Path under Gen/Images/UI, e.g. MyExport/widget.png")


class DeleteUiCanvasExportFolderRequest(BaseModel):
    project_key: str = Field(min_length=1)
    subfolder: str = Field(
        min_length=1,
        description="Single top-level folder under Gen/Images/UI to remove with all contents.",
    )


class UiBreakdownDetectRequest(BaseModel):
    project_key: str = Field(min_length=1)
    source_filename: str = Field(min_length=1)
    prefetched_elements: list[dict[str, Any]] = Field(
        min_length=0,
        description="SAM boxes from local_agent POST /ui_breakdown/sam (geometry only).",
    )
    skip_vlm_label: bool = False
    label_temperature: float = Field(default=0.2, ge=0.0, le=1.0)
    label_model: str | None = None


class UiBreakdownStripRequest(BaseModel):
    project_key: str = Field(min_length=1)
    source_filename: str = Field(min_length=1)
    prompt_suffix: str | None = None
    width: int = Field(default=1024, ge=256, le=2048)
    height: int = Field(default=1024, ge=256, le=2048)
    model: str | None = None


class UiBreakdownProcessRequest(BaseModel):
    project_key: str = Field(min_length=1)
    source_filename: str = Field(min_length=1)
    export_folder: str = Field(min_length=1)
    elements: list[dict[str, Any]]
    crop_padding_px: int = Field(default=4, ge=0, le=64)
    background_prompt_suffix: str | None = None
    width: int = Field(default=1024, ge=256, le=2048)
    height: int = Field(default=1024, ge=256, le=2048)
    regen_model: str | None = None
    transparent_background: bool = Field(
        default=True,
        description="When true, background plate uses GPT Image with background=transparent (requires OPENAI_API_KEY). "
        "When false, uses Gemini + reference image (opaque).",
    )
    only_element_id: str | None = Field(
        default=None,
        description="If set, export only this region's widget PNG and skip background.png generation.",
    )


def _build_character_prompt(
    role: str | None,
    physical_description: str | None,
    age: str | None,
    outfit: str | None,
    style_prompt: str | None,
) -> str:
    parts: list[str] = []
    if role and role.strip():
        parts.append(f"Role / Archetype: {role.strip()}")
    if physical_description and physical_description.strip():
        parts.append(f"Physical description: {physical_description.strip()}")
    if age and age.strip():
        parts.append(f"Age: {age.strip()}")
    if outfit and outfit.strip():
        parts.append(f"Outfit: {outfit.strip()}")
    if not parts:
        raise ValueError("At least one of role, physical_description, age, outfit is required.")
    base = "\n".join(parts) + CHARACTER_PROMPT_SUFFIX
    if style_prompt and style_prompt.strip():
        return f"{style_prompt.strip()}\n\n{base}"
    return base


@image_router.post("/tools/generate_character_image")
def generate_character_image_route(
    body: GenerateCharacterImageRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """Assemble character prompt on the server and generate image(s). Returns images + style_name if a style was used."""
    check_can_generate_images(user.get("id") or "", user.get("is_admin") or False, count=1)
    role = (body.role or "").strip() or None
    physical = (body.physical_description or "").strip() or None
    age = (body.age or "").strip() or None
    outfit = (body.outfit or "").strip() or None
    if not any((role, physical, age, outfit)):
        raise HTTPException(
            status_code=400,
            detail="At least one of role, physical_description, age, outfit is required.",
        )
    style_prompt: str | None = None
    style_name: str | None = None
    sid = (body.style_id or "").strip()
    if sid and sid != "__none":
        try:
            styles = list_styles()
            for s in styles:
                if str(s.get("id")) == sid:
                    style_prompt = s.get("prompt") or ""
                    style_name = s.get("name")
                    break
        except Exception:
            logger.exception("Failed to load storyboard styles for character image generation.", extra={"style_id": sid})
        if not style_prompt:
            logger.error("Requested storyboard style was not found during character image generation.", extra={"style_id": sid})
    try:
        prompt = _build_character_prompt(role, physical, age, outfit, style_prompt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        try:
            model_key = resolve_image_model("character", body.model)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        result = generate_image(
            prompt=prompt,
            negative_prompt=(body.negative_prompt or "").strip() or None,
            width=body.width,
            height=body.height,
            num_images=1,
            model=model_key,
            quality=body.quality,
            style=body.style,
            transparent_background=body.transparent_background,
            project_key=(body.project_key or "").strip() or None,
        )
        n = len(result.get("images") or [])
        if n > 0:
            increment_usage(user.get("id") or "", n)
        out: dict = dict(result)
        out["prompt"] = prompt
        if style_name:
            out["style_name"] = style_name
        return out
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@image_router.post("/tools/edit_image_nanobanana")
def edit_image_nanobanana_route(
    body: EditImageNanobananaRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """Apply text edits to an image using Gemini image (Nano Banana) with the given image as reference."""
    check_can_generate_images(user.get("id") or "", user.get("is_admin") or False, count=1)
    changes = (body.changes or "").strip()
    ref = (body.reference or "").strip()
    if not ref:
        raise HTTPException(status_code=400, detail="Reference image URL or filename is required.")
    prompt = (
        "You are given a reference image. Apply the following edits. "
        "Preserve subject identity and overall composition unless the edit requires otherwise.\n\n"
        f"Requested changes:\n{changes}"
    )
    try:
        try:
            model_key = resolve_image_model("imagegen", (body.model or "").strip() or "gemini-2.5-flash-image")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        # Reference conditioning uses Gemini in this codebase; match /tools/generate_image behavior.
        reg = IMAGE_MODEL_REGISTRY.get(model_key, {})
        if reg.get("provider") != "gemini":
            model_key = resolve_image_model("imagegen", "gemini-2.5-flash-image")
        out_dir = None
        r = ref.strip()
        if not (r.startswith("http://") or r.startswith("https://")):
            try:
                pk_edit = (body.project_key or "").strip()
                if pk_edit and ("/" in r or "\\" in r):
                    nested_p = resolve_ui_canvas_nested_file(pk_edit, r.replace("\\", "/"))
                    if nested_p.is_file():
                        out_dir = nested_p.parent
                else:
                    found = find_image_path(validate_image_filename(r), body.project_key)
                    if found:
                        out_dir = found.parent
            except ValueError:
                pass
        result = generate_image(
            prompt=prompt,
            width=body.width,
            height=body.height,
            num_images=1,
            model=model_key,
            project_key=body.project_key,
            reference_image_filenames=[ref],
            images_output_dir=out_dir,
        )
        n = len(result.get("images") or [])
        if n > 0:
            increment_usage(user.get("id") or "", n)
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@image_router.post("/tools/generate_image")
def generate_image_route(
    body: GenerateImageRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    check_can_generate_images(
        user.get("id") or "",
        user.get("is_admin") or False,
        count=body.num_images,
    )
    try:
        try:
            model_key = resolve_image_model("imagegen", body.model)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        refs = [str(r).strip() for r in (body.reference_image_filenames or []) if r and str(r).strip()]
        if refs:
            reg = IMAGE_MODEL_REGISTRY.get(model_key, {})
            if reg.get("provider") != "gemini":
                model_key = resolve_image_model("imagegen", "gemini-2.5-flash-image")
        result = generate_image(
            prompt=body.prompt,
            negative_prompt=body.negative_prompt,
            width=body.width,
            height=body.height,
            num_images=body.num_images,
            seed=body.seed,
            model=model_key,
            quality=body.quality,
            style=body.style,
            transparent_background=body.transparent_background,
            project_key=body.project_key,
            reference_image_filenames=refs or None,
        )
        n = len(result.get("images") or [])
        if n > 0:
            increment_usage(user.get("id") or "", n)
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _resolve_style_bank(style_id: str | None) -> tuple[str | None, str | None]:
    """Return (style prompt, style name) from the storyboard style bank; (None, None) if no id."""
    if not style_id or not str(style_id).strip():
        return None, None
    sid = str(style_id).strip()
    styles = list_styles()
    for s in styles:
        if str(s.get("id", "")).strip() == sid:
            p = (s.get("prompt") or "").strip()
            n = (s.get("name") or "").strip()
            return (p or None, n or None)
    raise HTTPException(status_code=404, detail=f"Style not found: {sid}")


@image_router.post("/tools/ui_canvas_polish")
def ui_canvas_polish_route(
    body: UiCanvasPolishRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Build the UI Canvas polish prompt on the server and run image generation with the sketch (+ optional style refs).
    """
    check_can_generate_images(
        user.get("id") or "",
        user.get("is_admin") or False,
        count=1,
    )
    try:
        sketch_fn = validate_image_filename(body.sketch_filename.strip())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    refs_in: list[str] = []
    for r in (body.style_reference_filenames or [])[:MAX_UI_STYLE_REFERENCE_IMAGES]:
        rs = str(r).strip()
        if not rs:
            continue
        try:
            refs_in.append(validate_image_filename(rs))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    style_prompt, style_name = _resolve_style_bank(body.style_id)
    sketch_title = (body.sketch_title or "").strip() or "UI sketch"

    prompt = build_ui_canvas_full_prompt(
        sketch_title,
        style_bank_prompt=style_prompt,
        extra_user_prompt=body.extra_user_prompt,
        style_reference_filenames=refs_in,
        layout_fidelity=body.layout_fidelity,
    )
    prompt_in_len = len(prompt)

    ref_list = [sketch_fn] + [x for x in refs_in if x != sketch_fn]

    requested_model = None
    try:
        model_key = resolve_image_model("imagegen", body.model)
        requested_model = model_key
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if ref_list:
        reg = IMAGE_MODEL_REGISTRY.get(model_key, {})
        if reg.get("provider") != "gemini":
            model_key = resolve_image_model("imagegen", "gemini-2.5-flash-image")
    logger.info(
        "ui_canvas_polish: requested_model=%s resolved_model=%s sketch=%s style_refs=%d "
        "ref_filenames=%s prompt_chars_in=%d max_prompt_chars=%d extra_user_non_empty=%s",
        requested_model or body.model,
        model_key,
        sketch_fn,
        len(refs_in),
        ref_list,
        prompt_in_len,
        UI_CANVAS_POLISH_MAX_PROMPT_LEN,
        bool((body.extra_user_prompt or "").strip()),
    )
    logger.debug("ui_canvas_polish full prompt (%d chars):\n%s", prompt_in_len, prompt)
    try:
        ui_dir = get_ui_canvas_images_dir(body.project_key.strip())
        result = generate_image(
            prompt=prompt,
            width=body.width,
            height=body.height,
            num_images=1,
            model=model_key,
            project_key=body.project_key.strip(),
            reference_image_filenames=ref_list or None,
            transparent_background=body.transparent_background,
            images_output_dir=ui_dir,
            max_prompt_chars=UI_CANVAS_POLISH_MAX_PROMPT_LEN,
        )
        n = len(result.get("images") or [])
        if n > 0:
            increment_usage(user.get("id") or "", n)
        out = dict(result)
        out["style_name"] = style_name
        return out
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@image_router.post("/tools/ui_breakdown_detect")
def ui_breakdown_detect_route(
    body: UiBreakdownDetectRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """Gemini VLM labels for prefetched SAM boxes (geometry from local_agent POST /ui_breakdown/sam)."""
    check_can_generate_images(
        user.get("id") or "",
        user.get("is_admin") or False,
        count=0,
    )
    try:
        return detect_ui_breakdown(
            body.project_key.strip(),
            body.source_filename.strip(),
            prefetched_elements=list(body.prefetched_elements),
            skip_vlm_label=body.skip_vlm_label,
            label_temperature=body.label_temperature,
            label_model=(body.label_model or "").strip() or None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@image_router.post("/tools/ui_breakdown_strip_text")
def ui_breakdown_strip_text_route(
    body: UiBreakdownStripRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """Remove text from UI image via Gemini image + reference."""
    check_can_generate_images(
        user.get("id") or "",
        user.get("is_admin") or False,
        count=1,
    )
    try:
        out = strip_text_ui_image(
            body.project_key.strip(),
            body.source_filename.strip(),
            prompt_suffix=body.prompt_suffix or "",
            width=body.width,
            height=body.height,
            model=body.model,
        )
        increment_usage(user.get("id") or "", 1)
        return out
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@image_router.post("/tools/ui_breakdown_process")
def ui_breakdown_process_route(
    body: UiBreakdownProcessRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """Crop widgets + regenerate background plate into Gen/Images/UI/<export_folder>/."""
    check_can_generate_images(
        user.get("id") or "",
        user.get("is_admin") or False,
        count=1,
    )
    try:
        out = process_ui_breakdown(
            body.project_key.strip(),
            body.source_filename.strip(),
            body.export_folder.strip(),
            list(body.elements),
            crop_padding_px=body.crop_padding_px,
            background_prompt_suffix=body.background_prompt_suffix or "",
            width=body.width,
            height=body.height,
            regen_model=body.regen_model,
            transparent_background=body.transparent_background,
            only_element_id=(body.only_element_id or "").strip() or None,
        )
        increment_usage(user.get("id") or "", 1)
        return out
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@image_router.post("/tools/import_image")
async def import_image_route(
    file: UploadFile = File(...),
    project_key: str | None = Form(None),
    replace_filename: str | None = Form(None),
    ui_canvas: str | None = Form(None),
    _user: dict = Depends(get_current_user),
) -> dict:
    """Upload an image file and save under project Images/ or Gen/Images/UI/ when ui_canvas is true."""
    data = await file.read()
    try:
        rf = (replace_filename or "").strip() or None
        save_ui = (ui_canvas or "").strip().lower() in ("true", "1", "on", "yes")
        one = import_uploaded_image(
            data,
            file.content_type,
            file.filename,
            project_key,
            replace_filename=rf,
            save_to_ui_canvas=save_ui,
        )
        return {"images": [one]}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@image_router.post("/tools/generate_image_bytes")
def generate_image_bytes_route(
    body: GenerateImageBytesRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    check_can_generate_images(
        user.get("id") or "",
        user.get("is_admin") or False,
        count=1,
    )
    try:
        model_key = body.model or "gpt-image-1.5"
        data = generate_openai_image_bytes(
            prompt=body.prompt,
            width=body.width,
            height=body.height,
            quality=body.quality,
            transparent_background=body.transparent_background,
            model_name=model_key,
            project_key=body.project_key,
        )
        increment_usage(user.get("id") or "", 1)
        return {
            "content_base64": base64.b64encode(data).decode("utf-8"),
            "mime": "image/png",
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@image_router.post("/tools/resize_image")
def resize_image_route(
    body: ResizeImageRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    try:
        return resize_image(
            input_filename=body.input_filename,
            width=body.width,
            height=body.height,
            mode=body.mode,
            output_filename=body.output_filename,
            project_key=body.project_key,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@image_router.post("/tools/crop_image")
def crop_image_route(
    body: CropImageRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    try:
        return crop_image(
            input_filename=body.input_filename,
            x=body.x,
            y=body.y,
            width=body.width,
            height=body.height,
            output_filename=body.output_filename,
            project_key=body.project_key,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@image_router.post("/tools/convert_image")
def convert_image_route(
    body: ConvertImageRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    try:
        return convert_image(
            input_filename=body.input_filename,
            format=body.format,
            quality=body.quality,
            output_filename=body.output_filename,
            project_key=body.project_key,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@image_router.post("/tools/list_ui_canvas_nested_images")
def list_ui_canvas_nested_images_route(
    body: ListUiCanvasNestedImagesRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    """List images under Gen/Images/UI subfolders (breakdown exports, etc.)."""
    try:
        files = list_ui_canvas_nested_images(
            body.project_key.strip(),
            (body.subfolder or "").strip() or None,
        )
        return {"files": files}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@image_router.post("/tools/delete_ui_canvas_nested_image")
def delete_ui_canvas_nested_image_route(
    body: DeleteUiCanvasNestedImageRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    """Delete one file under Gen/Images/UI (nested path only)."""
    try:
        delete_ui_canvas_nested_file(
            body.project_key.strip(),
            body.relative_path.strip().replace("\\", "/"),
        )
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@image_router.post("/tools/delete_ui_canvas_export_folder")
def delete_ui_canvas_export_folder_route(
    body: DeleteUiCanvasExportFolderRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    """Delete Gen/Images/UI/<subfolder>/ and all files inside (breakdown export directory)."""
    try:
        delete_ui_canvas_export_folder(
            body.project_key.strip(),
            body.subfolder.strip(),
        )
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@image_router.post("/tools/remove_background")
def remove_background_route(
    body: RemoveBackgroundRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    try:
        return remove_background(
            input_filename=body.input_filename or "",
            output_filename=body.output_filename,
            project_key=body.project_key,
            model=body.model,
            alpha_matting=body.alpha_matting,
            alpha_matting_foreground_threshold=body.alpha_matting_foreground_threshold,
            alpha_matting_background_threshold=body.alpha_matting_background_threshold,
            input_ui_nested_rel=body.input_ui_nested_rel,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@image_router.get("/images/ui_file")
def get_ui_canvas_nested_image(
    rel: str,
    project_key: str | None = None,
) -> FileResponse:
    """Serve a file under Gen/Images/UI/<rel>, e.g. rel=MyFolder/background.png"""
    if not project_key or not project_key.strip():
        raise HTTPException(status_code=400, detail="project_key is required.")
    try:
        path = resolve_ui_canvas_nested_file(project_key.strip(), rel)
        if not path.exists() or not path.is_file():
            raise HTTPException(status_code=404, detail="File not found.")
        media_type, _ = mimetypes.guess_type(path.name)
        return FileResponse(
            path,
            media_type=media_type or "application/octet-stream",
            filename=path.name,
        )
    except HTTPException:
        raise
    except ValueError as exc:
        logger.warning("Invalid ui_file request.", extra={"rel": rel, "project_key": project_key, "error": str(exc)})
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to read ui nested file.", extra={"rel": rel, "project_key": project_key})
        raise HTTPException(status_code=500, detail="Failed to read file.") from exc


@image_router.get("/images/{filename}")
def get_image(filename: str, project_key: str | None = None) -> FileResponse:
    """
    Serve a generated image. Images are stored locally on the API server:
    - With project_key: <project>/Images/<filename> or <project>/Gen/Images/UI/<filename>
    - Without project_key: default project's Images/ or ./output/images (relative to API cwd)
    """
    print(f"[GET /images] request: filename={filename!r} project_key={project_key!r}")
    try:
        safe_name = validate_image_filename(filename)
        images_dir = get_images_dir(project_key)
        path = find_image_path(safe_name, project_key)
        if not path and project_key:
            path = find_image_path(safe_name, None)
        exists = path is not None and path.exists()
        print(f"[GET /images] images_dir={images_dir} path={path} exists={exists}")
        if not exists or path is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    "Image not found. Looked in "
                    f"{images_dir} and Gen/Images/UI. Images are stored locally when generated; ensure the API runs on the same machine "
                    "or that project paths match."
                ),
            )
        media_type, _ = mimetypes.guess_type(path.name)
        return FileResponse(path, media_type=media_type or "application/octet-stream", filename=path.name)
    except HTTPException:
        raise
    except ValueError as exc:
        logger.warning("Invalid image request.", extra={"filename": filename, "project_key": project_key, "error": str(exc)})
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error while serving generated image.", extra={"filename": filename, "project_key": project_key})
        raise HTTPException(status_code=500, detail="Failed to read image.") from exc
