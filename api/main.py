import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# Load env before any module that reads os.getenv() at import time (e.g. auth.py)
_env_file = ".env" if sys.platform == "win32" else "env"
load_dotenv(Path(__file__).resolve().parent / _env_file)

# Ensure repo root is on sys.path for game plugins.
_repo_root = Path(__file__).resolve().parent.parent
if str(_repo_root) not in sys.path:
    sys.path.append(str(_repo_root))

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from core.auth import get_current_user
from core.llm_tools import get_tools
from routers.admin_routes import admin_router
from routers.chat_routes import chat_router
from routers.games import games_router
from routers.image_router import image_router
from routers.pdf_routes import pdf_router
from routers.projects import projects_router
from routers.rag_routes import rag_router
from routers.storyboard_routes import storyboard_router
from routers.settings import settings_router
from routers.tools import tools_router
from routers.user_profile_routes import user_profile_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: Any):
    try:
        get_tools()
    except Exception:
        logger.exception("Failed to prime MCP tools cache during startup.")
    yield


app = FastAPI(lifespan=lifespan)

_cors_origins_raw = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)
CORS_ORIGINS = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "gamedev-api"}


@app.head("/auth/me")
def auth_me_reachable() -> Response:
    """Login page uses HEAD (no Bearer) to check the API is up; GET /auth/me still requires auth."""
    return Response(status_code=200)


@app.get("/auth/me")
def auth_me(user: dict = Depends(get_current_user)) -> dict:
    """Return current user and role for the frontend (e.g. to show admin tab)."""
    return user


app.include_router(admin_router)
app.include_router(chat_router)
app.include_router(rag_router, dependencies=[Depends(get_current_user)])
app.include_router(projects_router, dependencies=[Depends(get_current_user)])
app.include_router(games_router, dependencies=[Depends(get_current_user)])
app.include_router(storyboard_router)
app.include_router(pdf_router, dependencies=[Depends(get_current_user)])
app.include_router(image_router)
app.include_router(settings_router, dependencies=[Depends(get_current_user)])
app.include_router(user_profile_router)
app.include_router(tools_router, dependencies=[Depends(get_current_user)])