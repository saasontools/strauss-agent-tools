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

This is required, not optional. Both surfaces the plugin exposes come from that
one package — the MCP server `strauss-kb-mcp` and the `strauss-kb` CLI that the
skills shell out to — and they must be the same installed version. Launching the
server through `npx` while the skills call a globally installed CLI would put two
versions of the same store in one session.

See the [package README](../../packages/strauss-kb/README.md) for why a global
install is the supported path, and for the two alternatives that also work.

## Install

### Claude Code

```
/plugin marketplace add https://github.com/saasontools/strauss-agent-tools
/plugin install strauss-kb@saasontools
```

### Codex

Add the marketplace from this repository (`.agents/plugins/marketplace.json`),
then install `strauss-kb`.

## What it adds

**MCP server** — `strauss-kb-mcp` over stdio, no API key and no required
environment. Fifteen tools, one per command: `kb_load`, `kb_query`, `kb_trace`,
`kb_write`, `kb_write_decision`, `kb_no_decision`, `kb_status`, `kb_supersede`,
`kb_answer`, `kb_list`, `kb_index`, `kb_log`, `kb_validate`, `kb_schema`,
`kb_types`.

**Skills**

| Skill            | For                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `knowledge-base` | Reading and writing records: what standing means, load before search, why a rejected record is never an answer. |

`STRAUSS_KB_ACTOR` names the writer in each base's `log.jsonl`; it defaults to
`mcp` for the server and `unknown` for the CLI.

## License

MIT © Assaf Kamil. Part of [strauss-agent-tools](https://github.com/saasontools/strauss-agent-tools).
