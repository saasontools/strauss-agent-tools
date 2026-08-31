---
id: architecture
title: Architecture
sidebar_label: Architecture
sidebar_position: 3
description: Why strauss-kb is shaped the way it is, and which alternatives were tried and dropped.
---

# Architecture

The [Specification](./specification.md) says what the format is. This says why it
is shaped that way, and which alternatives were tried and dropped — the
decisions a later reader would otherwise reopen.

## One command set, two surfaces

Every operation a base exposes is defined once, in a command table
(`src/commands/`). The CLI and the MCP server are both **projections** of it.

```
                    src/commands/index.ts
                      KB_COMMANDS[]
                     /             \
              src/cli.ts          src/mcp.ts
          argv → fromArgv →       args → input.parse →
              command.run             command.run
```

Kept apart they drift within a day — fourteen commands against six tools, which
is the same failure as a schema restated in prose beside the code that enforces
it. A command added to the table appears in both surfaces or in neither, and a
test asserts exactly that.

Each command carries:

| Field         | What it is                                                              |
| ------------- | ----------------------------------------------------------------------- |
| `name`        | the CLI verb                                                            |
| `tool`        | the MCP tool name, absent only for CLI-only plumbing                    |
| `usage`       | the argument spelling, for CLI help                                     |
| `description` | shown to an agent choosing a tool, so it carries the judgment too       |
| `input`       | a Zod object — the MCP input schema and the CLI's validator             |
| `fromArgv`    | the only per-surface code: positional argv → the same object MCP passes |
| `run`         | the operation, over `{ store, actor, now }`                             |
| `failsWhen`   | turns a result into a non-zero CLI exit                                 |

The two surfaces differ only in how arguments arrive, so `fromArgv` is the
adapter and nothing else is duplicated. `sync-instructions` is the one verb with
no `tool`: it edits files for hooks and instruction blocks rather than giving an
agent a capability — the capability, "get the pinned context block", is
`kb_context`.

`failsWhen` exists because a check that reports a problem has _succeeded_ as a
command and _failed_ as a check, and a shell caller can only see the difference
through the exit code. The dispatcher does not need to know which commands those
are.

## Folder modules

A source file that accumulates more than one responsibility becomes a directory
of single-responsibility modules with an `index.ts` barrel re-exporting the
public surface. Importers point at the barrel; no compatibility file is left at
the old path.

| Module          | Shape                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/commands/` | `model.ts` (the `KbCommand` type and shared Zod pieces), one file per command, `index.ts` assembling `KB_COMMANDS`              |
| `src/kb-pins/`  | `model.ts` (manifest schemas), `layers.ts`, `budgets.ts`, `frozen.ts`, `errors.ts`, `pin.ts`, `unpin.ts`, `list.ts`, `index.ts` |

`index.ts`'s command order is the CLI usage listing's order: the write path, the
read path, base housekeeping, the format, then the workspace pin verbs.

## The store

`KbStore` reads and writes a bundle. It is framework-free on purpose: its
consumers are a library caller, a CLI an agent shells out to, and an MCP server,
so it takes a logger rather than reaching for one — only some of those have
anything to reach into. The bundle is addressed by path rather than fixed to one
directory, because a base belongs to whatever prompted it, and one hardcoded
location cannot be all of those.

### One record per file

The filename is the identity, so two writers never merge; they only choose
distinct names. Publication uses `link`, which fails when the name is taken, and
a collision surfaces as a 409 the caller has to answer rather than a silent
last-write-wins. `rename` is used only for an explicit `overwrite`.

Writes are staged to a sibling file and published atomically, so a concurrent
reader sees a whole record or none.

### Compare-and-swap rather than a lock

Read-modify-write (`setStatus`, `answer`) checks a content digest immediately
before publishing. That narrows the lost-update window to two adjacent syscalls
rather than closing it.

A lock would close it and add a stale-hold failure worse than the residue: a
crashed holder blocks every later writer, where a lost update costs one retry.

### Repair on read, not coordination

`INDEX.md` is a projection — every byte recomputable from record frontmatter —
which is what lets parallel writers regenerate it without a lock. Two concurrent
regenerations compute the same function of the same records and differ only in
how recent each writer's scan was; the next read through the store settles it.
The index is _eventually_ correct, which is the right trade for something
nothing reads transactionally.

`log.jsonl` gets the opposite treatment. It records events nothing else holds,
so repair means detect and report, never rewrite.

### The store is the sole accessor

Excluding store-owned files from listings and repairing the index on read hold
only while everything goes through one door. Reading one record by a concept id
you already hold is the exception — no invariant, deterministic path.

This is also why a raw file read of a record is not a supported way to read a
base: it bypasses supersession resolution and returns replaced records as if
current. A workspace can enforce that with deny rules or the plugin's opt-in
`PreToolUse` script.

## The read pipeline

```
records on disk
   │
   ├─ compose      write-side: type spec → ordered sections + frontmatter
   │
   ├─ adjudicate   attach standing + warnings; resolve supersession heads
   │
   ├─ load/pack    budget, stub superseded records, refuse rather than truncate
   │
   └─ trace        walk supersession/anchor/source, order by generated.at
