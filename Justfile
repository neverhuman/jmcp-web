set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

default:
    @just --list

fast:
    bash ops/ci/fast.sh

build:
    npm run build

test:
    npm test

ci:
    bash ops/ci/ci.sh

security:
    bash ops/ci/security.sh

conformance:
    bash ops/ci/contract-drift.sh

jankurai-local:
    bash ops/ci/jankurai-local.sh

score: score-advisory

score-advisory:
    jankurai audit . --mode advisory --json .jankurai/repo-score.json --md .jankurai/repo-score.md --score-history .jankurai/score-history.jsonl --score-history-csv .jankurai/score-history.csv

proof-routing:
    jankurai proof . --changed-from "${JANKURAI_BASE_REF:-origin/main}" --out target/jankurai/proof-routing.json --md target/jankurai/proof-routing.md

proofbind:
    jankurai proofbind verify . --changed-from "${JANKURAI_BASE_REF:-origin/main}" --out target/jankurai/proofbind/surface-witness.json --obligations-out target/jankurai/proofbind/obligations.json --md target/jankurai/proofbind/proofbind.md

copy-code:
    jankurai copy-code . --json target/jankurai/copy-code.json --md target/jankurai/copy-code.md

language-bad-behavior:
    bash ops/ci/language-bad-behavior.sh

contract-drift:
    bash ops/ci/contract-drift.sh

cost-budget:
    bash ops/ci/cost-budget.sh

release-readiness:
    bash ops/ci/release-readiness.sh

authz-matrix:
    jankurai audit . --mode advisory --json .jankurai/repo-score.json --md .jankurai/repo-score.md

input-boundary:
    jankurai audit . --mode advisory --json .jankurai/repo-score.json --md .jankurai/repo-score.md

agent-tool-supply:
    jankurai audit . --mode advisory --json .jankurai/repo-score.json --md .jankurai/repo-score.md

ux-qa:
    npm --prefix apps/web run test:ux

check: fast test build security contract-drift cost-budget release-readiness score

fast-legacy:
    npm ci --ignore-scripts --no-audit --no-fund
    npm run typecheck
    npm run guard:no-three
