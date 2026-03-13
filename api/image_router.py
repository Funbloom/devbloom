import mimetypes

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from image_tool import (
    convert_image,
    crop_image,
    generate_image,
    get_images_dir,
    resize_image,
    safe_resolve_path,
    validate_image_filename,
)
from storyboard import list_styles

image_router = APIRouter()

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


class GenerateImageRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    negative_prompt: str | None = None
    width: int = 1024
    height: int = 1024
    num_images: int = 1
    seed: int | None = None
    model: str | None = None
    project_key: str | None = None


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
def generate_character_image_route(body: GenerateCharacterImageRequest) -> dict:
    """Assemble character prompt on the server and generate image(s). Returns images + style_name if a style was used."""
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
            pass
    try:
        prompt = _build_character_prompt(role, physical, age, outfit, style_prompt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        result = generate_image(
            prompt=prompt,
            negative_prompt=(body.negative_prompt or "").strip() or None,
        )
        out: dict = dict(result)
        out["prompt"] = prompt
        if style_name:
            out["style_name"] = style_name
        return out
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@image_router.post("/tools/generate_image")
def generate_image_route(body: GenerateImageRequest) -> dict:
    try:
        return generate_image(
            prompt=body.prompt,
            negative_prompt=body.negative_prompt,
            width=body.width,
            height=body.height,
            num_images=body.num_images,
            seed=body.seed,
            model=body.model or "gemini-image-2",
            project_key=body.project_key,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@image_router.post("/tools/resize_image")
def resize_image_route(body: ResizeImageRequest) -> dict:
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
def crop_image_route(body: CropImageRequest) -> dict:
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
def convert_image_route(body: ConvertImageRequest) -> dict:
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


@image_router.get("/images/{filename}")
def get_image(filename: str, project_key: str | None = None) -> FileResponse:
    """
    Serve a generated image. Images are stored locally on the API server:
    - With project_key: <project_local_path>/Images/<filename>
      (project path is set in Admin > Project Config, stored in .local_data/project_paths.json)
    - Without project_key: default project's Images/ or ./output/images (relative to API cwd)
    """
    print(f"[GET /images] request: filename={filename!r} project_key={project_key!r}")
    try:
        safe_name = validate_image_filename(filename)
        # Try requested project_key first
        images_dir = get_images_dir(project_key)
        path = safe_resolve_path(safe_name, project_key)
        exists = path.exists()
        print(f"[GET /images] images_dir={images_dir} path={path} exists={exists}")
        if not exists and project_key:
            # Fallback: try default/output location (e.g. when project path not set on this machine)
            path_fallback = safe_resolve_path(safe_name, None)
            if path_fallback.exists():
                path = path_fallback
                exists = True
                print(f"[GET /images] fallback path={path} exists=True")
        if not exists:
            raise HTTPException(
                status_code=404,
                detail=f"Image not found. Looked in {images_dir}. Images are stored locally when generated; ensure the API runs on the same machine or that project paths match.",
            )
        media_type, _ = mimetypes.guess_type(path.name)
        return FileResponse(path, media_type=media_type or "application/octet-stream", filename=path.name)
    except HTTPException:
        raise
    except ValueError as exc:
        print(f"[GET /images] ValueError: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        print(f"[GET /images] unexpected error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to read image.") from exc
