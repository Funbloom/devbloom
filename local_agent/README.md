# Local Agent

Local-only FastAPI service for reading/writing project files on the developer machine.

## What it does
- Reads/writes JSON files under an approved project root.
- Reads/writes binary files (e.g., images) under an approved root.
- Lists directories under an approved root.
- **Mesh Gen (optional):** `POST /meshgen/generate` runs [Hunyuan3D-2](https://github.com/Tencent-Hunyuan/Hunyuan3D-2) **in-process** (image → GLB/OBJ) and writes under the approved project, e.g. `gen/3dmesh/`. Requires the same venv to have PyTorch (CUDA), `hy3dgen` from the Hunyuan repo (`pip install -e .` per upstream README), and optional texture build steps if you use texturing.
- Enforces localhost-only access and path traversal protection.

## Requirements
- Python 3.10+
Cuda 12.4 : https://developer.nvidia.com/cuda-12-4-0-download-archive?target_os=Windows&target_arch=x86_64&target_version=11&target_type=exe_local


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

## Deployed https:// UI + local agent on your PC

If the Next.js app is served at **https://your-domain.com** but you still want gift/cities pipelines to talk to **127.0.0.1:8765** on your machine:

1. **Web build** — set hostname(s) (no scheme), comma-separated:
   ```
   NEXT_PUBLIC_LOCAL_AGENT_PAGE_HOSTS=dev.funbloomstudio.com
   ```
   (`deploy/build-and-upload.bat` sets this for dev.funbloomstudio.com by default.)

2. **Local agent** — allow that browser `Origin` in CORS (full URL with `https://`):
   ```
   LOCAL_AGENT_EXTRA_CORS_ORIGINS=https://dev.funbloomstudio.com
   ```
   (`local_agent/run.bat` sets this by default for the same host. For manual uvicorn, export the variable before starting.)

Requests still hit **your PC’s** loopback; `ensure_localhost` only allows connections from 127.0.0.1/::1.

## Approval flow
The UI approves a project root by calling:
```
POST /projects/approve
```
Approved roots are stored in:
```
local_agent/.local_agent/approved_roots.json
```

## Native folder / file picker (OS dialog)

Admin **Pick folder…** calls the agent so a real OS dialog runs on your machine and returns an absolute path.

- `POST /fs/pick_directory` — body `{}` — `{ "cancelled": true }` or `{ "cancelled": false, "path": "/full/path" }`.
- `POST /fs/pick_file` — optional `{ "title": "…", "filetypes": [["Images","*.png *.jpg"],["All","*.*"]] }` — same response shape.

Needs a **GUI session**. **macOS**: AppleScript (`osascript`), no tkinter. **Windows/Linux**: tkinter.

## Health check
```
GET /health
```
Response includes `"service": "local_agent"` so the web app can tell this process from the main API (`gamedev-api`).

## Mesh Gen / Hunyuan3D-2 (in-process)

Use the **Mesh Gen** page in the web app (localhost only). It calls `POST /meshgen/generate` on this agent.

**`No module named 'torch'`** means PyTorch is not installed in **`local_agent/.venv`**. The agent’s `requirements.txt` does not include Torch (you must pick a **CUDA** build that matches your GPU drivers). Install in this order:

### One-time: PyTorch + Hunyuan in `local_agent/.venv` (Windows)

From the **repo root**, with the **local agent venv** active:

```powershell
.\local_agent\.venv\Scripts\activate
```

1. **PyTorch (CUDA)** — open [pytorch.org/get-started/locally](https://pytorch.org/get-started/locally/), choose *pip* + your CUDA version, then run the command it shows. Typical example (replace `cu124` if the site says another CUDA):

   ```powershell
   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
   ```

2. **Agent + Hunyuan** — still in the same venv:

   ```powershell
   pip install -r local_agent\requirements.txt
   pip install -e D:\path\to\Hunyuan3D-2
   ```

   Use your real Hunyuan clone path and follow [Hunyuan3D-2 README](https://github.com/Tencent-Hunyuan/Hunyuan3D-2) for `requirements.txt`.

### Texturing: `custom_rasterizer` (required if Mesh Gen “texture” is ON)

The paint pipeline imports a **compiled** module `custom_rasterizer`. If you see `ModuleNotFoundError: No module named 'custom_rasterizer'`, build the extensions **in the same `local_agent/.venv`**:

```powershell
cd D:\path\to\Hunyuan3D-2\hy3dgen\texgen\custom_rasterizer
python setup.py install
cd ..\differentiable_renderer
python setup.py install
```

On Windows you typically need **Visual Studio Build Tools** (C++) and a **CUDA toolkit** aligned with your PyTorch build. If you only need **untextured** meshes, leave **texture** unchecked in Mesh Gen—no rasterizer required.

3. **Check:**

   ```powershell
   python -c "import torch; print('torch', torch.__version__, 'cuda', torch.cuda.is_available())"
   python -c "import hy3dgen"
   ```

4. Set **`HF_HOME`** to your Hugging Face cache (e.g. `D:\FunBloom\models\hf_cache`), **restart** the agent, then try Mesh Gen again.

Environment variables (process that runs uvicorn):

| Variable | Default | Purpose |
|----------|---------|---------|
| **`HF_HOME`** | _(required for Mesh Gen)_ | Hugging Face cache root (non-empty). Example: `D:\FunBloom\models\hf_cache`. Mesh Gen refuses to start without it and logs an error. |
| `HUNYUAN_DEVICE` | `cuda` | Torch device string |
| `HUNYUAN_MODEL_PATH` | `tencent/Hunyuan3D-2mini` | Hugging Face repo id for shape model |
| `HUNYUAN_SUBFOLDER` | `hunyuan3d-dit-v2-mini-turbo` | Subfolder inside that repo |
| `HUNYUAN_TEX_MODEL_PATH` | `tencent/Hunyuan3D-2` | Texture / paint model repo |

Mesh Gen **`face_count`** (UI: *max faces*) caps **triangles** after Hunyuan’s cleanup (`FaceReducer`) for **shape-only and textured** runs. Lower it (e.g. 8k–15k) for fewer vertices; **`octree_resolution`** also affects how fine the initial shape is (lower = coarser).

**Skeletons / rigs:** Hunyuan3D-2 outputs **geometry** (and optional textures) only—not armatures, bones, or skin weights. Auto-rigging would be a **separate** step (Blender, game-engine humanoid setup, third-party auto-rig services, etc.); this repo does not expose a “add skeleton” toggle because the upstream model does not provide that capability.

### Mesh Gen returns 503

1. Read the **503 response detail** from the API/UI and the **agent terminal** (import errors log at **ERROR** with a full traceback). Confirm **`HF_HOME`** is set for the agent process (see table above).
2. **Use the same Python as `local_agent/.venv`:** run `local_agent\run.bat` once to create the venv, then in that venv install PyTorch/CUDA and `pip install -e <path-to-Hunyuan3D-2>`. Do **not** start the agent with a random global Python if Hunyuan is only installed in the venv.
3. In VS Code, use **Run and Debug → Python Debugger: Local Agent** (it targets `local_agent/.venv`). If the Debug Console shows `c:\Python310\python.exe`, the workspace **selected interpreter** is wrong—pick **`.\local_agent\.venv\Scripts\python.exe`** for the debug session or rely on `run.bat`.
4. After fixing the environment, **restart** the agent so `meshgen_hunyuan` reloads.

