"""Proxy Inworld Voice + TTS (API key stays server-side). See https://docs.inworld.ai/api-reference/introduction"""
import base64
import json
import logging
import os

import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from core.auth import get_current_user

logger = logging.getLogger(__name__)

INWORLD_ORIGIN = "https://api.inworld.ai"
LIST_VOICES_PATH = "/voices/v1/voices"
LIST_VOICES_TTS_PATH = "/tts/v1/voices"
TTS_SYNTH_PATH = "/tts/v1/voice"
TTS_VOICE_PREVIEW_PATH = "/tts/v1/voice:preview"

inworld_router = APIRouter(tags=["inworld"])


def _normalize_inworld_api_key(raw: str) -> str:
    key = raw.strip()
    if len(key) >= 2 and key[0] == key[-1] and key[0] in ('"', "'"):
        key = key[1:-1].strip()
    return key


def _inworld_authorization_header() -> str:
    raw: str = _normalize_inworld_api_key(os.getenv("INWORLD_API_KEY", "") or "")
    if not raw:
        raise HTTPException(
            status_code=503,
            detail="Inworld API is not configured. Set INWORLD_API_KEY in api/env (Basic credential from https://platform.inworld.ai/api-keys ).",
        )
    if raw.lower().startswith("basic "):
        return raw
    return f"Basic {raw}"


def _inworld_request_headers(content_type_json: bool) -> dict[str, str]:
    h: dict[str, str] = {"Authorization": _inworld_authorization_header()}
    if content_type_json:
        h["Content-Type"] = "application/json"
    return h


def _parse_inworld_error_message(response_text: str) -> str:
    try:
        parsed = json.loads(response_text)
        if isinstance(parsed, dict) and parsed.get("message"):
            return str(parsed["message"])
    except Exception:
        pass
    return response_text[:500] if response_text else "Inworld error"


def _raise_inworld_http_error(status_code: int, response_text: str, endpoint: str) -> None:
    msg = _parse_inworld_error_message(response_text)
    logger.warning("Inworld %s error %s: %s", endpoint, status_code, response_text[:2000])
    if status_code in (401, 403) or "invalid authorization" in msg.lower():
        raise HTTPException(
            status_code=401,
            detail=(
                "Inworld rejected the API key. In api/env set INWORLD_API_KEY to the "
                "Basic (Base64) value from Portal → API Keys (not a JWT). "
                f"Upstream: {msg}"
            ),
        )
    if status_code == 503 and "overflow" in msg.lower():
        raise HTTPException(
            status_code=502,
            detail=(
                f"Inworld {endpoint} returned 503 (upstream overflow). This often means a bad or "
                "misformatted INWORLD_API_KEY — use the exact Basic credential from the portal. "
                f"Upstream: {msg}"
            ),
        )
    http_code = status_code if 400 <= status_code <= 599 else 502
    raise HTTPException(status_code=http_code, detail=f"Inworld {endpoint}: {msg}")


def _inworld_get(path: str, params: dict[str, str | int] | None = None) -> requests.Response:
    url = f"{INWORLD_ORIGIN}{path}"
    try:
        return requests.get(
            url,
            headers=_inworld_request_headers(content_type_json=False),
            params=params,
            timeout=60,
        )
    except requests.RequestException as e:
        logger.exception("Inworld GET %s failed", path)
        raise HTTPException(status_code=502, detail=f"Inworld unreachable: {e}") from e


def _list_voices_workspace_api() -> list[dict[str, object]]:
    """GET /voices/v1/voices — workspace voices (paginated)."""
    aggregated: list[dict[str, object]] = []
    page_token = ""
    max_pages = 50
    for page_index in range(max_pages):
        params: dict[str, str | int] | None = None
        if page_token:
            params = {"pageToken": page_token, "pageSize": 500}
        elif page_index > 0:
            params = {"pageSize": 500}

        upstream = _inworld_get(LIST_VOICES_PATH, params=params)
        if not upstream.ok:
            _raise_inworld_http_error(upstream.status_code, upstream.text, LIST_VOICES_PATH)

        try:
            data = upstream.json()
        except ValueError:
            raise HTTPException(status_code=502, detail="Inworld returned non-JSON for list voices.") from None

        batch = data.get("voices") or []
        if not isinstance(batch, list):
            batch = []
        for v in batch:
            if isinstance(v, dict):
                aggregated.append(v)

        next_token_raw = data.get("nextPageToken")
        page_token = (str(next_token_raw).strip()) if next_token_raw else ""
        if not page_token:
            break

    return aggregated


def _list_voices_tts_api() -> list[dict[str, object]]:
    """Fallback: GET /tts/v1/voices (deprecated but reliable for TTS voice ids)."""
    upstream = _inworld_get(LIST_VOICES_TTS_PATH, params=None)
    if not upstream.ok:
        _raise_inworld_http_error(upstream.status_code, upstream.text, LIST_VOICES_TTS_PATH)

    try:
        data = upstream.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Inworld returned non-JSON for TTS voice list.") from None

    batch = data.get("voices") or []
    if not isinstance(batch, list):
        return []

    normalized: list[dict[str, object]] = []
    for v in batch:
        if not isinstance(v, dict):
            continue
        voice_id = v.get("voiceId") or v.get("voice_id")
        if not voice_id:
            continue
        normalized.append(
            {
                "voiceId": voice_id,
                "displayName": v.get("displayName") or voice_id,
                "description": v.get("description"),
                "langCode": v.get("langCode") or v.get("lang_code"),
                "source": v.get("source") or ("IVC" if v.get("isCustom") else ""),
                "languages": v.get("languages"),
                "tags": v.get("tags") or [],
                "categories": v.get("categories") or [],
                "ageGroup": v.get("ageGroup") or v.get("age_group"),
                "gender": v.get("gender"),
                "isCustom": v.get("isCustom"),
            }
        )
    return normalized


