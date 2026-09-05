---
name: merge-policy
description: Decide deterministically who reviews a pull request — auto, agent review then auto, or a human — from the strauss-kb companion base, the classifier, the review gate and the GitHub reviews API. Use when asking whether a branch can merge without a human, which route CI should take, or why a range was escalated.
---

# Merge policy

**Who reviews this range, and what do they read first?** No model reads
anything here, no input can remove `human`, and the rows that decide — first
match wins — are the header of [`lib/rules.mjs`](./scripts/lib/rules.mjs).

```sh
node "$CLAUDE_PLUGIN_ROOT/skills/merge-policy/scripts/merge-policy.mjs" --range main..HEAD --json
```

`--repo-root` defaults to the cwd, `--bundle` to `<repo-root>/.strauss/kb`, and
`--policy` to `.strauss/merge-policy.json` then `.yaml`.

`--enforce` makes the route the exit code: `auto` passes,
`agent-review-then-auto` only when `--reviewer`'s `sha` is the head SHA, and
`human` only on an `APPROVED` review of that SHA from an `owners` login;
`enabled: dry-run` always passes, a bad flag exits 2. It never waives human
review, writes into the base (SAA-744 writes the `decision.merge-<pr>` body it
returns), reads the policy from the head branch, or reads approval from a
`kb verify` under a `human:` actor.

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
excluded file importing an included one count as included; `verifiers` verify
as non-authors, and `overrides` key on the paths this range touched.

Those three layers — `$STRAUSS_MERGE_POLICY_DEFAULTS`, the repo file, the
overrides — are `policy.layers`, hashed together as `policy.hash`. A deeper one
only escalates: dispositions and floors rise, the `auto` allowlist narrows to
the intersection, anything else it names wins.
**JSON is canonical**: the YAML subset cannot read a `tags` or `floors` key's
colon, so a `.yaml` policy's fall back and `notChecked` says so. A bad value
routes `human`; `human.types`/`human.tags` read as `human` for one release.
