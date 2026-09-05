---
name: merge-policy
description: Decide deterministically who reviews a pull request — auto, agent review then auto, or a human — from the strauss-kb companion base, the classifier, the review gate and the GitHub reviews API. Use when asking whether a branch can merge without a human, which route CI should take, or why a range was escalated.
---

# Merge policy

**Who reviews this range, and what do they read first?** A function of the
records: no model reads anything here, and no input can remove `human`.

```sh
node "$CLAUDE_PLUGIN_ROOT/skills/merge-policy/scripts/merge-policy.mjs" \
  --range main..HEAD --repo-root . --json
```

`--bundle` defaults to `<repo-root>/.strauss/kb`; `--policy` names the policy
file, else `.strauss/merge-policy.json` then `.yaml`. `--reviewer`, `--gate`
and `--approvals` take a path or the JSON itself; without `--gate` the gate's
own `--report` runs. `strauss-kb` comes from `$STRAUSS_KB_BIN`, else `PATH`.

## The route table

Sixteen rows, first match wins, each reporting the rule id that matched — the
header of [`scripts/lib/rules.mjs`](./scripts/lib/rules.mjs). Four of them, and
the approval read in [`lib/enforce.mjs`](./scripts/lib/enforce.mjs), exist
because an actor string is forgeable. The step never waives human review, nor
records a route a human signs off, nor reads the policy from the head branch,
nor reads approval from a `kb verify` under a `human:` actor.

## In CI

`--enforce` makes the route the exit code: `auto` passes; `agent-review-then-auto`
passes only when `--reviewer` was supplied and its run's `sha` is the head SHA;
`human` passes only when `--approvals` holds an `APPROVED` review on the head
SHA from a login in the policy's `owners`. `enabled: dry-run` always passes.
Without `--enforce` the exit code is 0, and a bad flag is 2.

`--write-record` lands `decision.merge-<pr>` as `agent:merge-policy`, only for a
route no human signs off and only under `--enforce`; a rerun writes a numbered
sibling that supersedes the last. `--report-out FILE` renders it behind
`<!-- strauss-kb merge-policy -->`, `--summary` appends that to
`$GITHUB_STEP_SUMMARY`, `--pr-url` links each record. No deck is built here;
after the fact, [review-walkthrough](../review-walkthrough/SKILL.md)'s
`render.mjs --range <base>..<sha> --pr <url> --out deck.html` renders one from
the same records. One sticky comment per PR:

```sh
id=$(gh api "repos/$R/issues/$PR/comments" --jq \
  'map(select(.body|startswith("<!-- strauss-kb merge-policy -->")))[0].id')
[ "$id" = null ] && gh api "repos/$R/issues/$PR/comments" -F body=@report.md \
  || gh api -X PATCH "repos/$R/issues/comments/$id" -F body=@report.md
```

## Policy file

`enabled`, `owners`, `floors` (tag → minimum materiality), `auto.classes`,
`auto.paths`, `human.types`, `human.tags`. **JSON is canonical**: a floor key is
a tag like `review:security`, which the gate's YAML subset cannot read, so a
`.yaml` policy's floors fall back to the defaults and `notChecked` says so. A
missing file, or one naming none of these keys, routes `human`.
