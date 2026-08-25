# strauss-kb — Codex CLI adapter

Codex reads the same plugin directory as Claude Code through
`.codex-plugin/plugin.json` (install via `.agents/plugins/marketplace.json` in
this repository), which brings the MCP server and the skill. This adapter adds
the session-start injection.

## Install

```bash
npm install -g @saasontools/strauss-kb
cp hooks.json <repo>/.codex/hooks.json     # or merge into ~/.codex/hooks.json
```

Codex's hooks.json is Claude-shaped — top-level `hooks` key, same event names,
same exit-code-2 blocking — with Codex extras like `statusMessage`. Hooks are
enabled by default in current Codex releases (early 2026 releases needed
`[features] codex_hooks = true` in `~/.codex/config.toml`; the flag survives as
a deprecated alias of `hooks`). The commands above use POSIX shell (`2>/dev/null
|| true`); on Windows add `commandWindows` variants or rely on the sentinel
block below instead.

## What Codex gets, layer by layer

| Layer                     | Status                                                                                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP tool descriptions     | Free — re-sent with every request, so the point-of-use reload judgment survives compaction.                                                                                                                                                         |
| Session-start injection   | `hooks.json` here: `SessionStart` with sources `startup`, `resume`, `clear`, and `compact` (all four exist in current Codex).                                                                                                                       |
| Post-compact re-injection | The `compact` matcher covers it where the client performs compaction. For OpenAI-hosted models compaction can run server-side and opaque — there, staleness is covered by instruction (the sentinel block and tool descriptions), not by mechanism. |
| PreToolUse blocking       | Not shipped. Codex has no Read/Glob/Grep tools — file reads go through the shell — and parsing shell commands for KB paths is deliberately out of scope. The AGENTS.md block and tool descriptions are the mitigation.                              |

## The AGENTS.md sentinel block

The highest-leverage artifact on this runtime — AGENTS.md is re-read where the
conversation is not:

```bash
strauss-kb sync-instructions AGENTS.md
```

Idempotent; re-run it (or hook it into CI) whenever pins change. Everything
outside the `<!-- strauss-kb:begin/end -->` sentinels is left alone.

Verified against https://developers.openai.com/codex/hooks and
openai/codex `docs/config.md` as of August 2026.
