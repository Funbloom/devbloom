import os
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from pydantic import BaseModel, Field

from auth import get_current_user
from local_settings import load_image_generated, save_image_generated
from image_tool import safe_resolve_path, validate_image_filename


tools_router = APIRouter()


class ImagePromptRequest(BaseModel):
  prompt: str = Field(min_length=1, max_length=1000)


class ImageGeneratedPutBody(BaseModel):
    project_key: str = Field(min_length=1)
    images: list[dict[str, Any]] = Field(default_factory=list)
    private: bool = False


class ImageToCloudBody(BaseModel):
    project_key: str = Field(min_length=1)
    filename: str = Field(min_length=1)


@tools_router.post("/tools/generate_image_prompt")
def generate_image_prompt(body: ImagePromptRequest) -> dict:
    """Turn a short user prompt into a rich, visual image prompt without style hints."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Missing OPENAI_API_KEY")
    base_prompt = (body.prompt or "").strip()
    if not base_prompt:
        raise HTTPException(status_code=400, detail="prompt is required.")
    client = OpenAI(api_key=api_key)
    system = (
        "You rewrite short user text into a rich, concrete prompt for an image generator. "
        "The original text is a concept. "
        "Infer the meaning of the text and describe the scene with specific subjects, actions, "
        "environment, lighting, and key visual details.\n\n"
        "Important constraints:\n"
        "- Do NOT mention art style, medium, camera settings, or render engines.\n"
        "- Do NOT mention 'style', 'photorealistic', '3D', 'concept art', or similar terms.\n"
        "- Focus only on WHAT is in the scene and HOW it looks in-world.\n"
        "- Output only the final prompt text, no explanations."
    )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": base_prompt},
    ]
    try:
        resp = client.chat.completions.create(
            model="gpt-5-mini",
            messages=messages,
            stream=False,
        )
        text = (resp.choices[0].message.content or "").strip()
        return {"prompt": text or base_prompt}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate image prompt: {exc}") from exc


@tools_router.get("/tools/image_generated")
def get_image_generated_route(
    project_key: str,
    private: bool = False,
    user: dict = Depends(get_current_user),
) -> dict:
    """Load persisted image list. When private=True, data is scoped to the current user."""
    try:
        user_id = user.get("id") if private else None
        return load_image_generated(project_key, user_id=user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@tools_router.put("/tools/image_generated")
def put_image_generated_route(
    body: ImageGeneratedPutBody,
    user: dict = Depends(get_current_user),
) -> dict:
    """Persist image list. When private=True, data is scoped to the current user."""
    try:
        user_id = user.get("id") if body.private else None
        return save_image_generated(body.project_key, body.images, user_id=user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@tools_router.post("/tools/image_to_cloud")
def image_to_cloud_route(body: ImageToCloudBody) -> dict:
    """Upload a locally stored generated image to cloud storage (Supabase) and return its public URL."""
    try:
        safe_name = validate_image_filename(body.filename)
        # Resolve local path for this project's image
        path = safe_resolve_path(safe_name, body.project_key)
        if not path.exists():
            raise HTTPException(status_code=404, detail="Image file not found.")

        data = path.read_bytes()
        import mimetypes

        mime_type, _ = mimetypes.guess_type(path.name)
        content_type = mime_type or "image/png"

        # Lazy import so Supabase is only required when this endpoint is used.
        try:
            from image_storage import upload_image_to_supabase
        except Exception as exc:  # pragma: no cover - import-time failure
            raise HTTPException(status_code=500, detail=f"Cloud storage not configured: {exc}") from exc

        storage_path = f"generated/{body.project_key}/{safe_name}"
        public_url = upload_image_to_supabase(data, storage_path, content_type=content_type)
        if not public_url:
            raise HTTPException(status_code=500, detail="Upload to cloud storage failed.")

        return {"url": public_url}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - unexpected
        raise HTTPException(status_code=500, detail=f"Failed to upload image to cloud: {exc}") from exc
