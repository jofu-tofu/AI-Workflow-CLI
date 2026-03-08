#!/usr/bin/env bash
set -e

echo "[pre-commit] 1/3 — TypeScript import validation..."
(cd .aiwcli/_core/lib-ts && bunx tsc --noEmit)

echo "[pre-commit] 2/3 — Contract tests..."
(cd packages/cli && npx vitest run test/types/ --reporter=dot)

echo "[pre-commit] 3/3 — Template sync check..."
node packages/cli/scripts/check-template-sync.mjs

echo "[pre-commit] All checks passed."
