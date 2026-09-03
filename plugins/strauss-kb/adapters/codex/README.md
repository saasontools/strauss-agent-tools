# strauss-kb — Codex CLI adapter

Codex reads the same plugin directory as Claude Code, via
`.codex-plugin/plugin.json` (install through `.agents/plugins/marketplace.json`),
for the MCP server and skill. This adapter adds session-start injection.

## Install

```bash
npm install -g @saasontools/strauss-kb
cp hooks.json <repo>/.codex/hooks.json     # or merge into ~/.codex/hooks.json
export STRAUSS_KB_PLUGIN_ROOT=<installed plugin dir>   # for the reload hook
```

Codex's hooks.json is Claude-shaped — top-level `hooks` key, same event names
and exit-code-2 blocking, plus extras like `statusMessage`. Hooks are on by
default in current Codex. Commands use POSIX shell (`2>/dev/null || true`);
on Windows add `commandWindows` or rely on the sentinel below.

## What Codex gets, layer by layer

| Layer                     | Status                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------- |
| MCP tool descriptions     | Re-sent every request; survives compaction.                                         |
| Session-start injection   | `hooks.json`: `SessionStart` sources `startup`, `resume`, `clear`, `compact`.       |
| Post-compact re-injection | Covered by the `compact` matcher; server-side compaction relies on instruction.     |
| Reload after a pull       | `PostToolUse` on `shell` runs `kb-stamp-hook.mjs`; no documented sub-agent event.   |
| PreToolUse blocking       | Not shipped — Codex has no Read/Glob/Grep, only shell. AGENTS.md is the mitigation. |

## AGENTS.md sentinel block

```bash
strauss-kb sync-instructions AGENTS.md
```

Idempotent; re-run when pins change. Text outside the
`<!-- strauss-kb:begin/end -->` sentinels is untouched.

Verified: https://developers.openai.com/codex/hooks, August 2026.
