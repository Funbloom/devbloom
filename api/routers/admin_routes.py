"""Admin-only API routes."""

from fastapi import APIRouter, Depends, HTTPException

from core.auth import require_admin
from services.core.auth_users import list_users_for_admin

admin_router = APIRouter()


@admin_router.get("/users")
def list_users(admin: dict = Depends(require_admin)) -> list:
    """List all users (admin only). Uses Supabase Auth Admin API."""
    try:
        return list_users_for_admin(admin)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to list users: {exc}") from exc
