---
name: merge-policy
description: Decide deterministically who reviews a pull request — auto, agent review then auto, or a human — from the strauss-kb companion base, the classifier, the review gate and the GitHub reviews API. Use when asking whether a branch can merge without a human, which route CI should take, or why a range was escalated.
---

# Merge policy

**Who reviews this range, and what do they read first?** The answer is `auto`,
`agent-review-then-auto` or `human`, computed from the records: no model reads
anything here, and no input can remove `human`. Sixteen rules settle it, first
match wins; the table is the header of
[`lib/rules.mjs`](./scripts/lib/rules.mjs).
Three of them — an author closing their own `review`, a record gone missing, a
change no record covers — and the approval read in
[`lib/enforce.mjs`](./scripts/lib/enforce.mjs) refuse to take the author's word
for who reviewed: an actor string is forgeable.

```sh
node "$CLAUDE_PLUGIN_ROOT/skills/merge-policy/scripts/merge-policy.mjs" \
  --range main..HEAD --json
```

`--repo-root` defaults to the cwd, `--bundle` to `<repo-root>/.strauss/kb`, and
`--policy` to `.strauss/merge-policy.json` then `.yaml`. `--reviewer`, `--gate`,
`--approvals` and `--decider` take a path or the JSON itself; without `--gate`
the gate's own `--report` runs. `strauss-kb` comes from `$STRAUSS_KB_BIN`, else
`PATH`. `--decider` takes a second agent's verdict on the reviewer's work,
which may only add `human`: `escalate` matches `decider-escalate`, `concur`
matches nothing, and a `sha` that is not the head is dropped with a
`notChecked` line. Producing one is [merge-decide](../merge-decide/SKILL.md).

`--enforce` makes the route the exit code: `auto` passes,
`agent-review-then-auto` only when `--reviewer`'s `sha` is the head SHA, and
`human` only on an `APPROVED` review of that SHA from an `owners` login; a bad
flag exits 2. **A merge step reads `mode`, never the exit code** — a dry run
exits 0 whatever it would have done. It never waives human review, never reads
the policy from the head branch, and never reads approval from a `kb verify`
under a `human:` actor.

`--write-record` lands the record `decision.merge-<pr>` under the actor
`agent:merge-policy`, only for a route that needs no human and only under
`--enforce`; a rerun writes a numbered sibling that supersedes the last. `--report-out FILE` renders the
block behind `<!-- strauss-kb merge-policy -->`, `--summary` appends it to
`$GITHUB_STEP_SUMMARY`, `--pr-url` links each record. No deck is built here —
[review-walkthrough](../review-walkthrough/SKILL.md) renders one from the same
records.

## Dry run

`enabled: dry-run`, or `--dry-run` over any policy, runs the check on every PR
and reports what it **would** have done, enforcing nothing: the JSON and the
block carry `mode: "dry-run"` and `would`, never `route`; `--write-record`
lands nothing.

A dry run is **blind** unless `--visible`: a verdict the reviewer reads first
anchors the review, so `would` reads `<withheld>` in the block, the table and
the JSON until a person has reviewed — `--approvals` showing a submitted review
of the head SHA, in any state. An account of type `Bot`, a `*[bot]` login and
any `--bot-logins a,b` name are this step's own machinery, not a person.
`--blind` withholds the same way outside a dry run; both flags at once exit 2.

`--labels` (`[{name}]`) and `--reactions` (`[{content, user}]`, on the sticky
comment) are how a human contradicts the route: a `policy:would-not-auto` label
or a 👎, from a login those same three bot rules do not exclude, is a
disagreement.

The block ends in a fenced JSON verdict behind
`<!-- strauss-kb merge-policy:verdict -->` — `would`, `rule`, `classes`,
`policyHash`, `headSha` — the only place a dry run's answer is persisted, and
what `--calibrate` reads back.

## Calibration

Dry runs pile up to answer one question: is a class safe to flip to `auto` yet?
`--calibrate DUMP.json` reads their verdicts back out of the PRs'
sticky comments and prints the false-auto rate — of the PRs a route would have
merged without a human, the share a human then contradicted, with `n` — per
class and per rule, grouped by `policyHash`, one group `current` and every
other `stale (policy changed)`.

**Flip a class to `auto` only once its false-auto rate is at or under
`calibration.maxFalseAuto` over at least `calibration.window` observations of
it** — a minimum sample size, not a recency window; 0% over 20 by default.
Only the current group's `verdict` column can read `ready` rather than `hold`.

Silence is never agreement: a PR whose comment names no verdict — none posted,
one still withheld, one unreadable — is left out of the totals. Nothing is
keyed on the head SHA, so a 👎 or label left on an earlier head still counts,
and only toward `human`.

Collecting the dump, its shape, and the CI job that produces the comments:
[references/ci.md](./references/ci.md).

## Policy file

```json
{
  "enabled": "dry-run",
  "owners": ["dana"],
  "verifiers": ["agent:reviewer"],
  "types": { "open-question": "human", "fact": "auto" },
  "tags": { "review:security": "human" },
  "floors": { "review:data": "important" },
  "auto": { "classes": ["test", "docs"], "paths": ["**/*.lock"] },
  "review": { "include": ["src/**"], "exclude": ["old/**"], "crossing": "off" },
  "calibration": { "window": 20, "maxFalseAuto": 0 },
  "overrides": [{ "paths": ["billing/**"], "types": { "decision": "human" } }]
}
```

Default deny: nothing is `auto` unless a layer named it, and a missing file
routes `human`. `types` and `tags` take `off | human | auto` — ignored, routes
to a human, or auto-eligible once it clears `floors`. `review.crossing`
(`off | human`) counts an excluded file as included when it imports an included
one. `verifiers`, when named, is an allowlist: only those actors' verifies
count, and never the writer's; unnamed, any non-author verify counts.
`overrides` apply to the paths this range touched.

Policy is three layers — `$STRAUSS_MERGE_POLICY_DEFAULTS`, then the repo file,
then its `overrides` — reported as `policy.layers` and hashed together as
`policy.hash`. A deeper layer may only escalate: `enabled`
(`dry-run | true | false`), `crossing`, dispositions and floors rise,
`review.exclude` unions, `calibration` raises the minimum and lowers the cap it
names, the `auto` allowlist and `verifiers` intersect with
what the layer above named, and any other key it names wins. A key outside the
closed set is an error.
**JSON is canonical**: the YAML subset cannot read a key holding a colon, so a
`.yaml` policy's floors fall back to the built-ins and `notChecked` says so,
and a `tags` or `types` key with a colon errors out. A bad value routes
`human`; the older `human.types` / `human.tags` still read as `human` for one
release.
