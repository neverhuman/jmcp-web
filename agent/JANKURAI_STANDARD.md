# Jankurai Adapter Standard

JMCP Web is a client surface. It may render live runtime state, capture browser
audio, and play audio, but durable approvals, tool policy, ledgers, and turn
state remain owned by `jmcp-core`.

Default checks must be deterministic and local. Rendered UX proof belongs in the
Playwright lane, and generated contract clients must be reproduced from the
core contract source.

