# JMCP Web Ops Agent Instructions

This directory owns frontend CI helpers, local proof scripts, security lanes,
and workflow parity for `jmcp-web`.

- Keep workflow logic in `ops/ci/*.sh`; GitHub Actions should delegate to those scripts.
- Do not put product runtime code or generated contract clients under `ops/`.
- Default lanes must be deterministic and local.
- Security evidence belongs under `.artifacts/security/` or `target/jankurai/`.
