# strauss-kb — Gemini CLI adapter (legacy)

Gemini CLI stopped serving individual (free / AI Pro / Ultra personal) accounts
on June 18, 2026 in favor of Antigravity CLI — see the
[antigravity adapter](../antigravity/) for the successor. Organization
(Gemini Code Assist Standard/Enterprise) licenses keep access, so this adapter
ships what is free to support:

## MCP server

Register in `.gemini/settings.json` (or via an extension):

```json
{ "mcpServers": { "strauss-kb": { "command": "strauss-kb-mcp" } } }
```

Tool descriptions travel with every request — the compaction-immune layer.

## GEMINI.md sentinel block — the primary mechanism here

```bash
strauss-kb sync-instructions GEMINI.md
```

GEMINI.md is rendered into the request context independently of chat history,
so the sentinel-block index survives context compression by construction —
which matters because Gemini's compression hook (`PreCompress`) is advisory and
cannot inject. Re-run `sync-instructions` when pins change; it is idempotent
and touches nothing outside the sentinels.

## Session-start hook (optional)

Gemini hooks require strict JSON on stdout — plain text is a protocol
violation — which is what `--format json` exists for. Merge
[settings-hooks.json](./settings-hooks.json) into `.gemini/settings.json`.
When nothing is pinned the command prints nothing, which Gemini treats as no
output. A per-turn `BeforeAgent` hook (same command, `--event BeforeAgent`)
also works but is overkill next to the GEMINI.md block — documented, not
defaulted.

Verified against google-gemini/gemini-cli `docs/hooks/` as of August 2026.
