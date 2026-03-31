"""Async XLSX export jobs (local JSON store)."""

import json
import logging
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from services.xlsx_export import run_export_xlsx_tool

PROJECT_ROOT = Path(__file__).resolve().parent.parent
JOBS_DIR = PROJECT_ROOT / ".local_data" / "jobs" / "xlsx"
JOB_TTL_SECONDS = 60 * 60 * 24  # 24h

_lock = threading.Lock()
logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _job_path(job_id: str) -> Path:
    return JOBS_DIR / f"{job_id}.json"


def _write_job(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def _read_job(path: Path) -> Optional[dict]:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        logger.exception("Failed to read XLSX job record.", extra={"path": str(path)})
        return None


def cleanup_jobs() -> None:
    try:
        JOBS_DIR.mkdir(parents=True, exist_ok=True)
        cutoff = time.time() - JOB_TTL_SECONDS
        for file in JOBS_DIR.glob("*.json"):
            try:
                if file.stat().st_mtime < cutoff:
                    file.unlink(missing_ok=True)
            except Exception:
                logger.exception("Failed to clean up expired XLSX job record.", extra={"path": str(file)})
                continue
    except Exception:
        logger.exception("Failed to clean up XLSX jobs directory.", extra={"jobs_dir": str(JOBS_DIR)})


def create_xlsx_job(args: dict) -> dict:
    cleanup_jobs()
    job_id = uuid.uuid4().hex
    record = {
        "id": job_id,
        "status": "queued",
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "filename": None,
        "download_url": None,
        "path": None,
        "error": None,
        "project_key": args.get("project_key"),
    }
    path = _job_path(job_id)
    with _lock:
        _write_job(path, record)
    return record


def get_xlsx_job(job_id: str) -> Optional[dict]:
    return _read_job(_job_path(job_id))


def _update_job(job_id: str, updates: dict) -> None:
    path = _job_path(job_id)
    with _lock:
        current = _read_job(path) or {"id": job_id}
        current.update(updates)
        current["updated_at"] = _now_iso()
        _write_job(path, current)


def _run_job(job_id: str, args: dict) -> None:
    _update_job(job_id, {"status": "running"})
    try:
        result = run_export_xlsx_tool(args)
        _update_job(
            job_id,
            {
                "status": "done",
                "filename": result.get("filename"),
                "download_url": result.get("download_url"),
                "path": result.get("path"),
            },
        )
    except Exception as exc:
        logger.exception("XLSX export job failed.", extra={"job_id": job_id})
        _update_job(job_id, {"status": "error", "error": str(exc)})


def enqueue_xlsx_job(args: dict) -> dict:
    record = create_xlsx_job(args)
    thread = threading.Thread(target=_run_job, args=(record["id"], args), daemon=True)
    thread.start()
    return record
