"""Chat history, condense, and SSE stream."""

import os
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openai import OpenAI

from core.auth import get_current_user
from core.chat_schemas import ChatRequest, CondensePayload, HistoryPayload
from core.sse_utils import sse_event
from services.chat_condense import condense_messages
from services.chat_history import clear_history, read_history_messages, save_history
from services.chat_stream import chat_stream_generator

chat_router = APIRouter()


@chat_router.get("/chat/history/{agent_id}")
def get_chat_history(
    agent_id: str,
    user: dict = Depends(get_current_user),
    project_key: Optional[str] = None,
) -> dict:
    try:
        messages = read_history_messages(agent_id, user, project_key)
        return {"messages": messages}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read history: {exc}") from exc


@chat_router.post("/chat/history/{agent_id}")
def save_chat_history(
    agent_id: str,
    body: HistoryPayload,
    user: dict = Depends(get_current_user),
    project_key: Optional[str] = None,
) -> dict:
    try:
        saved, count = save_history(agent_id, user, project_key, body)
        return {"saved": saved, "count": count}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to write history: {exc}") from exc


@chat_router.delete("/chat/history/{agent_id}")
def clear_chat_history(
    agent_id: str,
    user: dict = Depends(get_current_user),
    project_key: Optional[str] = None,
) -> dict:
    try:
        clear_history(agent_id, user, project_key)
        return {"deleted": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete history: {exc}") from exc


@chat_router.post("/chat/condense/{agent_id}")
def condense_chat_history(
    agent_id: str,
    body: CondensePayload,
    user: dict = Depends(get_current_user),
) -> dict:
    _ = agent_id  # reserved for future per-agent condense behavior
    _ = user
    return condense_messages(body)


@chat_router.post("/chat/stream")
async def chat_stream(body: ChatRequest, user: dict = Depends(get_current_user)) -> StreamingResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:

        async def missing_key() -> AsyncGenerator[bytes, None]:
            yield sse_event("error", "Missing OPENAI_API_KEY")
            yield sse_event("done", "")

        return StreamingResponse(missing_key(), media_type="text/event-stream")

    client = OpenAI(api_key=api_key)
    return StreamingResponse(
        chat_stream_generator(body, client, user_id=(user.get("id") or "")),
        media_type="text/event-stream",
    )
