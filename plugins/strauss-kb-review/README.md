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

**`review-walkthrough`** — the base and the diff rendered as one HTML review
guide for a human.

**`kb-fix`** — a base whose gate findings block, routed to whoever can still
fix them. See [Fixing a base](#fixing-a-base).

**`merge-policy`** — who reviews a range, decided from the records alone.

## Fixing a base

Whoever held the why fixes the base. `skills/kb-fix/` routes between the three
tiers — the author in the blocked turn, the author's subagent in the same
session, and a later session with nobody left — and the gate marks each
`--report` finding `fixable`, so the routing is data. The late tier's mandate,
the one repair it may apply and the `open-question` everything else becomes,
is [`skills/kb-fix/references/late-tier.md`](skills/kb-fix/references/late-tier.md).

## Gate

`hooks/scripts/kb-review-gate.mjs` reads the session's diff and the companion
base and asks one question: did this change record what it owes? Its checks
come in families A–F and are named by id (`B2`, `F4`); each family's checks sit
in the header of its [`lib/family-*.mjs`](./hooks/scripts/lib/).

It blocks on what a record does or does not say — an uncovered change, a
fabricated record, an unearned status move, a `kb_validate` error, a family-F
signal with no record of the type it owes — and warns on the heuristics: sizes,
duplicates, expiry, drift. `--report` prints the same findings and exits 0.

**Arming** takes both halves: copy the entries from
[`hooks/example-hooks.json`](./hooks/example-hooks.json) into
`.claude/settings.json`, and add a `gate` key to `.strauss/kb-pins.json` (or set
`STRAUSS_KB_GATE=1`). Unwired or unkeyed it reads nothing. That key also demotes
a block by id, or switches a check off:

```json
{ "gate": { "warn": ["F4", "C6"], "off": ["B2"], "factOnlyLines": 40 } }
```

## Walkthrough

How to run it, the order it renders and when it refuses:
[`skills/review-walkthrough/SKILL.md`](skills/review-walkthrough/SKILL.md).

`skills/review-walkthrough/scripts/__snapshots__/*.json` pin the page two
`fixtures/companion-repo` scenarios produce. A snapshot diff is a review, not a
failure — read it, decide whether the new page is better, then
`UPDATE_SNAPSHOTS=1` to accept it.

## Merge policy

`skills/merge-policy/scripts/merge-policy.mjs` decides who reviews a commit
range: `auto`, `agent-review-then-auto`, or `human`. Sixteen rules settle it,
first match wins, and the result names the one that matched; the table is the
header of [`lib/rules.mjs`](./skills/merge-policy/scripts/lib/rules.mjs).

`--enforce` turns the route into the exit code, and approval comes from the
GitHub reviews API. The route each `fixtures/companion-repo` scenario produces
is pinned by that scenario's `expected.json`.

## Reviewer hooks

`hooks/scripts/kb-reviewer-gate.mjs` enforces the mechanics the `kb-review`
skill states, on the reviewers the repository's roster names. Everything else
passes through untouched.

| Event                  | What it holds                                                                                                                                                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PreToolUse`           | A base write carries `STRAUSS_KB_ACTOR=agent:<name>`; is a reviewer's kind of write (no decisions, no settling another actor's record, `blocking` only with `mayBlock`); lands on a base `validate` and `doctor --strict` accept, checked once per base state. MCP write tools are denied: they land as actor `mcp`. |
| `Stop`, `SubagentStop` | The turn ends with the skill's fenced `kb` report block.                                                                                                                                                                                                                                                             |

**Who it applies to.** The reviewer's name is the agent's own name, which
both Claude Code and Codex hand a subagent's hooks as `agent_type`. The gate
acts only when that name is under `reviewers` in `.strauss/kb-pins.json`:

```json
{
  "reviewers": {
    "security": { "tags": ["review:security"], "mayBlock": true },
    "perf": { "tags": ["review:performance"] }
  }
}
```

Author sessions, non-roster subagents, and a repository without the key see
no gate. A client that hands hooks no agent name can set
`STRAUSS_KB_REVIEWER=<name>` in the reviewer's environment instead.

**Wiring.** Unwired on purpose: the plugin ships the script and
[`hooks/example-reviewer-hooks.json`](./hooks/example-reviewer-hooks.json), and
the consumer decides which sessions run it.

- _Claude Code_ — copy the entries into `.claude/settings.json` (project) or
  `~/.claude/settings.json`; `${CLAUDE_PLUGIN_ROOT}` resolves inside a
  plugin-installed session, else write the absolute path. Subagent hooks run
  from the same settings; a reviewer agent needs only
  `skills: [kb-review]` in its frontmatter.
- _Codex_ — same JSON into `<repo>/.codex/hooks.json` or `~/.codex/hooks.json`
  (inline `[hooks]` in `config.toml` takes the same shape). Codex refuses a
  non-managed hook until it is trusted through `/hooks`; `exec_command`
  matches as `Bash`, and `transcript_path` may be `null`, in which case the
  Stop check reports itself unchecked and passes.
- _Other clients_ — any harness that passes a Claude-shaped payload on stdin
  (`hook_event_name`, `tool_name`, `tool_input.command`, `cwd`, `agent_type`)
  and reads `hookSpecificOutput.permissionDecision` or `{"decision":"block"}`
  works as is; set `STRAUSS_KB_REVIEWER` when it has no `agent_type`.
  Antigravity's `.agents/hooks.json` is one; see the strauss-kb plugin's
  [adapters](../strauss-kb/adapters/) for that file's shape.

Windows: the commands are `node "<path>"`, no shell built-ins, so they run
under `cmd.exe` unchanged.

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
