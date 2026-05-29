"""OpenAI call to summarize chat messages."""

import os
from typing import List

from fastapi import HTTPException
from openai import OpenAI

from core.code_settings import CONDENSE_MODEL
from core.chat_schemas import CondensePayload
from core.app_paths import MAX_HISTORY_ITEMS


def condense_messages(body: CondensePayload) -> dict:
    """Summarize the conversation into one paragraph. Returns { summary }."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Missing OPENAI_API_KEY")
    messages = body.messages[-MAX_HISTORY_ITEMS:]
    if not messages:
        return {"summary": "(No messages to condense.)"}
    client = OpenAI(api_key=api_key)
    system = (
        "You are summarizing a conversation. Extract only valuable information: "
        "decisions, action items, key facts, conclusions, and anything the user or assistant committed to. "
        "Output a single concise paragraph. Use clear, neutral language. Do not use bullet points unless necessary."
    )
    chat_messages: List[dict[str, str]] = [{"role": "system", "content": system}]
    for m in messages:
        chat_messages.append({"role": m.role, "content": (m.content or "").strip() or "(empty)"})
    try:
        resp = client.chat.completions.create(
            model=CONDENSE_MODEL,
            messages=chat_messages,
            stream=False,
        )
        content = (resp.choices[0].message.content or "").strip()
        return {"summary": content or "(No summary generated.)"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Condense failed: {exc}") from exc
