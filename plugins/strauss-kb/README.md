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

Skills are re-read where conversations are not, so the doctrine in them — pin,
reload at point of use, the index is not the content — persists across
compaction.

**Hooks** (`hooks/hooks.json`, Claude Code)

1. **SessionStart** — runs `strauss-kb context` at every context birth. Two
   matcher groups: `startup|resume|clear` injects with `--full-under 1500`, so
   tiny bases arrive whole at a fresh start; `compact` re-injects index-only
   under a tighter budget, because the block is competing with a summary for a
   smaller window. Fail open by construction: no manifest, no pins, or no CLI
   installed produces no output and exit 0 (`2>/dev/null || true`) — zero noise.
2. **PreToolUse** on `Read|Glob|Grep` — `hooks/scripts/block-kb-reads.mjs`
   resolves the target path (relative, absolute, `..`-traversal) and, when it
   falls inside `.strauss/kb` or any base pinned in `.strauss/kb-pins.json`,
   exits 2 with the redirect on stderr, which reaches the model at the exact
   point of violation:

   > KB directories are read via strauss-kb tools only (kb_load / kb_query /
   > kb_trace) — file reads bypass supersession resolution and return replaced
   > records as if current.

   `INDEX.md` is blocked along with the records, for uniformity — the agent
   gets the index through `kb_context` / `kb_index`. A `Grep`/`Glob` with no
   explicit path is allowed rather than over-blocking every project-wide
   search. Everything unexpected — malformed stdin, unreadable manifest —
   fails open; a broken hook must never lock an agent out of its project.

**Known side door: Bash.** This plugin deliberately does not parse shell
commands for KB paths (`cat .strauss/kb/x.md` gets through). Project-level
deny rules are the belt to the hook's suspenders — copy into
`.claude/settings.json`:

```json
{
  "permissions": {
    "deny": ["Read(.strauss/kb/**)", "Read(**/.strauss/kb/**)"]
  }
}
```

**Adapters for other runtimes** live in [adapters/](./adapters/):
[Codex CLI](./adapters/codex/) (SessionStart hooks incl. `compact`, AGENTS.md
sentinel block), [Antigravity CLI](./adapters/antigravity/) (a full plugin:
per-turn PreInvocation injection, PreToolUse blocking, rules file), and
[Gemini CLI](./adapters/gemini/) (legacy: GEMINI.md sentinel block, JSON hook
envelope). The cross-runtime constant is
`strauss-kb sync-instructions AGENTS.md`.

`STRAUSS_KB_ACTOR` names the writer in each base's `log.jsonl`; it defaults to
`mcp` for the server and `unknown` for the CLI.

## License

MIT © Assaf Kamil. Part of [strauss-agent-tools](https://github.com/saasontools/strauss-agent-tools).
