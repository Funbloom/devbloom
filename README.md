# DevBloom

Multi-agent studio for game developers — chat, image gen, storyboard, audiobank, UI tools, and more.

**Developed by Andy Fire Studio LLC.**

DevBloom runs as **three local services**. Install each once, then start all three whenever you work.

| Service | Folder | Port | What it does |
|---------|--------|------|--------------|
| **API** | [`api/`](api/) | `8000` | Backend (FastAPI, Supabase, OpenAI, storage) |
| **Local agent** | [`local_agent/`](local_agent/) | `8765` | Your PC only — folder picker, file copy, mesh gen, SAM |
| **Web** | [`web/`](web/) | `3000` | Next.js UI in your browser |

Python services share **one virtual environment** at the repo root (`.venv/`). The API and local agent batch files create it for you on first run.

---

## Prerequisites

Install these **before** you start:

- **Git** — clone this repository
- **Python 3.10+** — [python.org/downloads](https://www.python.org/downloads/) (check **Add python.exe to PATH** on Windows)
- **Node.js 18+** — [nodejs.org](https://nodejs.org/) (includes `npm`)

---

## Initial setup (one time)

Do this once after cloning the repo.

### 1. Get the code

```bash
git clone <your-repo-url>
cd devbloom
```

### 2. Configure the API

- Copy the example env file:
  - **Windows:** `copy api\.env.example api\.env`
  - **macOS / Linux:** `cp api/.env.example api/.env`
- Open [`api/.env`](api/.env) and set at minimum:
  - `OPENAI_API_KEY` — required for AI features
  - `SUPABASE_URL` — your Supabase project URL
  - `SUPABASE_SERVICE_ROLE_KEY` — Supabase Dashboard → Project Settings → API
  - `SUPABASE_JWT_SECRET` — same page, **JWT Secret**
  - `ALLOWED_EMAIL_DOMAINS` — e.g. `funbloomstudio.com`
  - `ADMIN_EMAILS` — comma-separated admin addresses

### 3. Configure the web app

- Copy the example env file:
  - **Windows:** `copy web\.env.example web\.env.local`
  - **macOS / Linux:** `cp web/.env.example web/.env.local`
- Open [`web/.env.local`](web/.env.local) and set:
  - `NEXT_PUBLIC_API_URL_BASE=http://localhost:8000`
  - `NEXT_PUBLIC_SUPABASE_URL` — same project as the API
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase **anon / public** key (never the service role key)

### 4. (Optional) Local agent extras

Only needed for **Mesh Gen** or **UI Breakdown (SAM)**. See [`local_agent/README.md`](local_agent/README.md).

- Copy [`local_agent/.env.example`](local_agent/.env.example) to `local_agent/.env` if you use SAM.

### 5. Bootstrap Python (automatic)

You do **not** need to create `.venv` manually. Running [`api/run.bat`](api/run.bat) or [`local_agent/run.bat`](local_agent/run.bat) once will:

- Create `.venv` at the repo root
- Install Python dependencies from [`requirements.txt`](requirements.txt)

---

## Start the three services

Use **three separate terminals** (or three double-clicks on the batch files). Leave each running while you work.

### 1 — API server

**Easiest (Windows):** double-click or run:

→ **[`api/run.bat`](api/run.bat)**

- Creates/uses the shared `.venv` if needed
- Installs Python deps on first run
- Starts the API at **http://127.0.0.1:8000**

<details>
<summary>Manual start (macOS / Linux / any shell)</summary>

```bash
cd api
python -m venv ../.venv
source ../.venv/bin/activate   # Windows: ..\.venv\Scripts\activate
pip install -r ../requirements.txt
uvicorn main:app --reload --port 8000
```

</details>

---

### 2 — Local agent

**Easiest (Windows):** double-click or run:

→ **[`local_agent/run.bat`](local_agent/run.bat)**

- Uses the same root `.venv`
- Starts the agent at **http://127.0.0.1:8765**
- Required for: **Pick / Browse** project folders, **Use In Project**, mesh gen, SAM, image resize to disk

The web header shows a **Local Agent** status dot (green = online).

<details>
<summary>From repo root (PowerShell)</summary>

```powershell
.\runlocalagent.ps1
```

</details>

---

### 3 — Web app

**Easiest (Windows):** double-click or run:

→ **[`web/run.bat`](web/run.bat)**

- Runs `npm install` on first launch if `node_modules` is missing
- Starts the UI at **http://localhost:3000**

<details>
<summary>Manual start</summary>

```bash
cd web
npm install
npm run dev
```

Or from repo root: `.\runweb.ps1` (PowerShell)

</details>

---

## Verify everything works

1. Open **http://localhost:3000** in your browser.
2. Sign in (Google OAuth via Supabase).
3. In the header, check:
   - **API Server** — green dot
   - **Local Agent** — green dot (when running on this PC)
4. Send a chat message or open a studio tool (e.g. **Studio → Image → Image Gen**).

---

## Quick reference

| Action | Command / file |
|--------|----------------|
| Start API | [`api/run.bat`](api/run.bat) |
| Start local agent | [`local_agent/run.bat`](local_agent/run.bat) |
| Start web | [`web/run.bat`](web/run.bat) |
| API env | [`api/.env`](api/.env) |
| Web env | [`web/.env.local`](web/.env.local) |
| Run tests locally | `.\scripts\ci-local.ps1` (Windows) or `./scripts/ci-local.sh` |

---

## Optional setup

### Supabase Storage buckets

Create **public** buckets in Supabase Dashboard → **Storage** if you use:

| Bucket | Used for |
|--------|----------|
| `storyboard-images` | Storyboard tiles, character/location images |
| `audiobank-sounds` | Audiobank SFX library |

Set bucket names in `api/.env` if you use different names (`STORYBOARD_IMAGES_BUCKET`, `AUDIOBANK_BUCKET`).

### Google Sign-In

If you see **redirect_uri_mismatch**:

1. [Google Cloud Console](https://console.cloud.google.com/) → **Credentials** → your OAuth client
2. Add redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Supabase Dashboard → **Authentication** → **URL Configuration** → set **Site URL** (`http://localhost:3000`) and **Redirect URLs** (`http://localhost:3000/**`)

### Mesh Gen & SAM (advanced)

Heavy, GPU-specific add-ons. See:

- [`local_agent/README.md`](local_agent/README.md) — Hunyuan3D-2 mesh generation
- [`local_agent/README-SAM.md`](local_agent/README-SAM.md) — Segment Anything for UI Breakdown

---

## Production / EC2

See [`deploy/README.md`](deploy/README.md) for building and deploying to a server.

---

## Repo layout

```
devbloom/
├── api/           FastAPI backend
├── local_agent/   Local-only tools (port 8765)
├── web/           Next.js frontend
├── games/         Game-specific pipelines (Pocket Voyager, etc.)
├── scripts/       CI and install helpers
└── requirements.txt   Shared Python deps (api + local_agent)
```

---

## Previous documentation

The full older README (CI details, EC2 env vars, storyboard notes) is preserved in [`Old_Readme.md`](Old_Readme.md).
