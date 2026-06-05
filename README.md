# jmcp-web

Frontend split for JMCP.

This repository owns the React cockpit, the JITUX/Mission Deck card console,
the rendered UX proof host, frontend runtime guards, and source-backed card
rendering. It is a client of `jmcp-core`; approvals, audit, replay, and durable
truth stay in the core backend.

## Workspaces

- `apps/cockpit`: operator cockpit and JITUX card console.
- `apps/web`: rendered UX proof host.
- `apps/shared`: shared React mounting helpers.
- `packages/ux-qa`: UX receipt helpers.

## Local Proof

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm --workspace @jmcp/cockpit run typecheck
npm --workspace @jmcp/cockpit run test
npm --workspace @jmcp/cockpit run build
npm --prefix apps/web run build
npm --prefix apps/web run test:ux
```

## Run

```bash
VITE_JMCP_API_URL=http://127.0.0.1:18877 \
  npm --workspace @jmcp/cockpit run dev -- --host 127.0.0.1 --port 15873
```

Cards must be source-backed. Valid source states are `live`, `cached`,
`degraded`, and `draft`; unsupported filler cards should fail guard tests.
