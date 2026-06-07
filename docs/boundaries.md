# JMCP Web Boundaries

`jmcp-web` is a client surface. It may capture browser audio, stream audio to a
declared talk gateway, and render source-backed cards.

Forbidden ownership:
- Durable approval decisions.
- Tool policy enforcement.
- Ledger or replay authority.
- Database truth.

Generated contract clients are declared in `agent/generated-zones.toml` and
checked by `just contract-drift`.
