from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from core.auth import get_current_user
from services.usage import get_provider_usage, get_usage_summary

usage_router = APIRouter()


@usage_router.get("/usage/providers")
def usage_providers(
    period: Literal["month", "year"] = Query(default="month"),
    user: dict = Depends(get_current_user),
) -> dict:
    user_id = (user.get("id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return get_provider_usage(user_id, period)


@usage_router.get("/usage/summary")
def usage_summary(
    period: Literal["month", "year"] = Query(default="month"),
    user: dict = Depends(get_current_user),
) -> dict:
    user_id = (user.get("id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return get_usage_summary(user_id, period)
