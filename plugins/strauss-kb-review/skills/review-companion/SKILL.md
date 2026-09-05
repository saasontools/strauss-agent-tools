---
name: review-companion
description: Keep a knowledge-base companion to a change across every commit of a pull request — risks, requirements and design the agent introduced, business flows behind hunks, standards it worked around, and review-focus marks — anchored to the code they govern. Use while implementing, after each commit, before pushing, and when a reviewer asks what a hunk is for or where to look first. Decisions themselves are recording-decisions.
---

# Review companion

The reviewer has the diff. The companion base holds what the diff destroys:
what was at stake, what you were unsure of, and which hunks carry the change
versus which merely ride along. Every record is anchored, so a review tool can
put it beside the hunk; an unanchored record is a list nobody opens.

Record judgment only. What a script can derive from the diff — file
categories, renames git detects, line counts — is not a record.

## One base, two lifetimes

Everything goes in the project base, `.strauss/kb`, because typed links do
not cross bundles and a risk that cannot point at the decision it fears is
half a record. What only this review needs — `risk`, `open-question`,
`test-obligation`, review marks — carries the tag `review` and ends the
review in a terminal status: `resolved`, `rejected`, or superseded. What a
reader needs in six months carries no such tag and stays `accepted`.

`kb_query` first. A record that already covers the judgment is superseded or
linked, never written twice.

## What to record

[record-map.md](references/record-map.md) has the type, fields, links and a
JSON example for each row.

| You                                                         | Write                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Chose, rejected, reused, ignored a standard                 | `decision` — follow recording-decisions                                                                 |
| Fear something: bug, performance, business, security        | `risk`, `materiality` set, anchored to the hunk that carries it                                         |
| Found no standard and had to invent one                     | `constraint` (`proposed`) as the recommendation; the `decision` you took meanwhile `informs` it         |
| Invented a requirement, contract, or design nobody gave you | `requirement` (`assumption: true` if unsourced), `contract`, or `flow`; the code `satisfies` it         |
| Implemented an acceptance criterion or business flow        | `requirement` per AC with the ticket as `source`; a `flow` anchored to the symbols, `satisfies` the AC  |
| Moved or extracted logic in a way git cannot show           | `fact` tagged `review:move` or `review:extract`, old location in the body, `verify` naming the proof    |
| Left a block a reviewer should not read line by line        | `fact` tagged `review:generated` or `review:boilerplate`, `verify` naming how to regenerate or check it |
| Wrote a test that pins a risk or requirement                | `test-obligation`; the `risk` or `requirement` is `verified_by` it                                      |
| Need the reviewer to decide something                       | `open-question`, `owner` set to the reviewer                                                            |
| Settled something in a review thread                        | `decision` or `open-question` with the comment URL as `source` — recording-decisions has the table      |

Materiality is the reviewer's attention budget: `blocking` means do not merge
without reading this; `important` means read it; `non-blocking` means skim.
Confidence is yours: `low` says look here even if the code seems fine.

## Anchoring

- Code: `{ file, symbol }`. Config, data, prose: `{ file }` only.
- One record, several anchors, when one judgment spans hunks.
- Deleted code has no anchor. Anchor the survivor and name what was removed
  in the body.
- Never a line number: it is wrong by the next commit. The resolver stamps
  lines after the change settles.

## Each commit

The base is wrong the moment the code moves. After every commit:

1. `kb_stamp --since <last stamp>` — what moved since you last looked.
2. `kb_anchor_resolve <id> --repo-root . --rebaseline` on every record whose
   anchors touch the commit. Drift the commit caused is the new baseline;
   drift you did not expect is a record that no longer describes the code.
3. A record whose meaning changed is superseded, not edited. A `risk` the
   commit removed moves to `resolved` with `kb_status`.
4. `kb_validate` after the pass. `kb_doctor --strict` before pushing.

A reviewer who accepted a risk records it: `kb_verify <id> --note <what they
checked>`. An answered question: `kb_answer`. Neither is yours to write for
them.

## Before anyone reads it

A consumer — reviewer agent, walkthrough, human — validates first or reviews
a base that lies. In order:

1. `kb_validate`; `kb_doctor --strict`; `kb_anchor_resolve` on every record
   anchored in the diff.
2. Changed code files with no anchored record and no fresh `decision.none`.
3. `review`-tagged records past their commit: a risk the code removed, a
   question already answered in the thread.

Who fixes depends on who is left:

| Tier                | Fixer                         | May write                                                                                                              |
| ------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Stop / SubagentStop | The author, still in context  | Anything                                                                                                               |
| Same parent session | The author, via SendMessage   | Anything                                                                                                               |
| Later: review, CI   | A fixer holding diff and base | Rebaseline, and a terminal status on request; a gap becomes an `open-question` owned by the author, never a `decision` |

Mechanical, in the tiers that may edit a record: drift rebaselined, dangling
link removed, file-only anchor on a code file narrowed to a symbol, terminal
status set. Semantic — why a file changed, what a risk's mitigation is —
belongs to whoever held the why. A fixer that invents it has written the one
record a reviewer will trust and should not.

Which tier is left, and how to reach it: `kb-fix`.

## Slugs that survive the branch

`<area>-<thing>`: `checkout-retry-budget`, `tenant-batch-get`. No commit
hashes, dates, or hunk numbers — the same judgment must keep its id across
rebases, or every consumer loses the thread.

## Not this

- A rename, a type move, a formatting pass: the diff answers it.
- A risk with no anchor and no mitigation: that is a worry, not a record.
- A requirement copied from the ticket the reviewer already has: link the
  ticket as `source` on the flow instead of restating it — unless the AC is
  the thing your flow `satisfies`, in which case one record per AC.
