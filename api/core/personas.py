"""Agent persona JSON files under api/data/personas/."""

import json
from pathlib import Path

from core.chat_helpers import KNOWN_AGENT_IDS

_PERSONAS_DIR = Path(__file__).resolve().parent.parent / "data" / "personas"

AGENT_PERSONA_FILES = {
    "creative_director": _PERSONAS_DIR / "creative_director.json",
    "art_director": _PERSONAS_DIR / "art_director.json",
    "technical_director": _PERSONAS_DIR / "technical_director.json",
    "producer": _PERSONAS_DIR / "producer.json",
}
assert frozenset(AGENT_PERSONA_FILES) == KNOWN_AGENT_IDS, "Persona files must match core.chat_helpers.KNOWN_AGENT_IDS"


def load_persona_text(agent_id: str) -> str:
    path = AGENT_PERSONA_FILES.get(agent_id)
    if not path:
        return ""
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        return json.dumps(data, indent=2, ensure_ascii=False)
    except Exception:
        return ""


def load_persona_description_prompt(agent_id: str) -> str:
    path = AGENT_PERSONA_FILES.get(agent_id)
    if not path:
        return ""
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        return str(data.get("description_prompt", "")).strip()
    except Exception:
        return ""
