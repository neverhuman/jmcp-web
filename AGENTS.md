# JMCP Web Agent Instructions

This repository follows the runtime toolchain instructions at:

@/home/ubuntu/.codex/RTK.md

## Scope

`jmcp-web` owns the React cockpit, proof host, JITUX card console, rendered UX
tests, and frontend runtime guards. It is a client of `jmcp-core`; it must not
become an alternate authority for approvals, audit, replay, or durable state.

## Agent Rules

- Use the `rtk` prefix for shell commands.
- Treat `AGENT_CHAT.md` as append-only.
- Keep work scoped to `apps/cockpit`, `apps/web`, `apps/shared`,
  `packages/ux-qa`, and frontend proof docs.
- Render only source-backed cards. Valid card source states are `live`,
  `cached`, `degraded`, or `draft`.
- Preserve other agents' edits. If a file has changed unexpectedly, inspect and merge rather than overwrite.

## Jankurai

<!-- jankurai generated adapter -->
<!-- jankurai agent request v1 sha256:REPLACE_WITH_HASH -->

Read `agent/JANKURAI_STANDARD.md` before Jankurai-scoped work. For explicit phase or MASTER_PLAN work only, read `agent/MASTER_PLAN.md` before `tips/phases/00-phase-index.md`; otherwise, user-provided implementation or handoff plans are controlling. Keep generated artifacts under their declared source commands.
