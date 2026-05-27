from unittest.mock import MagicMock

from games.pocket_voyager.narrative.improve import improve_script_texts


class _FakeMessage:
    def __init__(self, content: str):
        self.content = content


class _FakeChoice:
    def __init__(self, content: str):
        self.message = _FakeMessage(content)


class _FakeResponse:
    def __init__(self, content: str):
        self.choices = [_FakeChoice(content)]


class _FakeCompletions:
    def create(self, **_kwargs):
        return _FakeResponse(
            '{"000_DOG_INTRO_01": "Hello, traveler!", "000_DOG_INTRO_02": "Let us go."}'
        )


class _FakeClient:
    def __init__(self):
        self.chat = MagicMock()
        self.chat.completions = _FakeCompletions()


def test_improve_preserves_ids(dialogues_sample):
    result = improve_script_texts(
        dialogues_sample["clips"],
        ["000_DOG_INTRO_01", "000_DOG_INTRO_02"],
        "Make it funnier",
        client_factory=lambda: _FakeClient(),
        model="gpt-5-mini",
    )
    assert result["000_DOG_INTRO_01"] == "Hello, traveler!"
    assert result["000_DOG_INTRO_02"] == "Let us go."


def test_improve_empty_selection(dialogues_sample):
    assert (
        improve_script_texts(
            dialogues_sample["clips"],
            [],
            client_factory=lambda: _FakeClient(),
            model="gpt-5-mini",
        )
        == {}
    )
