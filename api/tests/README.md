# API tests

This folder holds all **pytest** suites for the FastAPI `api` package. Each subfolder is a different kind of test; run the whole tree with `python -m pytest` from `api/`, or run one kind only (see [Run commands](#run-commands)).

---

## Unit tests — `tests/unit/`

**What they do:** Exercise **small pieces of code in isolation** (pure functions, validation helpers, router logic where dependencies are mocked or not needed). Nothing starts the real HTTP server and nothing sends real network requests.

**When to run:** After refactors or logic changes; they are the **fastest** feedback.

**How to run only this suite:**

```bash
cd api
python -m pytest tests/unit
```

---

## HTTP tests — `tests/http/`

**What they do:** Call the **FastAPI app in-process** using Starlette’s **`TestClient`** (real ASGI request/response cycle, no TCP port). Routes, middleware, and dependency injection behave like production, but the process is the test runner—not a separate server.

**When to run:** After changing routes, auth, or anything that depends on the full app wiring.

**How to run only this suite:**

```bash
cd api
python -m pytest tests/http
```

---

## Integration tests — `tests/integration/`

**What they do:** **Reserved.** Intended for tests that talk to **real external services** (databases, third-party APIs). Not used by the default CI suite yet; when added, they should be gated (env vars, pytest markers) so local/CI runs stay reliable.

**How to run:** (none by default) — if tests appear here later, run them explicitly, e.g. `python -m pytest tests/integration` or as documented with those tests.

---

## Prerequisites

Install **both** `requirements.txt` and `requirements-dev.txt`. HTTP tests import the full FastAPI app and need the same packages as production, not only dev tools.

```bash
cd api
python -m pip install -r requirements.txt -r requirements-dev.txt
```

On Windows (PowerShell), use the same commands from the `api` folder.

---

## Run commands

**Recommended:** run from the `api` directory so `pytest.ini` and imports apply.

| Command | What it does |
|--------|----------------|
| `python -m pytest` | Run **all** tests under `tests/` |
| `python -m pytest -q` | Same, **quiet** (less console output) |
| `python -m pytest -v` | **Verbose** — prints each test name as it runs |
| `python -m pytest tests/unit` | **Only unit** tests |
| `python -m pytest tests/http` | **Only HTTP** tests |
| `python -m pytest path/to/test_file.py` | **Single file** |
| `python -m pytest -k "pattern"` | Tests whose **name** contains `pattern` |

From the **repository root** (without `cd api`):

```bash
python -m pip install -r api/requirements.txt -r api/requirements-dev.txt
python -m pytest -c api/pytest.ini api/tests
```

---

## Shared test setup (`conftest.py`)

### Lifespan / MCP

`conftest.py` patches `main.get_tools` to a no-op before `TestClient` runs so app **startup does not load MCP tools** during HTTP tests.

### Auth

The default `client` fixture **overrides `get_current_user`** with a fake user. No Supabase JWT is required for those tests.

### Local `.env`

Importing `main` loads `api/.env` (Windows) or `api/env`. CI should not rely on secrets for the default suite; HTTP tests **mock `get_supabase_client`** where needed.
