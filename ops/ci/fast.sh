#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

cd "$ROOT_DIR"

log "fast: checking shell syntax"
while IFS= read -r script; do
  bash -n "$script"
done < <(find scripts ops -type f -name '*.sh' | sort)

log "fast: installing npm dependencies"
npm ci --ignore-scripts --no-audit --no-fund

log "fast: typecheck"
npm run typecheck

log "fast: generated client guard"
npm run guard:generated-client

log "fast: dependency guard"
npm run guard:no-three

if has actionlint; then
  log "fast: linting GitHub Actions"
  actionlint
else
  missing_tool actionlint "GitHub Actions linting"
fi

log "fast: complete"
