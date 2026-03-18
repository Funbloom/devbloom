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
