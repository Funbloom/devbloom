import os
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from openai import OpenAI
from pydantic import BaseModel, Field

from local_settings import load_image_generated, save_image_generated


tools_router = APIRouter()


class ImagePromptRequest(BaseModel):
  prompt: str = Field(min_length=1, max_length=1000)


class ImageGeneratedPutBody(BaseModel):
    project_key: str = Field(min_length=1)
    images: list[dict[str, Any]] = Field(default_factory=list)


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
def get_image_generated_route(project_key: str) -> dict:
    """Load persisted image list for the given project_key from .local_data/{project_key}/image_generated.json."""
    try:
        return load_image_generated(project_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@tools_router.put("/tools/image_generated")
def put_image_generated_route(body: ImageGeneratedPutBody) -> dict:
    """Persist image list for the given project_key to .local_data/{project_key}/image_generated.json."""
    try:
        return save_image_generated(body.project_key, body.images)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

