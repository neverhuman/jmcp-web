#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

cd "$ROOT_DIR"

"${ROOT_DIR}/ops/ci/fast.sh"

log "ci: tests"
npm test

log "ci: build"
npm run build

log "ci: rendered UX"
npm --prefix apps/web run test:ux

log "ci: complete"
