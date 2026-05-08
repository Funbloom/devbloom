#!/usr/bin/env bash
# Deploy from S3 to EC2: download zip, extract, install API deps, restart services.
# Usage: ./ec2-deploy.sh [s3-key]
#   No arg or "latest" -> downloads s3://BUCKET/releases/latest.zip
#   Otherwise -> downloads s3://BUCKET/releases/<s3-key> (e.g. devbloom-20250316_1430.zip)
#
# Environment (optional):
#   APP_ROOT          App directory (default: /home/ec2-user/devbloom)
#   S3_BUCKET         S3 bucket (default: devbloom)
#   S3_PREFIX         Key prefix under bucket (default: releases)
#   RESTART_SERVICES  Set to 0 to skip systemctl restart (default: 1)
#
# Prereqs on EC2: AWS CLI configured (or instance role), unzip, rsync, Node for web (standalone), Python 3.10+ venv for API.
# For standalone web, use devbloom-web-standalone.service.example (ExecStart=node server.js).
# The release zip must contain devbloom/{web,api,games}/ — games/ is required for API routes that import game services.
# Legacy zips may still use gamedev-king/ as the top folder; this script accepts both.

set -euo pipefail
S3_BUCKET="${S3_BUCKET:-devbloom}"
S3_PREFIX="${S3_PREFIX:-releases}"
APP_ROOT="${APP_ROOT:-/home/ec2-user/devbloom}"
RESTART_SERVICES="${RESTART_SERVICES:-1}"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

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
  echo "WARNING: Zip has no games/ directory (legacy build?). Game pipelines may fail until you add games/ or redeploy with a current package."
fi

if [[ -n "$ENV_BACKUP" ]]; then
  echo "Restoring api/.env..."
  cp "${ENV_BACKUP}" "${APP_ROOT}/api/.env"
fi

echo "Installing API dependencies..."
cd "${APP_ROOT}/api"
# mcp requires Python 3.10+; prefer python3.11/3.10 if available
PYTHON=""
for p in python3.12 python3.11 python3.10 python3; do
  if command -v "$p" &>/dev/null && $p -c 'import sys; exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null; then
    PYTHON="$p"
    break
  fi
done
[[ -z "$PYTHON" ]] && PYTHON=python3
NEED_VENV=1
if [[ -d ".venv" ]]; then
  if .venv/bin/python3 -c 'import sys; exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null; then
    NEED_VENV=0
  else
    echo "Removing old .venv (Python < 3.10); recreating with $PYTHON"
    rm -rf .venv
  fi
fi
if [[ "$NEED_VENV" -eq 1 ]]; then
  $PYTHON -m venv .venv
fi
.venv/bin/python3 -m pip install --upgrade pip -q
if ! .venv/bin/pip install -r requirements.txt; then
  echo ""
  echo "Install failed. The 'mcp' package requires Python 3.10+. Current: $(.venv/bin/python3 --version 2>/dev/null || echo 'unknown')"
  echo "On Amazon Linux 2: sudo dnf install python3.11  then run this script again."
  exit 1
fi

if [[ "${RESTART_SERVICES}" == "1" ]]; then
  echo "Restarting services..."
  sudo systemctl daemon-reload
  sudo systemctl restart devbloom-api
  sudo systemctl restart devbloom-web
  echo "Done. Check: sudo systemctl status devbloom-api devbloom-web --no-pager"
else
  echo "Skipped service restart (RESTART_SERVICES!=1). Restart manually when ready."
fi
