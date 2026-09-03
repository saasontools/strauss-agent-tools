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
npm install -g @saasontools/strauss-kb@^0.1.9
```

Skew is quiet by design: the SessionStart hook fails open, so an outdated
binary produces no output rather than an error. `strauss-kb --version` reports
what is installed; the MCP server reports the same value as `serverInfo.version`.
This plugin is built against **0.1.9**.

## What it adds

**MCP server** — `strauss-kb-mcp` over stdio, no API key, one tool per
command (`kb_load`, `kb_catalog`, `kb_pack`, `kb_query`, `kb_impact`,
`kb_backlinks`, `kb_write`, … see the package README).

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

That is the only hook the plugin wires. Three more scripts ship with it,
opt-in — below.

## Opt-in workspace hooks

A matcher matches a tool _name_, and the plugin installs per user, so anything
wired here fires in every repo. Wire the ones a workspace wants: copy the
script from [`hooks/scripts/`](./hooks/scripts/) (node builtins only) to
`.claude/hooks/`, add its entry to `.claude/settings.json`. Each runs ~40 ms
on an unrelated write (node startup); nothing is read or spawned unless the
path is inside a bundle. All fail open, and none parses `Bash` — `cat .strauss/kb/x.md` stays a
deliberate side door.

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
hooks incl. `compact`, AGENTS.md sentinel block) and
[Antigravity CLI](./adapters/antigravity/) (a full plugin: per-turn injection,
opt-in read blocking, rules file). The cross-runtime constant is
`strauss-kb sync-instructions AGENTS.md`.

`STRAUSS_KB_ACTOR` names the writer in each base's `log.jsonl`.

## License

MIT © Assaf Kamil. Part of [strauss-agent-tools](https://github.com/saasontools/strauss-agent-tools).
