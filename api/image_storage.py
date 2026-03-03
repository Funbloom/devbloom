"""
Upload storyboard images to Supabase Storage so they are available from any machine.
Requires a public bucket named STORYBOARD_IMAGES_BUCKET (default: storyboard-images).
Create it in Supabase Dashboard: Storage > New bucket > name "storyboard-images" > Public bucket.
"""
import os
from typing import Optional

STORYBOARD_IMAGES_BUCKET = os.getenv("STORYBOARD_IMAGES_BUCKET", "storyboard-images")


def upload_image_to_supabase(
    data: bytes,
    path: str,
    content_type: str = "image/png",
) -> Optional[str]:
    """
    Upload image bytes to Supabase Storage and return the public URL, or None if upload is disabled/fails.
    path: e.g. "tiles/<tile_id>/<filename>"
    """
    try:
        from rag import get_supabase_client
        supabase = get_supabase_client()
    except Exception:
        return None
    bucket = STORYBOARD_IMAGES_BUCKET.strip() or "storyboard-images"
    path = path.lstrip("/").replace("\\", "/")
    if not path:
        return None
    try:
        supabase.storage.from_(bucket).upload(
            path,
            data,
            file_options={"content-type": content_type, "upsert": "true"},
        )
    except Exception as exc:
        print(f"[image_storage] upload failed: {exc}")
        return None
    try:
        public_url = supabase.storage.from_(bucket).get_public_url(path)
        return public_url
    except Exception as exc:
        print(f"[image_storage] get_public_url failed: {exc}")
        # Build URL manually: SUPABASE_URL is like https://xxx.supabase.co
        base = os.getenv("SUPABASE_URL", "").rstrip("/")
        if base:
            return f"{base}/storage/v1/object/public/{bucket}/{path}"
        return None
