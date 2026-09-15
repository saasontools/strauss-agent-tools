---
name: kb-review
description: How a reviewer agent reads and writes the companion knowledge base beside the diff it reviews — load the records on its hunks, check each against the code, write risks, verifications and disputes under its own actor. Preload into every reviewer agent (`skills: [kb-review]`). Not for writing the author's records — that is review-companion — and not a review procedure of its own.
---

# kb-review

You are a reviewer for one area or dimension. This skill is the part of your
job that touches `.strauss/kb`: what to read before you judge a hunk, and
what to write back so the next participant builds on it. Your own review
procedure is unchanged.

Skip everything below when the branch has no `.strauss/kb`.

## Identity

Your name is the `name` of your agent definition; in the base you are
`agent:<name>`. The repository's roster in `.strauss/kb-pins.json` says what
that name may do:

```json
{
  "reviewers": {
    "security": { "tags": ["review:security"], "mayBlock": true }
  }
}
```

`tags` are the record tags in your scope; `mayBlock` is whether you may write
a `blocking` risk. Not on the roster: read, write nothing, say so.

## Load, then query

`kb_load` is your first call on the base, before any hunk is judged. The
reviewer gate denies a write, and blocks the turn, until it has seen one
(`kb_load`, or `strauss-kb load`). Refused over budget: take the index and
`kb_query` what you need. Then, for the range:

1. `strauss-kb match --git <base>..<head>` — the records on each hunk. Keep
   the files in your scope.
2. `kb_query` by your `tags` — records in your dimension that sit on no hunk.
3. `kb_trace` / `kb_backlinks` — only on a record you are about to dispute.

Read the anchor before trusting a record. A record is a claim about code, not
evidence.

## Check

For each record on a hunk in your scope:

| Ask                                 | Fails when                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| Is the rejected alternative real?   | No `## Rejected`, or the rationale restates the title                                   |
| Does the mitigation exist?          | It names code the anchor does not contain                                               |
| Does an invented requirement hold?  | No ticket, no `source`, and no `assumption: true`                                       |
| Does the ignored standard say that? | `kb_trace` the standard; it says something else                                         |
| Do the verify commands pass?        | Any `strauss_verify` or `## Verification` command fails                                 |
| Is `decision.none` honest?          | Its reason is a formality, or names none of the changed files                           |
| Does the record say something?      | The body is the diff retyped, or every record is a stub written at the end              |
| Is the base graded?                 | Every risk is `non-blocking`, or every record claims high confidence                    |
| Are two records one?                | Two records on this diff say the same thing                                             |
| Is one record carrying the change?  | One record anchors most of the changed symbols, or only the tests                       |
| Is a big change explained?          | A new file or a long hunk, or a wide change under one symbol, covered by a `fact` alone |
| Is timing or state reasoned about?  | Retry, cache, lock or fan-out logic changed with no risk or decision on it              |

The gate holds the mechanical checks; the rows from `decision.none` down are
yours, since only a reader can make them.

Verdict per record: `verified`, `disputed` (claim may hold, reasoning does
not), `lies` (anchor contradicts the record), `unverified` (nothing ran).

## Write

Every write goes through the CLI with your actor set on the command, never
through the MCP write tools (they land as actor `mcp`):

```bash
STRAUSS_KB_ACTOR=agent:<name> strauss-kb <verb> --bundle .strauss/kb …
```

| You found                            | You write                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| A risk the author did not record     | `write risk` — `materiality`, an anchor, your `tags` plus `review`                     |
| A claim you checked and it holds     | `verify <id> --note "<what you checked>"`                                              |
| A dispute, or a claim you refute     | `write open-question` — `owner` the author's actor from `kb_log`, a default assumption |
| An anchor that moved, content intact | `anchor-resolve <id> --rebaseline`                                                     |

Shapes and one example of each: [references/write-back.md](references/write-back.md).

Never: write a `decision` (the author's, or a human's); edit, `status` or
`answer` another actor's record — settling it is theirs or a human's; verify
under any actor but yours. A refutation is a question beside the record, not
an edit of it.

`strauss-kb validate` or `doctor --strict` failing: write nothing, report
`unvalidated-base`, and route it to `kb-fix`.

## Report

End your review with one fenced `kb` block, then your usual summary:

````markdown
```kb
{
  "actor": "agent:security",
  "sha": "<head sha you reviewed>",
  "records": { "risk.checkout-retry-double-charge": { "verdict": "verified", "note": "" } },
  "written": [{ "op": "write", "type": "risk", "conceptId": "risk.token-reuse" }],
  "partial": false,
  "reason": null
}
```
````

`sha` is the head you read; merge-policy drops a block on any other commit.
`reason` is `budget` or `unvalidated-base`. Out of budget: write one
`open-question` — "review incomplete: <what was not covered>" — and set
`partial: true`. Degrade toward "needs human", never toward "clean".

## Not this

- A review with no companion base: skip the skill, review as usual.
- Writing the records a reviewer will read: `review-companion`.
- Repairing a base that fails validation: `kb-fix`.
- Deciding whether the PR merges: `merge-policy`.
