---
name: kb-review
description: Review a pull request against its companion knowledge base — check whether the records on each hunk survive reading the code, and report where the base changed the reviewer's verdict. Use for "review this PR with the kb", "kb-aware review", "check the companion base claims", or "do the records on this diff hold". Not for a plain code review, and not for writing records — that is review-companion.
---

# kb-aware review

The `kb-reviewer` agent reviews the diff blind, then again with the base, and
reports the delta. Your job is to hand it the inputs and print what comes back.

## Collect

| Input        | Ask for it when                                             |
| ------------ | ----------------------------------------------------------- |
| Diff range   | Always. `<base>..<head>`, both halves; no default           |
| `repoRoot`   | Not the cwd                                                 |
| `bundlePath` | Not `.strauss/kb`                                           |
| Ticket URL   | The diff invents a requirement — otherwise it cannot settle |

## Spawn

Launch the `kb-reviewer` agent with those inputs and the token or time budget
you can afford. It sets its own actor on each write command. It writes to the
base itself — reviewer-found risks, verifies under `agent:reviewer`, disputes
as open questions owned by the author — so run it once per range, not once per
hunk.

## Print

Its JSON, keyed by record id, then its summary. `partial: true` has two causes
and `reason` names which: `budget`, where the base now holds an `open-question`
saying what was not covered, or `unvalidated-base`, where pre-flight failed and
nothing was reviewed or written. Say which rather than reporting a clean
review, and route `unvalidated-base` to `kb-fix`, as the agent does; run again
on what comes back.

## Record and replay

Recording a run as a fixture:
[fixtures/companion-repo/recorded/README.md](../../../../fixtures/companion-repo/recorded/README.md).

## Not this

- Reviewing the diff for bugs with no base in play: that is a plain review.
- Writing the records a reviewer will read: `review-companion`.
- Mapping a compound into review paths for Strauss Desktop:
  `review-path-planner`.
