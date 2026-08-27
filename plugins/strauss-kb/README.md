# StraussKb plugin

Keep durable project knowledge as markdown records with standing, supersession,
and trace.

One directory, three plugin formats — nothing collides:

| Client                                                                 | Manifest                     | Skills    | MCP config  |
| ---------------------------------------------------------------------- | ---------------------------- | --------- | ----------- |
| Agent Plugins 1.0 (ChatGPT, Codex CLI, Cursor, Copilot, VS Code, Kiro) | `plugin.json`                | `skills/` | `mcp.json`  |
| Claude Code                                                            | `.claude-plugin/plugin.json` | `skills/` | `.mcp.json` |
| Codex                                                                  | `.codex-plugin/plugin.json`  | `skills/` | `.mcp.json` |

## Prerequisite

```bash
npm install -g @saasontools/strauss-kb
```

Required: the plugin's MCP server (`strauss-kb-mcp`) and the CLI the skills
and hooks shell out to (`strauss-kb`) come from this one package and must be
the same version. See the [package README](../../packages/strauss-kb/README.md)
for the alternatives to a global install.

## Install

Claude Code:

```
/plugin marketplace add https://github.com/saasontools/strauss-agent-tools
/plugin install strauss-kb@saasontools
```

Codex: add the marketplace from `.agents/plugins/marketplace.json`, then
install `strauss-kb`.

The MCP server needs no install: it is launched with `npx` against
`@saasontools/strauss-kb@0.x`, so a session picks up each release without
anyone updating anything.

The **CLI is a separate matter**. The SessionStart hook runs `strauss-kb
context`, and the skill's examples shell out to `strauss-kb`, both resolved
from `PATH`. Install it, and keep it current:

```bash
npm install -g @saasontools/strauss-kb@latest
```

`strauss-kb --version` reports what is installed.

One resolution rule is worth knowing, because it decides which build actually
runs: `npx` prefers a project's `node_modules/.bin`, then a global binary of
the same name, and only fetches when neither exists. In a repo that depends on
this package the pinned copy wins — usually what that repo wants, but it means
`0.x` is a ceiling there, not a promise of latest.

Both runtimes launch the binary off a global install rather than through
`npx`, so install the package too — and keep it current, because the plugin
and the package update from different places and neither prompts for the
other:

```bash
npm install -g @saasontools/strauss-kb@^0.1.6
```

Skew is quiet by design: the SessionStart hook fails open, so an outdated
binary produces no output rather than an error. `strauss-kb --version` reports
what is installed; the MCP server reports the same value as `serverInfo.version`.
This plugin is built against **0.1.6**.

## What it adds

**MCP server** — `strauss-kb-mcp` over stdio, no API key, one tool per
command (`kb_load`, `kb_query`, `kb_write`, … see the package README).

**Skill** — `knowledge-base`: how to read standing, load before search, when
to write. Skills are re-read where conversations are not, so this survives
compaction.

**SessionStart hook** — runs `strauss-kb context` at every context birth.
`startup|resume|clear` use the `session-start` profile (small bases arrive
whole); `compact` uses the tighter `compact` profile (index only). Fails
open: no pins or no CLI means no output, no noise. Budgets and per-pin
behavior are configured in the repo's `.strauss/kb-pins.json`, not in the
hook:

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

Pin options (`mode`, `profiles`, `frozen`), the local/user manifest layers,
and budget resolution are documented in the
[package README](../../packages/strauss-kb/README.md#living-in-an-agent-session).

## Blocking raw KB reads (opt-in)

Record files must be read through the tools — a superseded record file reads
exactly like a current one. The plugin does not enforce this by itself
(blocking reads is workspace policy); pick one:

1. **Deny rules** — no script, in `.claude/settings.json`. Preferred. Static:
   add a line per pinned base.

   ```json
   {
     "permissions": {
       "deny": ["Read(.strauss/kb/**)", "Read(docs/kb/**)"]
     }
   }
   ```

2. **The shipped hook script** — follows the pin manifests automatically and
   tells the model _why_ at the point of violation instead of a silent deny.
   Copy [`hooks/scripts/block-kb-reads.mjs`](./hooks/scripts/block-kb-reads.mjs)
   (self-contained, node builtins only) to `.claude/hooks/` and add:

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

   Widen the matcher to `"Read|Glob|Grep"` to also catch searches whose
   explicit `path` points into a base. The script blocks `INDEX.md` too,
   allows pathless searches rather than over-blocking, and fails open on
   anything unexpected.

Known side door: Bash (`cat .strauss/kb/x.md`). Neither option parses shell
commands, deliberately — the skill and tool descriptions are the mitigation.

## Other runtimes

[adapters/](./adapters/) carries [Codex CLI](./adapters/codex/) (SessionStart
hooks incl. `compact`, AGENTS.md sentinel block) and
[Antigravity CLI](./adapters/antigravity/) (a full plugin: per-turn injection,
opt-in read blocking, rules file). The cross-runtime constant is
`strauss-kb sync-instructions AGENTS.md`.

`STRAUSS_KB_ACTOR` names the writer in each base's `log.jsonl`.

## License

MIT © Assaf Kamil. Part of [strauss-agent-tools](https://github.com/saasontools/strauss-agent-tools).
