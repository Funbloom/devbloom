import json
import os
from typing import Any, Callable

import requests
from openai import OpenAI

from core.code_settings import CHAT_MODEL_DEFAULT, chat_model_provider, resolve_chat_model

NARRATIVE_IMPROVE_MODEL = CHAT_MODEL_DEFAULT


def _default_client_factory() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("Missing OPENAI_API_KEY")
    return OpenAI(api_key=api_key)


def _gemini_chat_text(
    system: str,
    user: str,
    *,
    model: str,
    temperature: float = 0.2,
) -> str:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("Missing GEMINI_API_KEY (or GOOGLE_API_KEY)")

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": f"{system}\n\n{user}"},
                ]
            }
        ],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": 8192,
            "responseMimeType": "application/json",
        },
    }
    response = requests.post(
        url,
        params={"key": api_key},
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=120,
    )
    if not response.ok:
        raise RuntimeError(f"Gemini request failed: {response.status_code} {response.text[:500]}")

    data = response.json()
    parts_out = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    chunks: list[str] = []
    for part in parts_out:
        if isinstance(part, dict) and isinstance(part.get("text"), str):
            chunks.append(part["text"])
    if not chunks:
        raise RuntimeError("Gemini returned no text.")
    return "\n".join(chunks).strip()


def _openai_chat_text(
    system: str,
    user: str,
    *,
    model: str,
    client_factory: Callable[[], OpenAI],
) -> str:
    client = client_factory()
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        stream=False,
    )
    return (resp.choices[0].message.content or "").strip()


def _chat_completion_text(
    system: str,
    user: str,
    *,
    model: str,
    client_factory: Callable[[], OpenAI] | None,
) -> str:
    resolved = resolve_chat_model(model)
    provider = chat_model_provider(resolved)
    if provider == "gemini":
        return _gemini_chat_text(system, user, model=resolved)
    if provider == "openai":
        factory = client_factory or _default_client_factory
        return _openai_chat_text(system, user, model=resolved, client_factory=factory)
    raise ValueError(f"Unsupported chat provider: {provider}")


def improve_script_texts(
    clips: list[dict[str, Any]],
    clip_ids: list[str],
    user_prompt: str = "",
    *,
    client_factory: Callable[[], OpenAI] | None = None,
    model: str = NARRATIVE_IMPROVE_MODEL,
) -> dict[str, str]:
    """Return map clip_id -> improved script_text for selected ids."""
    if not clip_ids:
        return {}

    id_set = {x.strip().lower() for x in clip_ids if str(x).strip()}
    selected: list[dict[str, str]] = []
    for clip in clips:
        if not isinstance(clip, dict):
            continue
        cid = str(clip.get("id") or "").strip()
        if cid.lower() not in id_set:
            continue
        selected.append({"id": cid, "script_text": str(clip.get("script_text") or "")})

    if not selected:
        return {}

    tone = (user_prompt or "").strip()
    system = (
        "You improve short game dialogue lines for Pocket Voyager. "
        "Fix English spelling and grammar. Keep the same meaning, speaker intent, and length. "
        "Do not add stage directions or quotes unless they were in the original. "
        "Return ONLY valid JSON: an object whose keys are clip ids and values are improved script_text strings."
    )
    if tone:
        system += f"\n\nTone guidance from the writer: {tone}"

    user_payload = json.dumps({"lines": selected}, ensure_ascii=False)
    raw = _chat_completion_text(system, user_payload, model=model, client_factory=client_factory)
    if not raw:
        return {row["id"]: row["script_text"] for row in selected}

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            return {row["id"]: row["script_text"] for row in selected}
        parsed = json.loads(raw[start : end + 1])

    if not isinstance(parsed, dict):
        return {row["id"]: row["script_text"] for row in selected}

    result: dict[str, str] = {}
    for row in selected:
        cid = row["id"]
        improved = parsed.get(cid)
        if improved is None:
            for key, value in parsed.items():
                if str(key).strip().lower() == cid.lower():
                    improved = value
                    break
        if isinstance(improved, str) and improved.strip():
            result[cid] = improved.strip()
        else:
            result[cid] = row["script_text"]
    return result
