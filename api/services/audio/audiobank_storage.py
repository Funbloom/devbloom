"""
Upload audiobank clips to Supabase Storage.
Requires a public bucket named AUDIOBANK_BUCKET (default: audiobank-sounds).
Create it in Supabase Dashboard: Storage > New bucket > name "audiobank-sounds" > Public bucket.
"""
from __future__ import annotations

import os
import re
from typing import Optional
from urllib.parse import quote

AUDIOBANK_BUCKET = os.getenv("AUDIOBANK_BUCKET", "audiobank-sounds")


def sanitize_storage_segment(value: str) -> str:
    cleaned = (value or "").strip().lower()
    cleaned = cleaned.replace("\\", "/")
    parts = [re.sub(r"[^a-z0-9_-]+", "-", part).strip("-") for part in cleaned.split("/")]
    parts = [part for part in parts if part]
    return "/".join(parts) if parts else "uncategorized"


def sanitize_filename(name: str) -> str:
    base = (name or "").strip().replace("\\", "/").split("/")[-1]
    cleaned = re.sub(r"[^a-zA-Z0-9_.-]+", "_", base).lstrip(".")
    return cleaned[:160] if cleaned else "clip.wav"


def _bucket_name() -> str:
    return (AUDIOBANK_BUCKET or "audiobank-sounds").strip() or "audiobank-sounds"


def _normalize_path(path: str) -> str:
    return path.lstrip("/").replace("\\", "/")


def _get_supabase():
    from services.core.rag import get_supabase_client

    return get_supabase_client()


def _encode_storage_path(path: str) -> str:
    normalized = _normalize_path(path)
    return "/".join(quote(part, safe="") for part in normalized.split("/") if part)


def _public_url(bucket: str, path: str) -> Optional[str]:
    normalized = _normalize_path(path)
    encoded_path = _encode_storage_path(normalized)
    try:
        supabase = _get_supabase()
        url = supabase.storage.from_(bucket).get_public_url(normalized)
        if isinstance(url, dict):
            url = url.get("publicUrl") or url.get("publicURL") or url.get("data", {}).get("publicUrl")
        if isinstance(url, str) and url.strip():
            return url.strip()
    except Exception as exc:
        print(f"[audiobank_storage] get_public_url failed: {exc}")
    base = os.getenv("SUPABASE_URL", "").rstrip("/")
    if base and encoded_path:
        return f"{base}/storage/v1/object/public/{bucket}/{encoded_path}"
    return None


def download_audio_from_supabase(path: str) -> Optional[bytes]:
    try:
        supabase = _get_supabase()
    except Exception:
        return None

    bucket = _bucket_name()
    path = _normalize_path(path)
    if not path:
        return None

    try:
        data = supabase.storage.from_(bucket).download(path)
        if isinstance(data, bytes):
            return data
        if isinstance(data, bytearray):
            return bytes(data)
        return None
    except Exception as exc:
        print(f"[audiobank_storage] download failed: {exc}")
        return None


def upload_audio_to_supabase(
    data: bytes,
    path: str,
    content_type: str = "audio/wav",
) -> Optional[str]:
    """Upload audio bytes and return public URL, or None on failure."""
    try:
        supabase = _get_supabase()
    except Exception:
        return None

    bucket = _bucket_name()
    path = _normalize_path(path)
    if not path:
        return None

    try:
        supabase.storage.from_(bucket).upload(
            path,
            data,
            file_options={"content-type": content_type, "upsert": "true"},
        )
    except Exception as exc:
        print(f"[audiobank_storage] upload failed: {exc}")
        return None

    return _public_url(bucket, path)


def delete_audio_from_supabase(path: str) -> bool:
    try:
        supabase = _get_supabase()
    except Exception:
        return False

    bucket = _bucket_name()
    path = _normalize_path(path)
    if not path:
        return False

    try:
        supabase.storage.from_(bucket).remove([path])
        return True
    except Exception as exc:
        print(f"[audiobank_storage] delete failed: {exc}")
        return False


def move_audio_in_supabase(old_path: str, new_path: str, content_type: str) -> Optional[str]:
    """Move object within bucket; returns new public URL or None."""
    old_path = _normalize_path(old_path)
    new_path = _normalize_path(new_path)
    if not old_path or not new_path or old_path == new_path:
        return _public_url(_bucket_name(), old_path) if old_path else None

    try:
        supabase = _get_supabase()
    except Exception:
        return None

    bucket = _bucket_name()
    try:
        supabase.storage.from_(bucket).move(old_path, new_path)
        return _public_url(bucket, new_path)
    except Exception:
        pass

    try:
        downloaded = supabase.storage.from_(bucket).download(old_path)
        if not downloaded:
            return None
        supabase.storage.from_(bucket).upload(
            new_path,
            downloaded,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        supabase.storage.from_(bucket).remove([old_path])
        return _public_url(bucket, new_path)
    except Exception as exc:
        print(f"[audiobank_storage] move failed: {exc}")
        return None
