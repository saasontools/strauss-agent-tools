# strauss-kb — Antigravity CLI adapter

Wires strauss-kb into Antigravity: the MCP server, per-turn index injection,
tool-level blocking of raw KB file reads, and a rules file carrying the usage
doctrine.

## Install

```bash
npm install -g @saasontools/strauss-kb
cp -R . ~/.gemini/antigravity-cli/plugins/strauss-kb
```

Global install required: hook scripts and MCP registration shell out to
`strauss-kb` / `strauss-kb-mcp` by name.

## What each piece does

| File              | Layer                                                                         |
| ----------------- | ----------------------------------------------------------------------------- |
| `mcp_config.json` | Registers `strauss-kb-mcp` over stdio via `npx`, so it tracks releases.       |
| `hooks.json`      | `PreInvocation` injects the pinned index each turn. Read blocking is unwired. |
| `scripts/`        | Thin JSON-protocol wrappers around `strauss-kb context` and path-matching.    |
| `rules/`          | The usage doctrine — Antigravity's analogue of a skill.                       |

**Per-turn injection is always-on** — Antigravity has no session-start event,
so `PreInvocation` fires every turn, emitting the index-only block under the
tight `turn` profile (2,500 tokens; override under `context.turn` in
`.strauss/kb-pins.json`) as an `ephemeralMessage`. If the pinned index is too
large, unpin down to the bases the work touches, or use the AGENTS.md
sentinel instead:

```bash
strauss-kb sync-instructions AGENTS.md
```

**File-read blocking is opt-in.** `scripts/block-kb-reads.mjs` ships unwired;
add a `PreToolUse` entry to `.agents/hooks.json` or this plugin's
`hooks.json`. Matcher width: `view_file` alone, or the full read surface:

```json
{
  "strauss-kb-block-reads": {
    "PreToolUse": [
      {
        "matcher": "view_file|grep_search|find_by_name|list_dir",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.gemini/antigravity-cli/plugins/strauss-kb/scripts/block-kb-reads.mjs",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

Antigravity does not document its hook payload field names, so the script
tests every string in `tool_input` as a path, answering with
`{"decision": "deny", "reason": ...}`. Unexpected input fails open, as `{}`.

**Known side door:** `run_command` can `cat` a record file — the rules file
and tool descriptions are the only mitigation.

Verified against https://antigravity.google/docs/hooks and /docs/cli/plugins,
August 2026.
