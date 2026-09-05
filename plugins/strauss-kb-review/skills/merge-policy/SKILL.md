---
name: merge-policy
description: Decide deterministically who reviews a pull request — auto, agent review then auto, or a human — from the strauss-kb companion base, the classifier, the review gate and the GitHub reviews API. Use when asking whether a branch can merge without a human, which route CI should take, or why a range was escalated.
---

# Merge policy

**Who reviews this range, and what do they read first?** No model reads
anything here, no input can remove `human`, and the rows that decide — first
match wins — are the header of [`lib/rules.mjs`](./scripts/lib/rules.mjs). Four
of them, and the approval read in
[`lib/enforce.mjs`](./scripts/lib/enforce.mjs), exist because an actor string
is forgeable.

```sh
node "$CLAUDE_PLUGIN_ROOT/skills/merge-policy/scripts/merge-policy.mjs" \
  --range main..HEAD --json
```

`--repo-root` defaults to the cwd, `--bundle` to `<repo-root>/.strauss/kb`, and
`--policy` to `.strauss/merge-policy.json` then `.yaml`. `--reviewer`, `--gate`,
`--approvals` and `--decider` take a path or the JSON itself; without `--gate`
the gate's own `--report` runs. `strauss-kb` comes from `$STRAUSS_KB_BIN`, else
`PATH`. `--decider` is a fresh-eye verdict that may only add `human`: its
`escalate` matches `decider-escalate`, `concur` matches nothing, and a `sha`
that is not the head is dropped with a `notChecked` line. Producing one is
[merge-decide](../merge-decide/SKILL.md).

`--enforce` makes the route the exit code: `auto` passes,
`agent-review-then-auto` only when `--reviewer`'s `sha` is the head SHA, and
`human` only on an `APPROVED` review of that SHA from an `owners` login;
`enabled: dry-run` always passes, a bad flag exits 2. It never waives human
review, never records a route a human signs off, never reads the policy from
the head branch, and never reads approval from a `kb verify` under a `human:`
actor.

`--write-record` lands `decision.merge-<pr>` as `agent:merge-policy`, only for
a route no human signs off and only under `--enforce`; a rerun writes a
numbered sibling that supersedes the last. `--report-out FILE` renders it
behind `<!-- strauss-kb merge-policy -->`, `--summary` appends that to
`$GITHUB_STEP_SUMMARY`, `--pr-url` links each record. No deck is built here;
after the fact, [review-walkthrough](../review-walkthrough/SKILL.md)'s
`render.mjs --range <base>..<sha> --pr <url> --out deck.html` renders one from
the same records. One sticky comment per PR:

```sh
id=$(gh api "repos/$R/issues/$PR/comments" --jq \
  'map(select(.body|startswith("<!-- strauss-kb merge-policy -->")))[0].id')
if [ "$id" = null ]; then
  gh api "repos/$R/issues/$PR/comments" -F body=@report.md
else
  gh api -X PATCH "repos/$R/issues/comments/$id" -F body=@report.md
fi
```

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
  "overrides": [{ "paths": ["billing/**"], "types": { "decision": "human" } }]
}
```

Default deny: nothing is `auto` unless a layer named it, and a missing file
routes `human`. `types`/`tags` take `off | human | auto` — ignored, routes, or
auto-eligible under `floors`. `review.crossing` (`off | human`) makes an
excluded file importing an included one count as included; `verifiers` named is
an allowlist — only those actors' verifies count, never the writer's — unnamed,
any non-author verify counts; `overrides` key on the paths this range touched.

Those three layers — `$STRAUSS_MERGE_POLICY_DEFAULTS`, the repo file, the
overrides — are `policy.layers`, hashed together as `policy.hash`. A deeper one
only escalates: `enabled` (`dry-run | true | false`), `crossing`, dispositions
and floors rise, `review.exclude` unions, the `auto` allowlist and `verifiers`
narrow to the intersection of the first layer to name them (silence above lets
a deeper one name some, which is a narrowing), anything else it names wins. A
key outside the closed set is an error.
**JSON is canonical**: the YAML subset cannot read a key holding a colon, so a
`.yaml` policy's floors fall back to the built-ins and `notChecked` says so,
and a `tags` or `types` key with a colon errors out. A bad value routes
`human`; `human.types`/`human.tags` read as `human` for one release.
