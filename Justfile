set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

default:
    @just --list

fast:
    npm ci --ignore-scripts --no-audit --no-fund
    npm run typecheck
    npm run guard:no-three

build:
    npm run build

test:
    npm test

ux-qa:
    npm --prefix apps/web run test:ux

ci: fast test build

