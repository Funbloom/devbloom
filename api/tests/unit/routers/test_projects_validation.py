"""Unit tests for project key rules without importing routers or services.core.rag."""

import pytest
from fastapi import HTTPException

from core.project_key import validate_project_key


def test_validate_project_key_ok():
    assert validate_project_key("my_game") == "my_game"
    assert validate_project_key("  pv_01  ") == "pv_01"


def test_validate_project_key_empty():
    with pytest.raises(HTTPException) as exc:
        validate_project_key("")
    assert exc.value.status_code == 400
    with pytest.raises(HTTPException) as exc:
        validate_project_key("   ")
    assert exc.value.status_code == 400


def test_validate_project_key_invalid_chars():
    with pytest.raises(HTTPException) as exc:
        validate_project_key("Bad Key")
    assert exc.value.status_code == 400
    assert "lowercase" in exc.value.detail