```

**`compose`** turns a type and an input object into one record. The type table
(`record-types.ts`) is data rather than twelve composer modules: the types
differ only in which questions their body answers and where they start in the
lifecycle, so encoding that as data keeps the one composer honest and makes
adding a type an edit rather than a file.

**`adjudicate`** attaches standing to records a search returned — adjudicating
rather than filtering, deliberately. A filtered result set is invisible: the
caller cannot tell it missed anything, so a dropped record is worse than a
flagged one. It turns a knowable gap into an unknowable one.

**`resolveHeads`** walks a supersession chain to whatever currently stands in
its place, following both directions. `supersede()` writes the pair, but a
hand-edit can leave one side behind, and a walk that trusts only the forward
pointer would silently return a record something in the bundle openly claims to
replace. Resolution happens here rather than being denormalised at write time: a
stored head would have to be rewritten on every ancestor whenever a chain grows,
which is derived state that goes stale — the failure this design keeps avoiding
elsewhere.

**`trace`** is the inverse of a point query, and the reason the two cannot be
one call with a flag. In a query a `rejected` record is the most dangerous thing
retrievable; in a history it is the content. A trace that drops the rejected
alternatives and the superseded earlier understanding has removed the answer and
kept the conclusion, which is what reading a diff already gives you. It orders
by `generated.at`, because ranking a history is meaningless when the sequence is
the point.

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
structural wins: it can say no record answers the question, and it picks the
record that answers rather than the one nearest the topic. Neither survives if a
ranker's top hit is taken as the answer.

**A score threshold is not the growth path.** The wrong `audit trail` hit scored
0.318 against the correct `race condition` hit at 0.295; any cut that drops the
first drops the second. A threshold excludes the absurd — an unrelated query
scored 0.091 — and nothing else. This is why the vector tier is deliberately
off: scores are evidence for a reader to weigh, not a filter to apply before
one.

### Tags are not the growth path

The `tags` field exists, is written, and is read by nothing but an index line,
deliberately. Free-text tags drift the way `auth` / `authentication` / `authn`
drift, which is the failure this format was rewritten to remove; enforcing a
vocabulary would make them a closed enum, which `type` already is.

The labels that matter here are already verifiable — `strauss_anchors` names a
file and a symbol, which either match the repository or do not, where a tag can
be wrong forever. If narrowing ever matters, measure tag narrowing against
vector recall on a real base rather than adding both.

## Rejected: a format that needs a parser

This was broken twice. A hand-rolled frontmatter reader could not express nested
maps, so it misread every OKF `generated`, `sources[]`, and `verified[]`. Its
replacement's first log format was `·`-delimited, with a splitter to read it
back.

Both are gone: the log is JSONL and the schema is emitted from Zod, so
`strauss-kb schema` **is** the contract rather than a description of one.

## Rejected for now: a base registry

Cross-base questions are unaskable by construction — supersession, traces, and
search stop at the directory boundary. That is the price of a base that can be
copied, deleted, or handed over whole, and it is what keeps the search index
disposable.

If cross-base ever becomes the common case, the cheap escape is a registry: a
list of paths a caller may name explicitly, queried one at a time and merged
only for display. It is deliberately unbuilt. Adding it early would drag back
the cross-scope machinery this model exists to avoid.

## Why the MCP server is standalone

A base is self-contained: a directory of markdown that needs no database, no
HTTP surface, and no running service to read. Folding these tools into a larger
server would make every consumer start that server to open files it could open
itself. `strauss-kb-mcp` therefore speaks stdio, takes no API key and no
required environment, and writes diagnostics to stderr — stdout is the JSON-RPC
transport.

The optional search backend is used as a **library**, never through its own MCP
server: that would let a caller reach a base without going through the store,
and its default markdown glob returns `INDEX.md` as a search hit.
