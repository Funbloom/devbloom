# Local Agent

Local-only FastAPI service for reading/writing project files on the developer machine.

## What it does
- Reads/writes JSON files under an approved project root.
- Reads/writes binary files (e.g., images) under an approved root.
- Lists directories under an approved root.
- Enforces localhost-only access and path traversal protection.

## Requirements
- Python 3.10+

## Install (Windows / PC)
```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r local_agent\requirements.txt
```

## Install (macOS)
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r local_agent/requirements.txt
```

## Run (Windows / PC)
```powershell
python -m uvicorn local_agent.main:app --host 127.0.0.1 --port 8765
```

## Run (macOS)
```bash
python3 -m uvicorn local_agent.main:app --host 127.0.0.1 --port 8765
```

## Frontend config (optional)
You can override the base URL with:
```
NEXT_PUBLIC_LOCAL_AGENT_URL=http://127.0.0.1:8765
```

## Approval flow
The UI approves a project root by calling:
```
POST /projects/approve
```
Approved roots are stored in:
```
local_agent/.local_agent/approved_roots.json
```

## Health check
```
GET /health
```

