---
name: merge-decide
description: Run a fresh-eye decider over a reviewer's output and feed its verdict back into the merge route, where it may add human review and never remove it. Use when a range is about to merge on an agent's word, when asking whether a second model should check the reviewer, or how to spawn the decider so it is not the reviewer twice. Computing the route itself is merge-policy.
---

# Deciding on the reviewer

`merge-policy.mjs` is the deterministic floor. The decider is one more
probabilistic step on top of it, so it holds a veto and no authority: it may
add `human` with a reason, and never take a route the policy set.

## When to run it

```sh
node "$CLAUDE_PLUGIN_ROOT/skills/merge-policy/scripts/merge-policy.mjs" \
  --range main..HEAD --reviewer reviewer.json --json > route.json
```

Only on `auto` or `agent-review-then-auto`, and only after the reviewer. A
`route` of `human` skips the spawn — it cannot get more human, and the run
buys a verdict no rule would read. No reviewer output is the other skip.

## Spawn

Launch `kb-decider` with the bundle path, the range, the repo root, **every**
reviewer actor's output JSON, the classifier dump, `route.json`, the head sha,
a budget half the reviewer's, and one diversity option — the agent escalates
with `no-diversity` if the prompt names neither:

| Option            | Picked when                      | What the decider sees                                                                       |
| ----------------- | -------------------------------- | ------------------------------------------------------------------------------------------- |
| `different-model` | A model the reviewer did not run | Reviewer output first, then the hunks its records anchor to                                 |
| `blind`           | The reviewer's own model family  | The diff hunks only, findings formed, then the author's records compared against them after |

## Feed it back

Re-run the same command with `--decider decider.json` added. It takes a path or
the JSON itself. `escalate` matches `decider-escalate` and routes `human`;
`concur` matches nothing. A `sha` that is not the head is dropped with a
`notChecked` line — a verdict on another commit read another diff. A bad
`verdict`, `reason`, `reliedOn` or `disputes` exits 2: a malformed dump is a
usage error, never a quiet concur. The route's JSON and its table gain
`decider: { present, verdict, reason, model, reliedOn, disputes }`.

## Not this

- Computing the route, or what `.strauss/merge-policy.json` may say:
  [merge-policy](../merge-policy/SKILL.md).
- Running the reviewer whose output this reads: `kb-review`.
- Repairing a base the decider found wanting: `kb-fix`.
