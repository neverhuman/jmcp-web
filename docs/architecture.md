# JMCP Web Architecture

`jmcp-web` owns browser presentation for the JMCP cockpit and proof host. It
renders state from `jmcp-core` and never becomes the authority for approvals,
tool policy, ledgers, or durable turn state.

The cockpit code lives under `apps/cockpit/`. The rendered proof host lives
under `apps/web/`. Shared UX proof tooling lives under `packages/ux-qa/`.
