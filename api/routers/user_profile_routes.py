from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.auth import get_current_user
from services.user_profile import get_user_profile, set_user_current_project

user_profile_router = APIRouter()


class UserProfileUpdateBody(BaseModel):
    current_project_key: Optional[str] = Field(
        default=None,
        description="Active project key, or null/omit to clear.",
    )


@user_profile_router.get("/users/me/profile")
def get_my_profile(user: dict = Depends(get_current_user)) -> dict:
    """Current user's saved preferences (e.g. last selected project)."""
    return get_user_profile(user["id"])


@user_profile_router.put("/users/me/profile")
def put_my_profile(body: UserProfileUpdateBody, user: dict = Depends(get_current_user)) -> dict:
    """Save current project selection for this user."""
    try:
        return set_user_current_project(user["id"], body.current_project_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
