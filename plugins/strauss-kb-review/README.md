# strauss-kb-review plugin

Experimental: strauss-kb as a per-PR review companion — decisions, risks,
invented requirements, review focus. Not yet published.

**Status** — work in progress. Unlisted in both marketplaces on purpose; it
ships no MCP server of its own and has no release track.

One directory, three plugin formats:

| Client                                                                 | Manifest                     | Skills    |
| ---------------------------------------------------------------------- | ---------------------------- | --------- |
| Agent Plugins 1.0 (ChatGPT, Codex CLI, Cursor, Copilot, VS Code, Kiro) | `plugin.json`                | `skills/` |
| Claude Code                                                            | `.claude-plugin/plugin.json` | `skills/` |
| Codex                                                                  | `.codex-plugin/plugin.json`  | `skills/` |

## Requires strauss-kb

The skills call `kb_write_decision`, `kb_no_decision`, `kb_write` and friends,
so install the [`strauss-kb`](../strauss-kb/) plugin alongside this one — it
brings the MCP server these skills drive.

## Skills

**`recording-decisions`** — which choices earn a `kb_write_decision`, what to
attach (sources, anchors, related concepts), and when `kb_no_decision` is the
honest answer.

**`review-companion`** — risks, invented requirements, business flows, and
review-focus marks kept current across a pull request's commits.

**`kb-review`** — what a reviewer agent reads from the companion base before
judging a hunk, and what it writes back under its own actor. Preload it into
every reviewer agent; the repository's roster in `.strauss/kb-pins.json` names
the reviewers and what each may write.
`skills/kb-review/expectations.json` says what a reviewer that preloaded it
writes per fixture scenario; a preloaded skill has no trigger to evaluate.

## Install (unpublished)

Local session, from a checkout of this repo:

```bash
claude --plugin-dir ./plugins/strauss-kb-review
```

The marketplace entry to add when it ships:

```json
{
  "name": "strauss-kb-review",
  "source": "./plugins/strauss-kb-review",
  "description": "Experimental: strauss-kb as a per-PR review companion — decisions, risks, invented requirements, review focus. Not yet published."
}
```

## License

MIT © Assaf Kamil. Part of [strauss-agent-tools](https://github.com/saasontools/strauss-agent-tools).
