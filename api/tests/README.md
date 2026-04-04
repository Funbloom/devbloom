# API tests

Layout:

- `unit/` — pure functions, no `TestClient` (fast).
- `http/` — ASGI tests via Starlette `TestClient`; auth uses `dependency_overrides` in `conftest.py`.
- `integration/` — reserved for real services (gate with env/marker when added).

## Run

From the `api` directory (so imports resolve and optional `api/.env` applies):

```bash
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

`http/` tests import the full FastAPI app; they need **all** runtime dependencies from `requirements.txt`, not only `requirements-dev.txt`.

From the repository root:

```bash
pip install -r api/requirements.txt -r api/requirements-dev.txt
pytest -c api/pytest.ini api/tests
```

## Lifespan / MCP

`conftest.py` patches `main.get_tools` to a no-op before `TestClient` runs so startup does not load MCP tools.

## Auth

Default `client` fixture overrides `get_current_user` with a fake user. No Supabase JWT is required for those tests.

## Local `.env`

Importing `main` loads `api/.env` (Windows) or `api/env`. CI should not rely on secrets for the default suite; HTTP tests mock `get_supabase_client` where needed.
