"""Code-level settings (non-user configurable)."""

# Chat models
GPT_MODEL_DEFAULT = "gpt-5-mini"
CONDENSE_MODEL = "gpt-4o-mini"
IMAGE_PROMPT_MODEL = "gpt-5-mini"

# RAG / embeddings
EMBEDDING_MODEL = "text-embedding-3-small"
RAG_MAX_TOP_K = 20
RAG_DEFAULT_TOP_K = 12
EMBEDDING_BATCH_SIZE = 50

# Image generation limits
IMAGE_MAX_PROMPT_LEN = 1000

# UI Builder wireframe → polish: full prompt includes legend, layout fidelity, style bank, user extra text,
# and style-ref rules. The default IMAGE_MAX_PROMPT_LEN would truncate before user instructions reach the model.
UI_CANVAS_POLISH_MAX_PROMPT_LEN = 12000
IMAGE_MAX_IMAGES = 1
ALLOWED_IMAGE_DIMENSIONS = {
    672,
    768,
    832,
    864,
    896,
    1024,
    1152,
    1184,
    1248,
    1344,
}

# Image model registry + defaults (code-level)
IMAGE_MODEL_REGISTRY: dict[str, dict[str, str]] = {
    "gemini-2.5-flash-image": {"provider": "gemini"},
    "leonardo-gemini-2.5-flash-image": {
        "provider": "leonardo",
        "provider_model": "gemini-2.5-flash-image",
    },
    "gpt-image-1.5": {"provider": "openai", "provider_model": "gpt-image-1.5"},
    "gpt-image-2": {"provider": "openai", "provider_model": "gpt-image-2"},
}

IMAGE_MODEL_DEFAULTS: dict[str, str] = {
    "imagegen": "gpt-image-1.5",
    "character": "gpt-image-1.5",
    "storyboard": "gpt-image-1.5",
}

# Usage/budget env keys
OPENAI_TOKEN_BUDGET_ENV_BY_PERIOD: dict[str, str] = {
    "month": "OPENAI_TOKEN_BUDGET_MONTH",
    "year": "OPENAI_TOKEN_BUDGET_YEAR",
}
GEMINI_TOKEN_QUOTA_ENV_BY_PERIOD: dict[str, str] = {
    "month": "GEMINI_TOKEN_QUOTA_MONTH",
    "year": "GEMINI_TOKEN_QUOTA_YEAR",
}

# Code defaults (used when env vars are not set).
OPENAI_TOKEN_BUDGET_DEFAULT_BY_PERIOD: dict[str, int] = {
    "month": 1_000_000,
}


def resolve_image_model(feature: str, requested: str | None) -> str:
    if requested:
        if requested not in IMAGE_MODEL_REGISTRY:
            raise ValueError(f"Unsupported image model: {requested}")
        return requested
    fallback = IMAGE_MODEL_DEFAULTS.get(feature)
    if not fallback:
        fallback = IMAGE_MODEL_DEFAULTS.get("imagegen", "gpt-image-1.5")
    return fallback
