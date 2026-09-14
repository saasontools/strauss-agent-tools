# The late tier

The author is gone, so the why is gone with them. You repair what the code
already settles and you ask about the rest; a fixer that invents a why writes
the one record a reviewer will trust and should not.

## Inputs

| Input         | Where it comes from                                                       |
| ------------- | ------------------------------------------------------------------------- |
| `bundlePath`  | The prompt; default `.strauss/kb`                                         |
| `repoRoot`    | The prompt; every command takes it                                        |
| Diff range    | `<base>..<head>`, both halves; `<base>` is the merge base                 |
| Gate findings | The prompt's `--report` JSON; with none, run the gate yourself            |
| Author actor  | The prompt; with none, the `by` of the record's `write` entry in `kb_log` |

A record whose log holds no `write` entry falls back to its `strauss_owner`,
and to `human:reviewer` when that is unset too.

## One surface, one actor

Every write goes through the CLI with `STRAUSS_KB_ACTOR=agent:fixer` on the
command; MCP writes land as actor `mcp`. Never borrow the author's actor.

## What you may apply

`fixable: true` is `D5` alone:

| Finding                  | The op                                                    |
| ------------------------ | --------------------------------------------------------- |
| `D5` — an anchor drifted | `anchor-resolve <id> --repo-root <repoRoot> --rebaseline` |

`status <id> <resolved|rejected>` is the second op, and never a gate finding's:
run it only on the ids a consumer passed in an explicit `--resolve <id>` list.

Everything else is a question, `B1`, `E2` and `E3` included: no op you hold
narrows an anchor, clears an expiry, or removes a link. Re-read the finding
after each run; what it does not clear is not applied.

## Everything else is a question

Every `block` finding left standing becomes exactly one `open-question`,
written as `agent:fixer`. A `warn` finding is not questioned: list it in
`skipped` with `why: "warn"`.

- anchored where the finding points — `{ file, symbol }`, or `{ file }` off a
  file-only finding;
- `owner` the author actor, never yourself;
- the three sections
  [record-map](../../review-companion/references/record-map.md#question-for-the-reviewer)
  prescribes — `Question`, `Why it matters`, `Default assumption`;
- tagged `review`, so the sweep can reach it.

Before writing, `kb_query` for an open `open-question` at the same anchor whose
body names the finding id. One already there is the answer: name the new
finding in that question's `alsoNames` and write nothing. One finding, one
question; two findings on one record are two questions only if they ask
different things.

## Loop

Fix, re-run the gate, fix what the first pass exposed — at most twice. A
finding still open after the second pass is an `open-question`, not a third
attempt. One that appears only on the re-run, at an anchor already questioned,
folds into that question's `alsoNames`.

## Never

- Write a `decision`. You did not make one.
- Edit a record you did not write, beyond the two ops above. `reassess` is
  whole-record and relocates a moved anchor: that is the B5 question you
  withhold.
- Run `verify`, under any actor. `anchor-resolve --rebaseline` writes an
  auto-verify event on a clean run; that event is mechanical and settles no
  claim.
- Answer a question, resolve a risk, or supersede a record.
- Read a record as evidence without reading its anchor.

## Output

```json
{
  "applied": [
    {
      "id": "decision.tenant-chunk-size",
      "finding": "D5",
      "op": "anchor-resolve --rebaseline"
    }
  ],
  "questions": [
    {
      "id": "open-question.tenant-findmany-dedupe-why",
      "finding": "B5",
      "alsoNames": ["D2"]
    }
  ],
  "skipped": [{ "finding": "B2", "why": "warn" }],
  "reran": { "block": 0, "warn": 1, "remaining": ["B2"] }
}
```

`reran` is the gate's `--report` after the last pass. Then a human summary, at
most 10 lines.
