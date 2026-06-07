#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

cd "$ROOT_DIR"
mkdir -p target/jankurai

log "release-readiness: validating release evidence surface"
node <<'NODE'
const fs = require('fs');
const requiredFiles = [
  'CHANGELOG.md',
  'docs/release.md',
  'docs/release-process.md',
  'docs/testing.md',
  'docs/operations.md',
  'agent/cost-budget.toml',
];
const missingFiles = requiredFiles.filter((file) => !fs.existsSync(file));
const joined = requiredFiles
  .filter((file) => fs.existsSync(file))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
const requiredTerms = ['just fast', 'just security', 'just ux-qa', 'just cost-budget', 'target/jankurai', 'rollback'];
const missingTerms = requiredTerms.filter((term) => !joined.includes(term));
const receipt = {
  ok: missingFiles.length === 0 && missingTerms.length === 0,
  required_files: requiredFiles,
  missing_files: missingFiles,
  missing_terms: missingTerms,
};
fs.writeFileSync('target/jankurai/release-readiness.json', JSON.stringify(receipt, null, 2) + '\n');
if (!receipt.ok) {
  throw new Error(`release readiness missing evidence: files=${missingFiles.join(',')} terms=${missingTerms.join(',')}`);
}
NODE

log "release-readiness: complete"
