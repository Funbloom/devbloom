# UI Breakdown: Segment Anything (local agent)

SAM runs **in the local agent process** on your PC (`local_agent/run.bat`), like Hunyuan mesh generation. The main API does **not** load PyTorch/SAM; it only runs **Gemini labeling** when the browser sends SAM results from here.

## Endpoint

```
POST /ui_breakdown/sam
```

Body (JSON): `project_root` (approved), `filename` (bare name, resolved under `Images/` or `Gen/Images/UI/`), `max_elements`, `min_box_fraction`, optional `sam` AMG overrides.

Response: `{ "elements": [...], "image_width": int, "image_height": int }`.

## Install

From the repo root, with **`local_agent/.venv`** active:

```powershell
pip install -r local_agent/requirements.txt -r local_agent/requirements-sam.txt
```

## Checkpoints

Download a Meta SAM ViT checkpoint and set **`SAM_CHECKPOINT_PATH`** to the `.pth` file (env var read by the agent process).

| `SAM_MODEL_TYPE` | Example checkpoint file |
|------------------|-------------------------|
| `vit_b` (default) | `sam_vit_b_01ec64.pth` |
| `vit_l` | `sam_vit_l_0b3195.pth` |
| `vit_h` | `sam_vit_h_4b8939.pth` |

Links: [segment-anything README](https://github.com/facebookresearch/segment-anything).

## Environment variables (local agent process)

On startup, the agent loads **`local_agent/.env`**. Copy **`.env.example`** to **`.env`** if you do not have one yet, set **`SAM_CHECKPOINT_PATH`**, then restart the agent. You can instead export the same variables in your shell.

| Variable | Description |
|----------|-------------|
| **`SAM_CHECKPOINT_PATH`** | Path to the `.pth` file (required for `/ui_breakdown/sam`). |
| **`SAM_MODEL_TYPE`** | `vit_b`, `vit_l`, or `vit_h`. Must match checkpoint. |

## API server (labeling only)

Set on the **API** host: **`GEMINI_API_KEY`** / **`GOOGLE_API_KEY`**, and optionally **`UI_BREAKDOWN_LABEL_MODEL`**.

## Hardware

CUDA strongly recommended for SAM; CPU is slow on large images.
