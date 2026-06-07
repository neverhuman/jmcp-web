#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

cd "$ROOT_DIR"

log "contract-drift: verifying generated client guard"
npm run guard:generated-client

log "contract-drift: complete"