@inworld_router.get("/inworld/voices")
def list_inworld_voices(
    _user: dict = Depends(get_current_user),
) -> dict[str, object]:
    """
    Voices for the Inworld workspace. Tries Voices API first; on 503/502 falls back to TTS list voices.
    """
    aggregated: list[dict[str, object]] = []
    try:
        aggregated = _list_voices_workspace_api()
    except HTTPException as workspace_err:
        if workspace_err.status_code not in (502, 503):
            raise
        logger.info("Inworld workspace voice list failed (%s), trying TTS voice list", workspace_err.detail)
        try:
            aggregated = _list_voices_tts_api()
        except HTTPException:
            raise workspace_err from None

    if not aggregated:
        try:
            aggregated = _list_voices_tts_api()
        except HTTPException:
            pass

    return {"voices": aggregated, "count": len(aggregated)}


@inworld_router.get("/inworld/voices/preview")
def get_inworld_voice_preview(
    voice_id: str,
    model_id: str = "inworld-tts-2",
    _user: dict = Depends(get_current_user),
) -> Response:
    """
    Proxies GET /tts/v1/voice:preview — short server-side preview, not metered/billed.
    See https://docs.inworld.ai/api-reference/voiceAPI/voiceservice/get-voice-preview
    """
    voice = voice_id.strip()
    model = model_id.strip() or "inworld-tts-2"
    if not voice:
        raise HTTPException(status_code=400, detail="voice_id is required.")

    upstream = _inworld_get(
        TTS_VOICE_PREVIEW_PATH,
        params={"voice_id": voice, "model_id": model},
    )
    if not upstream.ok:
        _raise_inworld_http_error(upstream.status_code, upstream.text, TTS_VOICE_PREVIEW_PATH)

    try:
        out_json = upstream.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Inworld returned non-JSON for voice preview.") from None

    if not isinstance(out_json, dict):
        raise HTTPException(status_code=502, detail="Inworld voice preview response invalid.")

    b64_audio = out_json.get("audioContent")
    if not isinstance(b64_audio, str) or not b64_audio:
        raise HTTPException(status_code=502, detail="Inworld voice preview missing audioContent.")

    try:
        raw = base64.b64decode(b64_audio)
    except Exception:
        raise HTTPException(status_code=502, detail="Inworld returned invalid base64 audioContent.") from None

    return Response(content=raw, media_type="audio/mpeg")


class InworldTtsRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    voice_id: str = Field(..., min_length=1)
    model_id: str = Field(default="inworld-tts-2", min_length=1)
    delivery_mode: str | None = Field(
        default="BALANCED",
        description="TTS-2 delivery: STABLE, BALANCED, or CREATIVE (see Inworld docs).",
    )
    temperature: float | None = Field(
        default=None,
        gt=0,
        le=2,
        description="TTS 1.5 only; ignored on inworld-tts-2 (use delivery_mode instead).",
    )


@inworld_router.post("/inworld/tts/synthesize")
def synthesize_inworld_tts(
    body: InworldTtsRequest,
    _user: dict = Depends(get_current_user),
) -> Response:
    """
    Calls POST /tts/v1/voice with MP3 output; returns raw audio bytes.
    """
    mode = body.delivery_mode or "BALANCED"
    if mode not in ("STABLE", "BALANCED", "CREATIVE", "DELIVERY_MODE_UNSPECIFIED"):
        mode = "BALANCED"

    payload: dict[str, object] = {
        "text": body.text,
        "voiceId": body.voice_id.strip(),
        "modelId": body.model_id.strip(),
        "audioConfig": {"audioEncoding": "MP3", "bitRate": 128000},
        "applyTextNormalization": "ON",
    }
    if body.model_id.strip() == "inworld-tts-2":
        payload["deliveryMode"] = mode
    else:
        temp = body.temperature if body.temperature is not None else 1.0
        payload["temperature"] = temp
    url = f"{INWORLD_ORIGIN}{TTS_SYNTH_PATH}"
    try:
        upstream = requests.post(
            url,
            headers=_inworld_request_headers(content_type_json=True),
            json=payload,
            timeout=120,
        )
    except requests.RequestException as e:
        logger.exception("Inworld TTS request failed")
        raise HTTPException(status_code=502, detail=f"Inworld unreachable: {e}") from e

    content_type_hdr = upstream.headers.get("Content-Type", "")

    if upstream.ok:
        try:
            out_json = upstream.json()
        except ValueError:
            return Response(content=upstream.content or b"", media_type="audio/mpeg")

        inner = {}
        if isinstance(out_json, dict):
            inner = out_json

        b64_audio = inner.get("audioContent")
        if isinstance(b64_audio, str) and b64_audio:
            try:
                raw = base64.b64decode(b64_audio)
            except Exception:
                raise HTTPException(status_code=502, detail="Inworld returned invalid base64 audioContent.") from None
            return Response(content=raw, media_type="audio/mpeg")

        raise HTTPException(
            status_code=502,
            detail="Inworld response missing audioContent in JSON.",
        )

    detail_text = upstream.text[:2000]
    if "application/json" in content_type_hdr.lower():
        try:
            parsed = upstream.json()
            if isinstance(parsed, dict) and "message" in parsed:
                detail_text = str(parsed.get("message"))
        except ValueError:
            pass

    http_code = upstream.status_code if upstream.status_code else 502
    if http_code < 400 or http_code > 599:
        http_code = 502

    logger.warning("Inworld TTS error %s: %s", http_code, detail_text)
    raise HTTPException(status_code=http_code, detail=detail_text or "Inworld TTS failed")
