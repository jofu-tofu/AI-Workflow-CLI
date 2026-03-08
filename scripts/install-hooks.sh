#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK_SOURCE="$REPO_ROOT/scripts/pre-commit-gate.sh"
HOOK_TARGET="$REPO_ROOT/.git/hooks/pre-commit"

if [ ! -d "$REPO_ROOT/.git/hooks" ]; then
  echo "[install-hooks] .git/hooks directory not found — skipping"
  exit 0
fi

if [ -L "$HOOK_TARGET" ] || [ -f "$HOOK_TARGET" ]; then
  echo "[install-hooks] pre-commit hook already exists — skipping"
  exit 0
fi

ln -s "$HOOK_SOURCE" "$HOOK_TARGET"
echo "[install-hooks] Symlinked pre-commit hook: $HOOK_TARGET -> $HOOK_SOURCE"
