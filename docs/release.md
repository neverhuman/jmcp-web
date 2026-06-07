# JMCP Web Release

A release candidate must pass the same local lanes that CI runs:

- `just fast`
- `just test`
- `just build`
- `just ux-qa`
- `just security`
- `just contract-drift`
- `just cost-budget`
- `just release-readiness`
- `just score`

Receipts are written under `target/jankurai/` and security artifacts under
`.artifacts/security/`. Rollback should prefer reverting the reviewed release
commit and rerunning the same proof set.
