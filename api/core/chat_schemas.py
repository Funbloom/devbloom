"""Pydantic models for chat, RAG, and on-disk history."""

from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from core.code_settings import GPT_MODEL_DEFAULT


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant|system)$")
    content: str


class RagOptions(BaseModel):
    top_k: int = Field(default=6, ge=1, le=20)
    source_id: Optional[UUID] = None
    agent_id: Optional[str] = None
    agent_ids: Optional[List[str]] = None
    scope: Literal["generic", "project", "hybrid"] = "hybrid"
    project_key: Optional[str] = None


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(default_factory=list)
    message: Optional[str] = None
    agent: Optional[str] = "creative_director"
    model: Optional[str] = GPT_MODEL_DEFAULT
    rag: Optional[RagOptions] = None
    debug_prompts: Optional[bool] = False


class HistoryMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant|system)$")
    content: str


class HistoryPayload(BaseModel):
    messages: List[HistoryMessage] = Field(default_factory=list)


class CondensePayload(BaseModel):
    messages: List[HistoryMessage] = Field(default_factory=list)
