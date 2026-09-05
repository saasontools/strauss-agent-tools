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

`agents/` is Claude Code only.

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

**`kb-review`** — collect the inputs, spawn the reviewer agent, print its
verdicts.

**`review-walkthrough`** — the base and the diff rendered as one HTML review
guide for a human.

**`kb-fix`** — see [Fixing a base](#fixing-a-base).

**`merge-policy`** — who reviews a range, decided from the records alone.

**`merge-decide`** — see [Fresh-eye decider](#fresh-eye-decider).

## Reviewer agent

`agents/kb-reviewer.md` (Claude Code only) reviews a pull request against the
base the other two skills wrote, and writes its verdicts back as
`agent:reviewer`. The procedure, the two surfaces it writes through, and the
output shape live there. Per-scenario outcome expectations are in
`agents/kb-reviewer.expectations.json`, for SAA-746's runner to assert against.

## Fixing a base

Whoever held the why fixes the base. `skills/kb-fix/` routes between the three
tiers — the author in the blocked turn, the author's subagent in the same
session, and a fresh `agents/kb-fixer.md` in a later one — and the gate marks
each `--report` finding `fixable`, so the routing is data. The one repair the
late tier may apply, and the `open-question` everything else becomes, live in
`agents/kb-fixer.md`; per-scenario expectations are in
`agents/kb-fixer.expectations.json`.

## Gate

`hooks/scripts/kb-review-gate.mjs` reads the session's diff and the companion
base and asks one question: did this change record what it owes? Every check
sits in the header of its [`lib/family-*.mjs`](./hooks/scripts/lib/).

It blocks on what a record does or does not say — an uncovered change, a
fabricated record, an unearned status move, a `kb_validate` error, an F signal
with no record of the type it owes — and warns on the heuristics: sizes,
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

`scripts/__snapshots__/*.json` pin the deck two `fixtures/companion-repo`
scenarios produce. A snapshot diff is a review, not a failure — read it, decide
whether the new deck is better, then `UPDATE_SNAPSHOTS=1` to accept it.

How to run it, the order it renders and when it refuses:
[`skills/review-walkthrough/SKILL.md`](skills/review-walkthrough/SKILL.md).

## Merge policy

`skills/merge-policy/scripts/merge-policy.mjs` answers one question about a
range: `auto`, `agent-review-then-auto`, or `human`. Seventeen rows, first
match wins, each reporting the rule id it matched; the table is the header of
[`lib/rules.mjs`](./skills/merge-policy/scripts/lib/rules.mjs).

`--enforce` turns the route into the exit code, approval comes from the GitHub
reviews API, and what `.strauss/merge-policy.json` may say — an allowlist over
types, tags, floors, paths, classes and layers — is
[`SKILL.md`](./skills/merge-policy/SKILL.md). With `--write-record` the run also
lands the `decision.merge-<pr>` that `--report-out` renders as the PR's sticky
comment. The route each `fixtures/companion-repo` scenario produces is pinned
by that scenario's `expected.json`.

## Fresh-eye decider

`agents/kb-decider.md` reads a reviewer's output beside the hunks its records
anchor to and answers `concur` or `escalate`. It is an aggregator with a veto
and never an authority: `escalate` matches the `decider-escalate` row and
routes `human`, `concur` matches nothing. Feed its JSON back with
`merge-policy.mjs --decider`; when and how to spawn it, and which of the two
diversity options a repo picks, are [`skills/merge-decide/SKILL.md`](./skills/merge-decide/SKILL.md).

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
