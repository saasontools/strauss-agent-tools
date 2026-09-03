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
npm install -g @saasontools/strauss-kb@^0.1.8
```

`strauss-kb --version` reports what is installed, matching `serverInfo.version`
on the MCP server (built against **0.1.8**). The SessionStart hook fails
open — an outdated CLI produces no output, not an error.

## What it adds

**MCP server** — `strauss-kb-mcp` over stdio, one tool per command (`kb_load`,
`kb_catalog`, `kb_pack`, `kb_query`, `kb_write`, … see the package README).

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

## Blocking raw KB reads (opt-in)

Record files must be read through the tools. Pick one:

1. **Deny rules** — no script, in `.claude/settings.json`. Preferred; add a
   line per pinned base.

   ```json
   {
     "permissions": {
       "deny": ["Read(.strauss/kb/**)", "Read(docs/kb/**)"]
     }
   }
   ```

2. **The shipped hook script** — follows the pin manifests, tells the model
   why. Copy
   [`hooks/scripts/block-kb-reads.mjs`](./hooks/scripts/block-kb-reads.mjs)
   to `.claude/hooks/` and add:

   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Read",
           "hooks": [
             {
               "type": "command",
               "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/block-kb-reads.mjs\""
             }
           ]
         }
       ]
     }
   }
   ```

   Widen the matcher to `"Read|Glob|Grep"` for path-scoped searches too.

Known side door: Bash (`cat .strauss/kb/x.md`).

## Other runtimes

[adapters/](./adapters/) carries [Codex CLI](./adapters/codex/) (SessionStart
hooks incl. `compact`, AGENTS.md sentinel) and
[Antigravity CLI](./adapters/antigravity/) (per-turn injection, opt-in read
blocking, rules file). Constant across both: `strauss-kb sync-instructions
AGENTS.md`. `STRAUSS_KB_ACTOR` names the writer in each base's `log.jsonl`.

## License

MIT © Assaf Kamil. Part of [strauss-agent-tools](https://github.com/saasontools/strauss-agent-tools).
