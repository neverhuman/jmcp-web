#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

cd "$ROOT_DIR"
mkdir -p .artifacts/security

if has gitleaks; then
  log "security: running gitleaks"
  gitleaks detect --source . --config gitleaks.toml --no-banner --redact --no-git
else
  missing_tool gitleaks "secret scanning"
fi

log "security: npm audit"
npm audit --audit-level=high

if has zizmor; then
  log "security: running zizmor"
  zizmor .github/workflows
else
  missing_tool zizmor "GitHub Actions security linting"
fi

if has syft; then
  log "security: generating SBOM"
  syft dir:. -o spdx-json=.artifacts/security/jmcp-web.spdx.json
else
  missing_tool syft "SBOM generation"
fi

log "security: complete"
