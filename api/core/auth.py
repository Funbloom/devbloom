"""Auth dependency: JWT verification, domain allowlist, admin check."""
import json
import logging
import os
import time
from typing import Any, Optional

import jwt
import requests
from jwcrypto import jwk

logger = logging.getLogger(__name__)
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# JWT secret from Supabase Dashboard > Project Settings > API > JWT Secret (for HS256 / legacy)
# SUPABASE_URL used for JWKS (ES256/RS256) e.g. https://xxx.supabase.co
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
SUPABASE_URL = (os.getenv("SUPABASE_URL", "") or "").rstrip("/")
# Domains comma-separated, e.g. funbloomstudio.com
# Admin emails comma-separated, e.g. admin@funbloomstudio.com
ALLOWED_EMAIL_DOMAINS: set[str] = set(
    d.strip().lower()
    for d in (os.getenv("ALLOWED_EMAIL_DOMAINS", "") or "").split(",")
    if d.strip()
)
ADMIN_EMAILS: set[str] = set(
    e.strip().lower()
    for e in (os.getenv("ADMIN_EMAILS", "") or "").split(",")
    if e.strip()
)

HTTP_BEARER = HTTPBearer(auto_error=False)

# JWKS cache: {url: (fetched_at, {"keys": [...]})}, TTL 10 min
_JWKS_CACHE: dict[str, tuple[float, Any]] = {}
_JWKS_TTL = 600.0


def _get_jwks() -> dict:
    if not SUPABASE_URL:
        return {}
    url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    now = time.time()
    if url in _JWKS_CACHE:
        fetched_at, data = _JWKS_CACHE[url]
        if now - fetched_at < _JWKS_TTL:
            return data
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        data = r.json()
        _JWKS_CACHE[url] = (now, data)
        return data
    except Exception as e:
        logger.warning("JWKS fetch failed: %s", e)
        return {}


def _get_public_key_for_kid(kid: str) -> Optional[str]:
    """Return PEM of the public key for the given kid, or None."""
    jwks = _get_jwks()
    for key_dict in jwks.get("keys", []):
        if key_dict.get("kid") == kid:
            try:
                k = jwk.JWK.from_json(json.dumps(key_dict))
                return k.export_to_pem().decode("utf-8")
            except Exception as e:
                logger.warning("JWK parse failed for kid %s: %s", kid, e)
                return None
    return None


def _email_domain(email: str) -> str:
    if not email or "@" not in email:
        return ""
    return email.strip().lower().split("@")[-1]


def _is_admin(email: str, user_metadata: Optional[dict]) -> bool:
    email_lower = (email or "").strip().lower()
    # Always treat this specific address as admin so the Admin UI works
    # even without user metadata configured in Supabase.
    if email_lower in ADMIN_EMAILS:
        return True
    if user_metadata and (user_metadata.get("role") == "admin"):
        return True
    return False


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTP_BEARER),
) -> dict:
    """Verify JWT, enforce allowed email domain, return current user with is_admin."""
    if not SUPABASE_JWT_SECRET and not SUPABASE_URL:
        raise HTTPException(
            status_code=500,
            detail="Server auth not configured (set SUPABASE_JWT_SECRET or SUPABASE_URL).",
        )
    has_bearer = bool(credentials and credentials.credentials)
    if not has_bearer:
        print("auth: 401 reason = no Bearer token in request", flush=True)
        logger.info("auth: no Bearer token in request")
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid authorization (Bearer token required).",
        )
    token = credentials.credentials
    header = jwt.get_unverified_header(token)
    alg = (header.get("alg") or "").strip().upper() or "HS256"
    kid = header.get("kid")
    payload = None
    try:
        if alg == "HS256" and SUPABASE_JWT_SECRET:
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                audience="authenticated",
                algorithms=["HS256"],
            )
        elif alg in ("ES256", "RS256") and kid and SUPABASE_URL:
            pem = _get_public_key_for_kid(kid)
            if pem:
                payload = jwt.decode(
                    token,
                    pem,
                    audience="authenticated",
                    algorithms=[alg],
                )
        if payload is None:
            raise jwt.InvalidTokenError("Unsupported alg or missing JWKS key")
    except jwt.ExpiredSignatureError:
        print("auth: 401 reason = token expired", flush=True)
        logger.info("auth: token expired")
        raise HTTPException(status_code=401, detail="Token expired.")
    except jwt.InvalidTokenError as e:
        print("auth: 401 reason = invalid token:", e, flush=True)
        logger.info("auth: invalid token: %s", e)
        raise HTTPException(status_code=401, detail="Invalid token.")

    email = (payload.get("email") or "").strip()
    if not email:
        raise HTTPException(status_code=401, detail="Token missing email.")
    user_id = payload.get("sub") or ""
    user_metadata = payload.get("user_metadata") or {}

    domain = _email_domain(email)
    if ALLOWED_EMAIL_DOMAINS and domain not in ALLOWED_EMAIL_DOMAINS:
        raise HTTPException(
            status_code=403,
            detail=f"Email domain not allowed. Allowed: {', '.join(sorted(ALLOWED_EMAIL_DOMAINS))}.",
        )

    return {
        "id": user_id,
        "email": email,
        "is_admin": _is_admin(email, user_metadata),
    }


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Require current user to be admin; return user or 403."""
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin required.")
    return user
