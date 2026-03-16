#!/usr/bin/env bash
# Deploy from S3 to EC2: download zip, extract, install API deps, restart services.
# Usage: ./ec2-deploy.sh [s3-key]
#   No arg or "latest" -> downloads s3://BUCKET/releases/latest.zip
#   Otherwise -> downloads s3://BUCKET/releases/<s3-key> (e.g. gamedev-king-20250316_1430.zip)
#
# Prereqs on EC2: AWS CLI configured (or instance role), unzip, Node for web (standalone), Python 3 + venv for API.
# For standalone web, use gamedev-web-standalone.service.example (ExecStart=node server.js).

set -e
S3_BUCKET="devbloom"
S3_PREFIX="releases"
APP_ROOT="${APP_ROOT:-/home/ec2-user/gamedev-king}"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

if [[ -z "$1" || "$1" == "latest" ]]; then
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
if [[ ! -d "${TMP_DIR}/gamedev-king" ]]; then
  echo "Archive missing gamedev-king/."
  exit 1
fi

echo "Backing up api/.env if present..."
ENV_BACKUP=""
if [[ -f "${APP_ROOT}/api/.env" ]]; then
  ENV_BACKUP="${TMP_DIR}/api_env_backup"
  cp "${APP_ROOT}/api/.env" "${ENV_BACKUP}"
fi

echo "Syncing web and api into ${APP_ROOT}..."
mkdir -p "${APP_ROOT}"
rsync -a --delete "${TMP_DIR}/gamedev-king/web/" "${APP_ROOT}/web/"
rsync -a --delete "${TMP_DIR}/gamedev-king/api/" "${APP_ROOT}/api/"

if [[ -n "$ENV_BACKUP" ]]; then
  echo "Restoring api/.env..."
  cp "${ENV_BACKUP}" "${APP_ROOT}/api/.env"
fi

echo "Installing API dependencies..."
cd "${APP_ROOT}/api"
if [[ ! -d ".venv" ]]; then
  python3 -m venv .venv
fi
.venv/bin/pip install -q -r requirements.txt

echo "Restarting services..."
sudo systemctl restart gamedev-api
sudo systemctl restart gamedev-web

echo "Done. Check: sudo systemctl status gamedev-api gamedev-web"
