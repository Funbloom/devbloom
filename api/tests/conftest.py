"""Shared fixtures for API tests.

Lifespan calls ``main.get_tools()``; patch it so TestClient startup does not hit MCP/network.
"""

import pytest
from starlette.testclient import TestClient


@pytest.fixture
def app(monkeypatch: pytest.MonkeyPatch):
    import main

    monkeypatch.setattr(main, "get_tools", lambda: [])
    return main.app


@pytest.fixture
def client(app):
    from core.auth import get_current_user

    def fake_user():
        return {"id": "test-user-1", "email": "test@example.com", "is_admin": False}

    app.dependency_overrides[get_current_user] = fake_user
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def admin_client(app):
    from core.auth import get_current_user

    def fake_admin():
        return {"id": "admin-1", "email": "admin@example.com", "is_admin": True}

    app.dependency_overrides[get_current_user] = fake_admin
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
