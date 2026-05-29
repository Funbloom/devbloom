#!/usr/bin/env bash
# Deploy from S3 to EC2: download zip, extract, install API deps, restart services.
# Usage: ./ec2-deploy.sh [s3-key]
#   No arg or "latest" -> downloads s3://BUCKET/releases/latest.zip
#   Otherwise -> downloads s3://BUCKET/releases/<s3-key> (e.g. devbloom-20250316_1430.zip)
#
# Environment (optional):
#   APP_ROOT          App directory (default: parent of deploy/ — the repo you cloned)
#   S3_BUCKET         S3 bucket (default: devbloom)
#   S3_PREFIX         Key prefix under bucket (default: releases)
#   LOCAL_AGENT_S3_PREFIX  Local Agent zip prefix (default: releases/local-agent)
#   RESTART_SERVICES  Set to 0 to skip systemctl restart (default: 1)
#
# Prereqs on EC2: AWS CLI configured (or instance role), unzip, rsync, Node for web (standalone), Python 3.10+ venv.
# Python venv lives at APP_ROOT/.venv (shared layout, same as local dev). Legacy api/.venv is removed on deploy.
# For standalone web, use devbloom-web-standalone.service.example (ExecStart=node server.js).
# The release zip must contain devbloom/{web,api,games,requirements.txt}/ — games/ is required for API game routes.
# Legacy zips may still use gamedev-king/ as the top folder; this script accepts both.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Deploy into the repo that contains this script unless APP_ROOT is set explicitly.
DEFAULT_APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
S3_BUCKET="${S3_BUCKET:-devbloom}"
S3_PREFIX="${S3_PREFIX:-releases}"
APP_ROOT="${APP_ROOT:-${DEFAULT_APP_ROOT}}"
RESTART_SERVICES="${RESTART_SERVICES:-1}"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "APP_ROOT=${APP_ROOT}"

if [[ -z "${1:-}" || "${1:-}" == "latest" ]]; then
  S3_KEY="${S3_PREFIX}/latest.zip"
else
  S3_KEY="${S3_PREFIX}/$1"
fi

echo "Downloading s3://${S3_BUCKET}/${S3_KEY} ..."
aws s3 cp "s3://${S3_BUCKET}/${S3_KEY}" "${TMP_DIR}/release.zip"
if [[ ! -f "${TMP_DIR}/release.zip" ]]; then
  echo "Download failed."
  exit 1
fi

echo "Extracting..."
unzip -q -o "${TMP_DIR}/release.zip" -d "${TMP_DIR}"
RELEASE_ROOT=""
if [[ -d "${TMP_DIR}/devbloom" ]]; then
  RELEASE_ROOT="${TMP_DIR}/devbloom"
elif [[ -d "${TMP_DIR}/gamedev-king" ]]; then
  RELEASE_ROOT="${TMP_DIR}/gamedev-king"
  echo "Note: zip uses legacy top folder gamedev-king/; rebuild with current deploy script for devbloom/."
fi
if [[ -z "${RELEASE_ROOT}" ]]; then
  echo "Archive missing devbloom/ (or legacy gamedev-king/)."
  exit 1
fi

echo "Backing up api/.env if present..."
ENV_BACKUP=""
if [[ -f "${APP_ROOT}/api/.env" ]]; then
  ENV_BACKUP="${TMP_DIR}/api_env_backup"
  cp "${APP_ROOT}/api/.env" "${ENV_BACKUP}"
fi

echo "Syncing web, api, and games into ${APP_ROOT}..."
mkdir -p "${APP_ROOT}"
rsync -a --delete "${RELEASE_ROOT}/web/" "${APP_ROOT}/web/"
rsync -a --delete "${RELEASE_ROOT}/api/" "${APP_ROOT}/api/"
if [[ -d "${RELEASE_ROOT}/games" ]]; then
  rsync -a --delete "${RELEASE_ROOT}/games/" "${APP_ROOT}/games/"
else
  echo "WARNING: Zip has no games/ directory (legacy build?). Game pipelines may fail until you redeploy with a current package."
fi
if [[ -f "${RELEASE_ROOT}/requirements.txt" ]]; then
  cp "${RELEASE_ROOT}/requirements.txt" "${APP_ROOT}/requirements.txt"
fi

if [[ -n "$ENV_BACKUP" ]]; then
  echo "Restoring api/.env..."
  cp "${ENV_BACKUP}" "${APP_ROOT}/api/.env"
fi

