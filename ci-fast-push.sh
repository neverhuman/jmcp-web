#!/usr/bin/env bash
set -euo pipefail

npm ci --ignore-scripts --no-audit --no-fund
npm --workspace @jmcp/cockpit run typecheck
npm --workspace @jmcp/cockpit run test
npm --workspace @jmcp/cockpit run build
npm --prefix apps/web run build
