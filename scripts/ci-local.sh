#!/usr/bin/env bash
# Run the same checks as GitHub Actions CI locally (Unix: macOS, Linux, Git Bash, WSL).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "== Web: npm ci, lint, build =="
cd "$ROOT/web"
npm ci
npm run lint
npm run build

echo "== API: pip install, pytest =="
cd "$ROOT/api"
python -m pip install --upgrade pip
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest tests -q

echo "All CI checks passed."
