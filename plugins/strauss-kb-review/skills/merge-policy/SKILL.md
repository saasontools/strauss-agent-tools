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
`human` only on an `APPROVED` review of that SHA from an `owners` login; a bad
flag exits 2. **A merge step reads `mode`, never the exit code** — a dry run
exits 0 whatever it would have done. It never waives human review, never
records a route a human signs off, never reads the policy from the head branch,
and never reads approval from a `kb verify` under a `human:` actor.

`--write-record` lands `decision.merge-<pr>` as `agent:merge-policy`, only for
a route no human signs off and only under `--enforce`; a rerun writes a
numbered sibling that supersedes the last. `--report-out FILE` renders the
block behind `<!-- strauss-kb merge-policy -->`, `--summary` appends it to
`$GITHUB_STEP_SUMMARY`, `--pr-url` links each record. No deck is built here —
[review-walkthrough](../review-walkthrough/SKILL.md) renders one from the same
records.

## Dry run

`enabled: dry-run`, or `--dry-run` over any policy, runs the check on every PR
and records what it **would** have done: the JSON and the block carry
`mode: "dry-run"` and `would`, never `route`; `--write-record` lands nothing.

A dry run is **blind** unless `--visible`. A verdict a reviewer reads first
anchors the review, so `would` reads `<withheld>` in the block, the table and
the JSON until `--approvals` shows a submitted review of the head SHA — any
state, from a person: an account of type `Bot`, a `*[bot]` login and any
`--bot-logins a,b` name are this step's own machinery, not a read. `--blind`
asks for the same anywhere; both flags at once exit 2.

`--labels` (`[{name}]`) and `--reactions` (`[{content, user}]`, on the sticky
comment) are how a human contradicts the route: a `policy:would-not-auto` label
or a 👎, from a login the same three rules do not exclude, is a disagreement.

## Calibration

`--calibrate [--since ISO] [--repo SLUG]` reads the dry-run events out of
`~/.strauss/telemetry/<slug>/` and prints the false-auto rate — PRs where
`would` was unattended and a human disagreed, over that route's total, with
`n` — per class and per rule, grouped by `policyHash` so a policy change starts
the count over. Only a run that named a `--pr` counts, and
`STRAUSS_TELEMETRY=off` recorded nothing at all, so it exits 2.

**Flip a class to `auto` only once its false-auto rate is at or under
`calibration.maxFalseAuto` over at least `calibration.window` PRs** — 0% over
20 by default, and the table's `verdict` column says `ready` or `hold`.

## CI

Dry-run on `pull_request`, one sticky comment per PR, the JSON as an artifact:

```yaml
merge-policy:
  runs-on: ubuntu-latest
  permissions: { contents: read, pull-requests: write }
  env: { PLUGIN: "${{ github.workspace }}/plugins/strauss-kb-review" }
  steps:
    - { uses: actions/checkout@v5, with: { fetch-depth: 0 } }
    - run: |
        export GH_TOKEN='${{ github.token }}' R=$GITHUB_REPOSITORY PR=${{ github.event.number }} S=${{ github.event.pull_request.head.sha }}
        gh api --paginate "repos/$R/pulls/$PR/reviews" > reviews.json
        gh api --paginate "repos/$R/issues/$PR/labels" > labels.json
        id=$(gh api --paginate "repos/$R/issues/$PR/comments" --jq '.[]|select(.body|startswith("<!-- strauss-kb merge-policy -->"))|.id' | head -1)
        if [ -z "$id" ]; then echo '[]' > reacts.json; else gh api --paginate "repos/$R/issues/comments/$id/reactions" > reacts.json; fi
        node "$PLUGIN/skills/merge-policy/scripts/merge-policy.mjs" --range "origin/$GITHUB_BASE_REF..$S" --pr "$PR" --dry-run --approvals reviews.json --labels labels.json --reactions reacts.json --report-out c.md --json > policy.json
        if [ -z "$id" ]; then gh api "repos/$R/issues/$PR/comments" -F body=@c.md; else gh api -X PATCH "repos/$R/issues/comments/$id" -F body=@c.md; fi
    - uses: actions/upload-artifact@v5
      with: { name: merge-policy, path: policy.json }
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
  "calibration": { "window": 20, "maxFalseAuto": 0 },
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
and floors rise, `review.exclude` unions, `calibration` widens the window and
lowers the cap it names, the `auto` allowlist and `verifiers` narrow to the
intersection of the first layer to name them (silence above lets a deeper one
name some, which is a narrowing), anything else it names wins. A key outside
the closed set is an error.
**JSON is canonical**: the YAML subset cannot read a key holding a colon, so a
`.yaml` policy's floors fall back to the built-ins and `notChecked` says so,
and a `tags` or `types` key with a colon errors out. A bad value routes
`human`; `human.types`/`human.tags` read as `human` for one release.
