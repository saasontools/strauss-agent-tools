# Architecture

The README says what the format is and how to use it. This says why it is
shaped that way, and which alternatives were tried and dropped — the decisions
a later reader would otherwise reopen.

## One record per file

The filename is the identity, so two writers never merge; they only choose
distinct names. Publication uses `link`, which fails when the name is taken, and
a collision surfaces as a 409 the caller has to answer rather than a silent
last-write-wins.

Read-modify-write (`setStatus`, `answer`) checks a content digest immediately
before publishing. That narrows the lost-update window to two adjacent syscalls
rather than closing it. A lock would close it and add a stale-hold failure worse
than the residue: a crashed holder blocks every later writer, where a lost
update costs one retry.

## Read for a question, not for a session

A base loaded at the start of a long conversation is summarised away by the end
of it, and nothing keeps it alive. So no consumer loads it that way:

| Consumer                        | How it reads                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Diff annotation                 | `matchToDiff` — deterministic, no context involved                           |
| "Has this been decided?"        | a fresh short-lived reader, given the base and the question, discarded after |
| An implementor writing a record | a point query at the moment of writing, not a load an hour earlier           |

Each has clean context by construction. Where a base genuinely must stay
resident it will drift, and there is no defence — the mitigation is that
reloading costs about three thousand tokens, so read it again at the point of
use rather than trying to keep it.

## What happens when a base outgrows a context

Loading stops working somewhere above a few hundred records. What replaces it is
not a different answer to the same question — it is the same reader, given
candidates instead of everything:

```
vector recall  →  top ~20 candidates, with their scores
                  ↓
reader judges  →  picks what answers, or says nothing does
```

The reader stays the judge in both regimes, which is what preserves the two
structural wins the README reports: it can say no record answers the question,
and it picks the record that answers rather than the one nearest the topic.
Neither survives if a ranker's top hit is taken as the answer.

**A score threshold is not the growth path.** The wrong `audit trail` hit scored
0.318 against the correct `race condition` hit at 0.295; any cut that drops the
first drops the second. A threshold excludes the absurd — an unrelated query
scored 0.091 — and nothing else.

**Tags are not the growth path either.** The field exists, is written, and is
read by nothing but an index line, deliberately. Free-text tags drift the way
`auth` / `authentication` / `authn` drift, which is the failure this format was
rewritten to remove; enforcing a vocabulary would make them a closed enum, which
`type` already is. The labels that matter here are already verifiable —
`strauss_anchors` names a file and a symbol, which either match the repository
or do not, where a tag can be wrong forever. If narrowing ever matters, measure
tag narrowing against vector recall on a real base rather than adding both.

## Rejected: a format that needs a parser

This was broken twice. A hand-rolled frontmatter reader could not express nested
maps, so it misread every OKF `generated`, `sources[]`, and `verified[]`. Its
replacement's first log format was `·`-delimited, with a splitter to read it
back. Both are gone: the log is JSONL and the schema is emitted from Zod, so
`strauss-kb schema` is the contract rather than a description of one.

## Rejected for now: a base registry

Cross-base questions are unaskable by construction — supersession, traces, and
search stop at the directory boundary. That is the price of a base that can be
copied, deleted, or handed over whole, and it is what keeps the search index
disposable.

If cross-base ever becomes the common case, the cheap escape is a registry: a
list of paths a caller may name explicitly, queried one at a time and merged
only for display. It is deliberately unbuilt. Adding it early would drag back
the cross-scope machinery this model exists to avoid.
