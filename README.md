# DevBloom
## Multi agents to assist game developers on one project.
## Developped by Andy Fire Studio LLC.

This repo contains:
- `web/` — Next.js App Router frontend (TypeScript) — uses `web/node_modules/` (npm)
- `api/` — FastAPI backend that streams tokens over SSE
- `local_agent/` — local-only FastAPI service (file picker, Mesh Gen, SAM, etc.)
- `util/` — small one-off Python utilities (e.g. Hunyuan smoke test)

All Python services share **one virtual environment at the repo root** (`.venv/`). The frontend uses npm under `web/`.

## Prereqs
- Node.js 18+
- Python 3.10+

## Setup

### Backend (one venv for everything Python)

The repo uses a single `.venv` at the repo root for both `api` and `local_agent`. The `run.bat` / `run.sh` scripts create it automatically on first run, but you can also bootstrap it yourself:

```bash
# from the repo root
python -m venv .venv

# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1
# Windows (cmd)
.\.venv\Scripts\activate.bat
# macOS / Linux
source .venv/bin/activate

python -m pip install --upgrade pip
python -m pip install -r requirements.txt -r requirements-dev.txt

cp api/.env.example api/.env   # Windows: copy api\.env.example api\.env
# add your OpenAI / Supabase keys in api/.env
```

Run the API server:
```bash
cd api
uvicorn main:app --reload --port 8000
```

Or just double‑click / run `api\run.bat` (Windows) — it activates the root `.venv`, installs deps, and starts uvicorn for you.

#### Optional ML add-ons (local agent)
These are heavy and CUDA-specific, so they are **opt-in** on top of the root venv:

| Feature | Install |
|---|---|
| **Mesh Gen (Hunyuan3D-2)** | After installing a CUDA PyTorch wheel from [pytorch.org](https://pytorch.org/get-started/locally/), run `.\scripts\install-meshgen.ps1 -HunyuanPath <your-Hunyuan3D-2-clone>` (e.g. `D:\FunBloom\models\Hunyuan3D-2`). The script installs `util/requirements-meshgen.txt`, Hunyuan's own `requirements.txt`, the editable `hy3dgen` package, and the two texture extensions in one shot. Add `-SkipTextureExtensions` to skip the slow MSVC build if you only want untextured meshes. |
| **UI Breakdown SAM** | `pip install -r local_agent/requirements-sam.txt` (also installs torch CPU; for CUDA install the matching torch wheel first) |

See `local_agent/README.md` and `local_agent/README-SAM.md` for full details.

#### TECH
Supabase is the database that is currently used. Configure your Supabase project URL and keys in `api/.env` for this DevBloom deployment.

### Frontend
```bash
cd web
npm install
npm run dev
```

Open: http://localhost:3000

## Test

### Automated checks (CI)

**GitHub Actions** runs on every **push** and **pull request** to `main` or `master`:

- **Web** (`web/`): `npm ci`, `npm run lint` (TypeScript `tsc --noEmit`), `npm run build`
- **API** (`api/`): install `requirements.txt` + `requirements-dev.txt`, then `pytest` on `api/tests/`

Run the **same checks locally** before you commit (from the **repository root**):

| Environment | Command |
|-------------|---------|
| **Windows** (PowerShell) | `.\scripts\ci-local.ps1` |
| **macOS / Linux / Git Bash / WSL** | `chmod +x scripts/ci-local.sh && ./scripts/ci-local.sh` |

**Manual equivalent** (if you prefer not to use the scripts — activate the root `.venv` first so pytest finds the deps):

```bash
cd web && npm ci && npm run lint && npm run build && cd ../api && python -m pip install -r requirements.txt -r requirements-dev.txt && python -m pytest tests -q
```

API-only tests and layout are described in [api/tests/README.md](api/tests/README.md).

### Test chat (manual)

1. Start API server (port 8000)
2. Start Web app (port 3000)
3. Send a message and watch the assistant stream back

## Storyboard images (sync across computers)

**Tile images** are uploaded to **Supabase Storage** when you generate them, so they work from any machine. The tile’s `image` field stores the Storage URL (e.g. `https://...supabase.co/storage/v1/object/public/storyboard-images/...`).

**Setup (one-time):** In [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Storage** → **New bucket**:
- Name: `storyboard-images`
- **Public bucket**: ON (so the app can load images without auth)
- Create the bucket

Optional: set `STORYBOARD_IMAGES_BUCKET` in `api/.env` if you use a different bucket name.

If the bucket is missing or upload fails, the API still saves the image locally and stores the local URL; images will then only work on that machine until you regenerate with Storage configured.

## Google Sign-In (OAuth)

If you see **Error 400: redirect_uri_mismatch** when using “Sign in with Google”, add Supabase’s callback URL in Google Cloud Console:

1. Open [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**.
2. Edit your **OAuth 2.0 Client ID** (Web application) used by Supabase.
3. Under **Authorized redirect URIs**, add:
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`  
   Example: `https://slxhjrdnaundthsjfrkm.supabase.co/auth/v1/callback`
4. Save.

In **Supabase Dashboard** → **Authentication** → **URL Configuration**, set **Site URL** (e.g. `http://localhost:3000`) and add **Redirect URLs** (e.g. `http://localhost:3000/**`) so Supabase can send users back to your app after login.

**Character and location images** (uploaded in the storyboard sidebar) are also uploaded to the same bucket under `characters/<storyboard_id>/...` and `locations/<storyboard_id>/...`, so they work from any machine too.

## EC2 / Production

To run the API on EC2 (or any host):

1. **Backend (`api/env`)**  
   Set `CORS_ORIGINS` to your frontend URL(s), comma-separated, e.g.  
   `CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com`  
   (If unset, it defaults to localhost for local dev.)

2. **Frontend (`web/.env.local` or build env)**  
   Set `NEXT_PUBLIC_API_URL_BASE` to your API base URL, e.g.  
   `NEXT_PUBLIC_API_URL_BASE=https://api.yourdomain.com`

3. **Supabase**  
   In Dashboard → Authentication → URL Configuration, set **Site URL** and add **Redirect URLs** for your production frontend (e.g. `https://yourdomain.com/**`).

4. **Run the API** (e.g. on EC2):  
   `uvicorn main:app --host 0.0.0.0 --port 8000`  
   Use a process manager (systemd, supervisord) or reverse proxy (nginx) in front. Serve the Next.js app separately (e.g. `npm run build && npm start`, or static export behind nginx).

