#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

cd "$ROOT_DIR"
mkdir -p target/jankurai

log "cost-budget: validating zero-spend frontend policy"
node <<'NODE'
const fs = require('fs');
const policy = fs.readFileSync('agent/cost-budget.toml', 'utf8');
for (const term of [
  'default_external_spend_usd = 0',
  'default_network_spend_usd = 0',
  'external_api_usd = 0',
  'model_api_usd = 0',
]) {
  if (!policy.includes(term)) {
    throw new Error(`missing cost-budget term: ${term}`);
  }
}
fs.writeFileSync('target/jankurai/cost-budget.json', JSON.stringify({
  ok: true,
  manifest: 'agent/cost-budget.toml',
  default_external_spend_usd: 0,
  default_network_spend_usd: 0
}, null, 2) + '\n');
NODE

log "cost-budget: complete"
