---
name: recording-decisions
description: Decide what is worth recording as a decision in a Strauss knowledge base, and write one a reviewer can act on. Use before kb_write_decision or kb_no_decision — when finishing an implementation subtask, answering PR review comments, or fixing CI, and whenever a why gate blocks the turn asking for a record. Covers what to attach (sources, anchors, relatedConceptIds), which choices earn a record, and what to leave out because the diff already answers it.
---

# Recording decisions

A diff shows what changed and destroys why. You are the only one who still holds
the why, and you will not be there when it is asked.

Write for the person reviewing the pull request. They have the diff; they do not
have the afternoon you spent deciding.

## Before writing

`kb_query` first. A decision that already exists gets superseded, not written
twice — two records for one choice is how a base starts lying.

## What the record says

State the choice, the alternative you rejected, and what it costs whoever meets
it next. `alternative` and `impact` are fields rather than free sections because
what was rejected is the part a later reader cannot reconstruct from the code,
and a heading is too easy to leave empty.

## What to attach

A record nobody can trace is an opinion. Give the reviewer the thread back.

| Reference                                                                   | Where it goes       |
| --------------------------------------------------------------------------- | ------------------- |
| The requirement, design doc, ticket or standard that constrained the choice | `sources`           |
| The file and symbol the decision governs                                    | `anchors`           |
| Another record this narrows, contradicts or depends on                      | `relatedConceptIds` |
| The sibling module or existing pattern you followed — or departed from      | body prose          |
| The property that settled an algorithm                                      | body prose          |

**Anchors decide whether anyone reads it.** An anchored record surfaces beside
the hunk; an unanchored one goes in a list nobody opens.

**Cite the spec even when it feels obvious.** A decision traceable to a
requirement is settled. The same decision without one is an opinion a reviewer
has to relitigate, and they will.

**Name the pattern either way.** "Consistent with `TenantService.bulkDelete`" and
"deliberately unlike it, because …" are both answers. Silence is not — the
reviewer cannot tell whether you knew about the sibling and rejected it, or
never saw it.

**For an algorithm, give the deciding property**, not the name: the complexity
that mattered, the input size assumed, the tradeoff accepted. "Used a heap" is
the diff. "Heap because the top-k is re-read per request while inserts are
rare" is the decision.

## What deserves a record

Record, among others:

- a hack or workaround, or anything load-bearing that looks accidental
- code departing from the standards, or landing in an area that has none
- a new dependency, integration, or external call
- a function or module large enough that a reviewer will ask why it was not split
- writing something yourself instead of taking a dependency, or the reverse
- choosing one algorithm or data structure over an obvious alternative
- a constraint you discovered the hard way — the thing that fails if reordered

## What to leave out

**Nothing a reviewer could answer by reading the diff.** What a function does,
that a test was added, that a name changed, that a type moved — the code says
all of it, better than you would.

This is a judgment, and it is the one that decides whether the base is worth
opening. A base of trivia is worse than a small base: it teaches readers to
skim, and the one record that mattered gets skimmed with the rest.

Ask: _if I delete this record, what does a reviewer get wrong?_ No answer means
do not write it.

## Decisions made in review threads

A review comment that changes what the code does, or settles what it will not
do, is a decision made in the least durable place there is. Record it before
the thread is resolved, with the comment as `source`:

```json
"sources": [{ "id": "pr-281-r1723", "resource": "https://github.com/org/repo/pull/281#discussion_r1723", "author": "human:alice" }]
```

| The thread ended with                   | Write                                                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Code changed the way the reviewer asked | A `decision` that `supersedes` the old one; `alternative` is what stood before and why it fell                                                                           |
| Code stands; you answered the objection | A superseding `decision` with the same choice and the reviewer's alternative added — the old record was missing what was argued. The reviewer, not you, runs `kb_verify` |
| Nobody settled it                       | `open-question`, `owner` the reviewer, `Default assumption` what the merge does meanwhile                                                                                |
| Asked for something outside this change | `open-question` with `Default assumption: not in this PR`, so the request outlives the thread                                                                            |

Write as `agent:<name>` (`STRAUSS_KB_ACTOR`); a reviewer's acceptance is a
`kb_verify` under `human:<login>`. The store refuses a generator verifying its
own record, so do not try to close the thread on your own behalf.

A nit you accepted — a rename, a typo, a moved import — is not a decision. The
diff answers it.

## When there is genuinely nothing

Say so once with `kb_no_decision`. Silence and an answer must stay
distinguishable — an empty base cannot tell a reviewer whether the work was
obvious or whether nobody bothered.

Do not manufacture a record to clear a gate. Gating on "did you write a
decision" rewards writing a junk one; gating on "did you answer" does not, which
is why the claim exists.

## Beyond decisions

Risks, requirements or flows you introduced, standards you had to invent, and
marks that steer a reviewer's attention: the `review-companion` skill.
