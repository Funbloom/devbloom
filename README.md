# Game Dev King
## Multi agents to assist game developers on one project.
## Developped by Andy Fire Studio LLC.

This repo contains:
- `web/` — Next.js App Router frontend (TypeScript)
- `api/` — FastAPI backend that streams tokens over SSE

## Prereqs
- Node.js 18+
- Python 3.10+
- uv (Python package manager)

## Setup

### Backend
```bash
cd api
uv venv
PC:
   .\.venv\Scripts\activate
MAC
   source .venv/bin/activate
uv pip install -r requirements.txt
cp .env.example env   # or on Windows: copy .env.example env
# add your OpenAI key in api/env
```

Run:
```bash
uvicorn main:app --reload --port 8000
```

#### TECH
Supabase is the database that is currently used 
- Project GameDevKing

### Frontend
```bash
cd web
npm install
npm run dev
```

Open: http://localhost:3000

## Test chat
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

**Character and location images** (uploaded in the storyboard sidebar) are also uploaded to the same bucket under `characters/<storyboard_id>/...` and `locations/<storyboard_id>/...`, so they work from any machine too.

