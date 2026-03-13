from typing import Optional, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from local_settings import (
    load_image_defaults,
    save_image_defaults,
    load_theme_settings,
    save_theme_settings,
)


settings_router = APIRouter()


class ImageDefaults(BaseModel):
    num_images: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    style: Optional[str] = None
    location: Optional[Literal["local", "cloud"]] = None


class ThemeSettings(BaseModel):
    theme: Literal["original", "ocean", "forest"] = Field(default="ocean")


@settings_router.get("/settings/image_defaults")
def get_image_defaults() -> dict:
    return load_image_defaults()


@settings_router.put("/settings/image_defaults")
def update_image_defaults(body: ImageDefaults) -> dict:
    payload = body.model_dump(exclude_none=True)
    if "num_images" in payload:
        payload["num_images"] = max(1, min(int(payload["num_images"]), 4))
    if "width" in payload:
        payload["width"] = int(payload["width"])
    if "height" in payload:
        payload["height"] = int(payload["height"])
    if "style" in payload:
        payload["style"] = str(payload["style"]).strip()
    if "location" in payload:
        loc = str(payload["location"]).lower()
        payload["location"] = "cloud" if loc == "cloud" else "local"
    return save_image_defaults(payload)


@settings_router.get("/settings/ui_theme")
def get_ui_theme() -> dict:
    return load_theme_settings()


@settings_router.put("/settings/ui_theme")
def update_ui_theme(body: ThemeSettings) -> dict:
    # Validation is handled by pydantic Literal; just persist.
    return save_theme_settings(body.model_dump())

