import json
from pathlib import Path

import pytest


@pytest.fixture
def missions_sample() -> dict:
    path = Path(__file__).parent / "fixtures" / "missions_sample.json"
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture
def dialogues_sample() -> dict:
    path = Path(__file__).parent / "fixtures" / "dialogues_sample.json"
    return json.loads(path.read_text(encoding="utf-8"))
