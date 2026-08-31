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

## Cross-worktree log safety

`log.jsonl` is append-only and the one artifact nothing can rebuild, so how it
merges across worktrees matters more than how any record file does. Records
already don't need this: one concept id is one file, so two writers choosing
distinct ids never merge at all, and `link`-based publish (above) turns the
one case where they collide into a 409 rather than a merge. The log has no
such escape — every writer appends into the same file by design — so it needs
an actual merge strategy, not just atomicity per write.

The append itself already had it: `record()` uses `appendFile`, which opens
`O_APPEND` and is one `write(2)` for an entry this small, so two processes
appending locally interleave whole lines, never a torn one. What was missing
was git's merge of two worktrees' independently-appended logs — the default
line-level merge can conflict, or silently keep one side, on lines that were
never in conflict, since both sides only ever added, never edited, a line.

The fix is `.gitattributes: log.jsonl merge=union`, written by `write()` on
first use (`kb-store.ts#ensureGitattributes`). `union` is a merge driver git
ships — nothing to configure beyond the attribute — that keeps both sides'
added lines. The alternative considered and dropped was a lock file coordinating
writes across worktrees the way `mutate`'s CAS coordinates a single record: it
would need to span process boundaries and survive a crashed holder, which is
the same stale-lock failure mode rejected above, for a smaller problem than
the one it solves there.

Two decisions worth naming because a later reader could reopen either:

- **A `.gitattributes` that exists but lacks the line gets the line
  appended, not left alone.** The alternative — leave a user's own file
  untouched — reads as more conservative, but a bundle that already has a
  `.gitattributes` in front of it is exactly the bundle most likely to be
  shared across worktrees or forks, so leaving it without union merge is the
  worse of the two failure modes.
- **Union merge does not preserve line order, so `kb_log`'s reader sorts by
  `at` rather than trusting file order.** Sorting there, once, is cheaper
  than trying to make every future merge order-preserving.

GitHub does not run merge drivers for a PR it merges server-side — see the
README's "Cross-worktree writes" section. The driver only helps a merge a
local git client actually performs.

## Rejected for now: a base registry

Cross-base questions are unaskable by construction — supersession, traces, and
search stop at the directory boundary. That is the price of a base that can be
copied, deleted, or handed over whole, and it is what keeps the search index
disposable.

If cross-base ever becomes the common case, the cheap escape is a registry: a
list of paths a caller may name explicitly, queried one at a time and merged
only for display. It is deliberately unbuilt. Adding it early would drag back
the cross-scope machinery this model exists to avoid.
