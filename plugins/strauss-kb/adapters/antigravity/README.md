# strauss-kb — Antigravity CLI adapter

Wires the strauss-kb session-lifecycle layers into Antigravity: the MCP server,
per-turn index injection, tool-level blocking of raw KB file reads, and a rules
file carrying the usage doctrine.

## Install

```bash
npm install -g @saasontools/strauss-kb
cp -R . ~/.gemini/antigravity-cli/plugins/strauss-kb
```

The global install is required — both hook scripts and the MCP registration
shell out to `strauss-kb` / `strauss-kb-mcp` by name.

## What each piece does

| File              | Layer                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp_config.json` | Registers `strauss-kb-mcp` (stdio, no env). Tool descriptions travel with every request, so they survive compaction when nothing else does. |
| `hooks.json`      | `PreInvocation` injects the pinned index each turn. File-read blocking ships as a script but is not wired — opt in below.                   |
| `scripts/`        | Thin JSON-protocol wrappers around `strauss-kb context` and the shared path-matching logic.                                                 |
| `rules/`          | The usage doctrine — Antigravity's analogue of a skill; rules are re-read where conversations are not.                                      |

**Per-turn injection is always-inject, deliberately.** Antigravity has no
session-start event — `PreInvocation` fires every turn — so the hook emits the
index-only block under the tight `turn` profile (2,500 tokens built-in;
override per repo under `context.turn` in `.strauss/kb-pins.json`) as an
`ephemeralMessage`.
The block's stable heading makes each injection read as a refresh rather than a
contradiction, and being per-turn it also makes post-compaction re-injection
moot. If a workspace's pinned index is large enough that per-turn injection
costs too much, unpin down to the bases the work actually touches, or rely on
the AGENTS.md sentinel block instead:

```bash
strauss-kb sync-instructions AGENTS.md
```

**File-read blocking is opt-in.** Blocking reads on project paths is a
workspace policy, not something a plugin should impose on every workspace it is
installed into — so `scripts/block-kb-reads.mjs` ships unwired and you choose
where and how much to apply it. Add a `PreToolUse` entry to the workspace's
`.agents/hooks.json` (workspace-scoped — the most granular placement) or merge
it into this plugin's `hooks.json` (every workspace), and pick the matcher
width: `view_file` alone for the tightest policy, or the full read surface:

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

Antigravity does not document its hook payload's field names, so the script
tests every string in `tool_input` as a path rather than trusting one key, and
answers with `{"decision": "deny", "reason": ...}` — the reason reaches the
model at the exact point of violation. Everything unexpected fails open: no
manifest, no pins, malformed input, or a missing CLI produce `{}` and a normal
turn.

**Known side door:** `run_command` can `cat` a record file. Parsing shell
commands for KB paths is deliberately out of scope — the rules file and the
tool descriptions are the mitigation.

Verified against https://antigravity.google/docs/hooks and
/docs/cli/plugins as of August 2026; the hook payload shape and exit-code
semantics are undocumented there, which is why the scripts parse defensively
and fail open.
