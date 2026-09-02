# Architecture

The README is the entry point. This is why the format is shaped as it is.

## One record per file

The filename is the identity, so two writers never merge — they choose distinct
names. Publication uses `link`, so a collision surfaces as a 409 rather than a
silent last-write-wins.

Read-modify-write (`setStatus`, `answer`) checks a content digest immediately
before publishing, narrowing the lost-update window to two adjacent syscalls
rather than closing it. A lock would close it and add a worse failure: a crashed holder blocks every later writer, where a lost update costs one retry.

## Read for a question, not for a session

A base loaded at the start of a long conversation is summarised away by the end,
so no consumer loads it that way:

| Consumer                        | How it reads                                        |
| ------------------------------- | --------------------------------------------------- |
| Diff annotation                 | `matchToDiff` — deterministic, no context           |
| "Has this been decided?"        | a fresh short-lived reader, given base and question |
| An implementor writing a record | a point query at the moment of writing              |

Reloading costs about three thousand tokens for twenty records.

## Load beats retrieval while the base fits

On nine questions whose wording appears in no record, a reader holding the whole
base answered eight; embedding search over the same records answered four. Two
differences are structural: a reader can say no record answers, where vector
search returns its nearest neighbour whatever the distance; and it picks the
record that answers rather than the one nearest the topic.

## What happens when a base outgrows a context

Loading stops working above a few hundred records; what replaces it is the same
reader given candidates, not everything:

```
vector recall  →  top ~20 candidates, with their scores
                  ↓
reader judges  →  picks what answers, or says nothing does
```

The reader stays the judge, preserving the two structural wins above.

**A score threshold is not the growth path.** The wrong `audit trail` hit scored
0.318 against the correct `race condition` hit at 0.295; any cut that drops the
first drops the second. A threshold excludes the absurd — an unrelated query
scored 0.091 — and nothing else.

**Tags are not the growth path either.** The field exists, is written, and read by
nothing but an index line. Free-text tags drift the way `auth` /
`authentication` / `authn` drift; enforcing a vocabulary would make them a
closed enum, which `type` already is. `strauss_anchors` names a file and symbol,
which either match the repository or not.

## Rejected: a format that needs a parser

A hand-rolled frontmatter reader could not express nested maps, misreading every
OKF `generated`, `sources[]`, and `verified[]`; its replacement's first log
format was `·`-delimited. Both are gone: the log is JSONL, the schema is emitted
from Zod, and `strauss-kb schema` is the contract.

## Rejected for now: a base registry

Cross-base questions are unaskable: supersession, traces, and search stop at the
directory boundary. That is the price of a base that can be copied or handed
over whole, and it keeps the search index disposable.

The cheap escape, if that becomes the common case, is a registry: paths a caller
names explicitly, queried one at a time and merged only for display.
