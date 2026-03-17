#!/usr/bin/env bash
# Reset local changes, remove untracked files, pull latest.
# WARNING: This deletes ALL local changes and untracked files.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

cd "$REPO_ROOT"

echo "Resetting local changes in $REPO_ROOT..."
git reset --hard
git clean -fd

echo "Pulling latest from origin..."
git pull --rebase

echo "Ensuring deploy scripts are executable..."
chmod +x "$REPO_ROOT"/deploy/*.sh

echo "Done."