echo "Installing API dependencies (shared root .venv)..."
VENV_DIR="${APP_ROOT}/.venv"
REQ_FILE="${APP_ROOT}/requirements.txt"
if [[ ! -f "$REQ_FILE" ]]; then
  REQ_FILE="${APP_ROOT}/api/requirements.txt"
  echo "Note: zip has no root requirements.txt; using api/requirements.txt. Rebuild with current build-and-upload.bat."
fi

if [[ -d "${APP_ROOT}/api/.venv" ]]; then
  echo "Removing legacy api/.venv (migrating to ${VENV_DIR})..."
  rm -rf "${APP_ROOT}/api/.venv"
fi

PYTHON=""
for p in python3.12 python3.11 python3.10 python3; do
  if command -v "$p" &>/dev/null && $p -c 'import sys; exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null; then
    PYTHON="$p"
    break
  fi
done
[[ -z "$PYTHON" ]] && PYTHON=python3

NEED_VENV=1
if [[ -d "${VENV_DIR}" ]]; then
  if "${VENV_DIR}/bin/python3" -c 'import sys; exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null; then
    NEED_VENV=0
  else
    echo "Removing old ${VENV_DIR} (Python < 3.10); recreating with $PYTHON"
    rm -rf "${VENV_DIR}"
  fi
fi
if [[ "$NEED_VENV" -eq 1 ]]; then
  $PYTHON -m venv "${VENV_DIR}"
fi
"${VENV_DIR}/bin/python3" -m pip install --upgrade pip -q
if ! "${VENV_DIR}/bin/pip" install -r "${REQ_FILE}"; then
  echo ""
  echo "Install failed. The 'mcp' package requires Python 3.10+. Current: $("${VENV_DIR}/bin/python3" --version 2>/dev/null || echo 'unknown')"
  echo "On Amazon Linux 2: sudo dnf install python3.11  then run this script again."
  exit 1
fi

LOCAL_AGENT_S3_PREFIX="${LOCAL_AGENT_S3_PREFIX:-releases/local-agent}"
LOCAL_AGENT_DOWNLOAD_DIR="${APP_ROOT}/downloads/local-agent"
LOCAL_AGENT_REPO_DIR="${APP_ROOT}/deploy/local-agent-release"
mkdir -p "${LOCAL_AGENT_DOWNLOAD_DIR}"

sync_local_agent_file() {
  local name="$1"
  local dest="${LOCAL_AGENT_DOWNLOAD_DIR}/${name}"
  if aws s3 cp "s3://${S3_BUCKET}/${LOCAL_AGENT_S3_PREFIX}/${name}" "${dest}" 2>/dev/null; then
    echo "  ${name} <- s3://${S3_BUCKET}/${LOCAL_AGENT_S3_PREFIX}/${name}"
    return 0
  fi
  if [[ -f "${LOCAL_AGENT_REPO_DIR}/${name}" ]]; then
    cp "${LOCAL_AGENT_REPO_DIR}/${name}" "${dest}"
    echo "  ${name} <- ${LOCAL_AGENT_REPO_DIR}/${name} (S3 missing; using repo copy — run build-and-upload.bat on PC to upload)"
    return 0
  fi
  echo "WARNING: ${name} not in S3 and not in ${LOCAL_AGENT_REPO_DIR}/"
  return 1
}

echo "Syncing Local Agent downloads to ${LOCAL_AGENT_DOWNLOAD_DIR} ..."
if aws s3 cp "s3://${S3_BUCKET}/${LOCAL_AGENT_S3_PREFIX}/latest.zip" "${LOCAL_AGENT_DOWNLOAD_DIR}/latest.zip" 2>/dev/null; then
  echo "  latest.zip <- s3://${S3_BUCKET}/${LOCAL_AGENT_S3_PREFIX}/latest.zip"
else
  echo "WARNING: s3://${S3_BUCKET}/${LOCAL_AGENT_S3_PREFIX}/latest.zip not available."
  echo "         Run deploy/build-and-upload.bat on your PC (step 1 builds Local Agent + uploads to S3)."
fi
sync_local_agent_file "VERSION.txt" || true
sync_local_agent_file "web-install.bat" || true

if [[ "${RESTART_SERVICES}" == "1" ]]; then
  echo "Restarting services..."
  sudo systemctl daemon-reload
  sudo systemctl restart devbloom-api
  sudo systemctl restart devbloom-web
  echo "Done. Check: sudo systemctl status devbloom-api devbloom-web --no-pager"
  echo "Ensure devbloom-api.service uses ${VENV_DIR}/bin/uvicorn (see deploy/devbloom-api.service.example)."
else
  echo "Skipped service restart (RESTART_SERVICES!=1). Restart manually when ready."
fi
