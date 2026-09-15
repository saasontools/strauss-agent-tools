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

## Two hooks, two files

| File                                                                       | Script                               | Acts on                                                                         | Events                                 |
| -------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------- |
| [`hooks/example-hooks.json`](./hooks/example-hooks.json)                   | `kb-review-gate.mjs`, the author     | the session whose diff it reads: author sessions and their subagents            | `SessionStart`, `Stop`, `SubagentStop` |
| [`hooks/example-reviewer-hooks.json`](./hooks/example-reviewer-hooks.json) | `kb-reviewer-gate.mjs`, the reviewer | only agents named under `reviewers` in `.strauss/kb-pins.json`; all else passes | `PreToolUse`, `Stop`, `SubagentStop`   |

Wire one, the other, or both; they tell their cases apart by event and, for
the reviewer, by `agent_type` against the roster, so an author never meets the
reviewer's rules and a reviewer never meets the author's coverage checks. A
repository with no reviewer agents wires the first only; a CI reviewer job may
wire the second only. Both ship unwired.

**Where the entries go**, for either file:

- _Claude Code_ — `.claude/settings.json` in the repository, or
  `~/.claude/settings.json`. `${CLAUDE_PLUGIN_ROOT}` resolves in a
  plugin-installed session; otherwise write the absolute path to the script.
- _Codex_ — `<repo>/.codex/hooks.json` or `~/.codex/hooks.json`, same JSON
  (inline `[hooks]` in `config.toml` takes the same shape); trust the hook
  through `/hooks` before it runs.
- _Other clients_ — any harness that hands a Claude-shaped payload on stdin and
  reads exit code 2 or the JSON decision; Antigravity's `.agents/hooks.json`
  is one.

The author gate also needs the `gate` key (below); the reviewer gate needs the
roster (below that).

## Gate

`hooks/scripts/kb-review-gate.mjs` reads the session's diff and the companion
base and asks one question: did this change record what it owes? Every check
is a fact of the store or the diff, never a judgment, and its id says what the
finding means; the group is the id's prefix.

| Group       | The finding says                               | Ids                                                                                                                    |
| ----------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `uncovered` | a change no record covers                      | `symbol`, `signal`                                                                                                     |
| `anchor`    | the record does not point at this change       | `file-only`, `outside-diff`, `missing-symbol`, `drifted`                                                               |
| `claim`     | the record asserts what the code does not show | `no-rejection`, `mitigation-absent`, `no-mitigation`, `dead-source`, `unsourced`, `self-verified`                      |
| `standing`  | status moved without the work                  | `closed-same-turn`, `resolved-unmoved`, `self-owned-question`, `supersede-chain`                                       |
| `store`     | the base itself is broken                      | `validate`, `expired`, `dangling-link`                                                                                 |
| `owed`      | the diff carries a signal that owes a record   | `dependency`, `test-silenced`, `suppression`, `build-config`, `contract`, `permissions`, `requirement`, `verification` |

Each check's one-line meaning sits above its function in
[`lib/checks/<group>.mjs`](./hooks/scripts/lib/checks/). Judgments a reader
would make — is this reason too short, are these two records the same, is this
function big enough to ask about — are not here; they are rows in the
`kb-review` skill's check table, where a reviewer answers them. `--report`
prints the same findings and exits 0.

**Whose diff.** The gate reads the worktree's diff since the session's base
commit: everything changed there, whoever changed it. Parallel subagents in
one worktree therefore share one diff. On `SubagentStop` a subagent's fenced
`changed` block (see `review-companion`) scopes the gate to the paths it
declares, after the worktree confirms they changed; undeclared paths fall to
the parent session at its Stop. A line may carry the agent's class for the
change (`src/gen/api.ts generated`); a class that lowers scrutiny is checked
against what the repository says — a `review:*` fact on the hunk or a
`.gitattributes` entry at the base commit (`linguist-generated`,
`linguist-vendored`, `linguist-documentation`, `strauss-class=test|ci|config|lockfile`)
— and blocks until it is written there. For clean attribution run parallel
subagents in their own worktrees.

**Arming** takes both halves: copy the entries from
[`hooks/example-hooks.json`](./hooks/example-hooks.json) into
`.claude/settings.json`, and add a `gate` key to `.strauss/kb-pins.json` (or set
`STRAUSS_KB_GATE=1`). Unwired or unkeyed it reads nothing. That key also demotes
a block by id, or switches a check off:

```json
{
  "gate": {
    "warn": ["owed.suppression", "claim.unsourced"],
    "off": ["anchor.outside-diff"]
  }
}
```

A group name in either list covers every id under it.

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
GitHub reviews API. What `.strauss/merge-policy.json` may hold — dispositions
per record type and tag, materiality floors, auto-eligible paths and classes,
and the layers that may only escalate them — is
[`SKILL.md`](./skills/merge-policy/SKILL.md). The route each
`fixtures/companion-repo` scenario produces is pinned by that scenario's
`expected.json`.

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
