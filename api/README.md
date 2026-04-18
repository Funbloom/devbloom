# API (FastAPI)

Python service for chat, RAG, image tools, and game integrations.

---

## Tests

Install dependencies, then run pytest **from the `api` directory** so `pytest.ini` and imports resolve.

```bash
cd api
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest
```

| Command | What it does |
|--------|----------------|
| `python -m pytest` | Run the **full** suite (`unit` + `http` + any others under `tests/`) |
| `python -m pytest -q` | Same run, **minimal** output |
| `python -m pytest tests/unit` | **Unit tests only** — fast, no HTTP client |
| `python -m pytest tests/http` | **HTTP tests only** — FastAPI via `TestClient` |

From the **repository root**:

```bash
python -m pip install -r api/requirements.txt -r api/requirements-dev.txt
python -m pytest -c api/pytest.ini api/tests
```

**What each test type is for:** see [`tests/README.md`](tests/README.md) (unit vs HTTP vs integration, and shared `conftest` behavior).

---

## Run the API server

```bash
cd api
python -m pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Configure keys via `api/.env` or your environment for local development.

---

## Test layout (quick reference)

| Path | What it is |
|------|------------|
| `tests/unit/` | Isolated logic — **no** `TestClient`, **no** real HTTP server |
| `tests/http/` | Full app in-process — **Starlette `TestClient`**, ASGI stack |
| `tests/integration/` | Placeholder for future real-service tests |
| `pytest.ini` | Pytest config (`testpaths`, `pythonpath`) |

Details: [`tests/README.md`](tests/README.md).
