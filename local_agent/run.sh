#!/usr/bin/env bash
# Run from repo root so `local_agent` imports resolve. Uses the SHARED root .venv
# (one venv at the repo root for both api and local_agent). Creates it on first run.
# Requires Python 3.10+ as `python3` or `python` on PATH.
#
# Usage:
#   chmod +x local_agent/run.sh   # once
#   ./local_agent/run.sh
# Or from repo root:
#   bash local_agent/run.sh

set -euo pipefail

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${AGENT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

VENV_DIR="${REPO_ROOT}/.venv"
VENV_PY="${VENV_DIR}/bin/python"
VENV_PIP="${VENV_DIR}/bin/pip"

print_python_help() {
  echo ""
  echo "The local agent is a small Python service. Python 3.10+ must be installed to run it."
  echo ""
  echo "Install options (then open a new terminal and run this script again):"
  echo "  - Homebrew:  brew install python@3.12"
  echo "  - Website:   https://www.python.org/downloads/"
  echo "  - pyenv:     pyenv install 3.12 && pyenv local 3.12"
  echo ""
}

if [[ ! -x "${VENV_PY}" ]]; then
  PY_CMD=""
  for cmd in python3 python; do
    if command -v "${cmd}" >/dev/null 2>&1 \
      && "${cmd}" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
      PY_CMD="${cmd}"
      break
    fi
  done
  if [[ -z "${PY_CMD}" ]]; then
    print_python_help
    exit 1
  fi
  echo "[local_agent] Creating shared venv in .venv ..."
  "${PY_CMD}" -m venv "${VENV_DIR}"
fi

echo "[local_agent] Installing dependencies (root requirements.txt)..."
"${VENV_PIP}" install -q -r "${REPO_ROOT}/requirements.txt"

# CORS: deployed UI can call this agent from your browser. Override or clear before running:
#   export LOCAL_AGENT_EXTRA_CORS_ORIGINS=https://your-host.example
#   unset LOCAL_AGENT_EXTRA_CORS_ORIGINS
if [[ -z "${LOCAL_AGENT_EXTRA_CORS_ORIGINS:-}" ]]; then
  export LOCAL_AGENT_EXTRA_CORS_ORIGINS="https://dev.funbloomstudio.com"
fi

echo "[local_agent] http://127.0.0.1:8765  (Ctrl+C to stop)"
echo "[local_agent] LOCAL_AGENT_EXTRA_CORS_ORIGINS=${LOCAL_AGENT_EXTRA_CORS_ORIGINS}"
exec "${VENV_PY}" -m uvicorn local_agent.main:app --host 127.0.0.1 --port 8765
