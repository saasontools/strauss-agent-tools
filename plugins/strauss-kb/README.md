# StraussKb plugin

Keep durable project knowledge as markdown records with standing, supersession,
and trace.

One directory, three plugin formats:

| Client                                                                 | Manifest                     | Skills    | MCP config  |
| ---------------------------------------------------------------------- | ---------------------------- | --------- | ----------- |
| Agent Plugins 1.0 (ChatGPT, Codex CLI, Cursor, Copilot, VS Code, Kiro) | `plugin.json`                | `skills/` | `mcp.json`  |
| Claude Code                                                            | `.claude-plugin/plugin.json` | `skills/` | `.mcp.json` |
| Codex                                                                  | `.codex-plugin/plugin.json`  | `skills/` | `.mcp.json` |

## Prerequisite

```bash
npm install -g @saasontools/strauss-kb
```

The MCP server (`strauss-kb-mcp`) and CLI (`strauss-kb`) come from this one
package and must match versions. Alternatives to a global install: the
[package README](../../packages/strauss-kb/README.md).

## Install

Claude Code:

```
/plugin marketplace add https://github.com/saasontools/strauss-agent-tools
/plugin install strauss-kb@saasontools
```

Codex: add the marketplace from `.agents/plugins/marketplace.json`, then
install `strauss-kb`.

The MCP server needs no install (`npx` against `@saasontools/strauss-kb@0.x`).
The SessionStart hook and skill examples shell out to `strauss-kb` from
`PATH` — install it globally and keep it current:

```bash
npm install -g @saasontools/strauss-kb@^0.1.9
```

`strauss-kb --version` reports what is installed, matching `serverInfo.version`
on the MCP server (built against **0.1.9**). The SessionStart hook fails
open — an outdated CLI produces no output, not an error.

## What it adds

**MCP server** — `strauss-kb-mcp` over stdio, one tool per command (`kb_load`,
`kb_catalog`, `kb_pack`, `kb_query`, `kb_impact`, `kb_backlinks`, `kb_write`, …
see the package README).

**Skill** — `knowledge-base`: how to read standing, load before search, when
to write.

**SessionStart hook** — runs `strauss-kb context` at every context birth.
`startup|resume|clear` use `session-start` (small bases arrive whole);
`compact` uses the tighter `compact` profile (index only). Fails open. Budgets
and pins live in `.strauss/kb-pins.json`:

```json
{
  "pins": [
    { "path": "docs/adr", "mode": "full" },
    { "path": "docs/kb", "profiles": ["session-start"] }
  ],
  "context": {
    "session-start": { "fullUnderTokens": 3000 },
    "compact": { "budgetTokens": 1500 }
  }
}
```

Pin options and budget resolution: [package README](../../packages/strauss-kb/README.md#living-in-an-agent-session).

That is the only hook the plugin wires. Four more scripts ship with it,
opt-in — below.

## Opt-in workspace hooks

A matcher matches a tool _name_, and the plugin installs per user, so anything
wired here fires in every repo. Wire the ones a workspace wants: copy the
script from [`hooks/scripts/`](./hooks/scripts/) (node builtins only) to
`.claude/hooks/`, add its entry to `.claude/settings.json`. The three bundle
guards run ~40 ms on an unrelated write (node startup); nothing is read or
spawned unless the path is inside a bundle. All fail open, and none inspects a
`Bash` read — `cat .strauss/kb/x.md` stays a deliberate side door.

**`block-kb-reads.mjs`** (`PreToolUse`, `Read`) — a superseded record file
reads exactly like a current one; records belong to the tools. Widen to
`Read|Glob|Grep` to also catch searches with an explicit `path`. Scriptless
alternative: `"permissions": { "deny": ["Read(docs/kb/**)"] }`.

**`deny-kb-generated-edits.mjs`** (`PreToolUse`, `Write|Edit|MultiEdit`) —
refuses a write to `INDEX.md`, `log.jsonl`, or the search index inside a
bundle root; the store overwrites those. No env opt-out: remove the entry.

**`validate-kb-bundle.mjs`** (`PostToolUse`, same matcher) — runs
`strauss-kb --bundle <dir> validate` after an edit inside a bundle and surfaces
problems as context. Advisory, never blocking. Opt out with
`STRAUSS_KB_NO_VALIDATE_HOOK=1`.

**`kb-stamp-hook.mjs`** (`SessionStart`, `PostToolUse` on `Bash`,
`SubagentStop`) — after a git sync or a sub-agent's own `kb_write`, names a
pinned base that changed since it was loaded; `SessionStart` seeds the state,
in `$TMPDIR/strauss-kb/<session id>.json`. A `Bash` command that is not a git
sync exits on a regex (~31 ms), and a sync whose `git diff` names no pinned
path exits before the CLI is spawned. No env opt-out: remove the entries.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/kb-stamp-hook.mjs\"",
            "timeout": 20
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Read",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/block-kb-reads.mjs\""
          }
        ]
      },
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/deny-kb-generated-edits.mjs\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/validate-kb-bundle.mjs\"",
            "timeout": 65
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/kb-stamp-hook.mjs\"",
            "timeout": 20
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/kb-stamp-hook.mjs\"",
            "timeout": 20
          }
        ]
      }
    ]
  }
}
```

The two write hooks import `kb-bundle.mjs` from the same directory — copy it
too. CLI resolution and directory matching:
[architecture](https://saasontools.github.io/strauss-agent-tools/architecture).

## Other runtimes

[adapters/](./adapters/) carries [Codex CLI](./adapters/codex/) (SessionStart
hooks incl. `compact`, AGENTS.md sentinel) and
[Antigravity CLI](./adapters/antigravity/) (per-turn injection, opt-in read
blocking, rules file). Constant across both: `strauss-kb sync-instructions
AGENTS.md`. `STRAUSS_KB_ACTOR` names the writer in each base's `log.jsonl`.

## License

MIT © Assaf Kamil. Part of [strauss-agent-tools](https://github.com/saasontools/strauss-agent-tools).
