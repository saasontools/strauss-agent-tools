---
id: specification
title: Specification
sidebar_label: Specification
sidebar_position: 2
description: The record model — frontmatter, types, standing, supersession, verification, bundle layout, and validation.
---

# Specification

A knowledge base is a directory. Everything below describes what is in it and
what a reader may rely on.

:::tip Do not work from memory on the frontmatter contract
`strauss-kb schema` emits JSON Schema generated from the Zod schemas that
enforce it, so it cannot drift from what a write will actually accept. This page
describes that contract; the command _is_ it.
:::

## Bundle layout

```
<kb>/
  <type>.<slug>.md    records
  INDEX.md            index      derived, store-owned
  log.jsonl           history    primary, append-only
  .index.sqlite       search     derived, gitignored
```

The default base is `.strauss/kb`, relative to the working directory.
`--bundle PATH` addresses any other.

`INDEX.md` and `log.jsonl` are both store-owned, and they differ in kind —
treating them alike is how the history gets lost:

|         | `INDEX.md`                                 | `log.jsonl`                                 |
| ------- | ------------------------------------------ | ------------------------------------------- |
| Nature  | derived — recomputable from frontmatter    | primary — records events nothing else holds |
| Write   | full regenerate                            | append                                      |
| Repair  | rebuilt when it disagrees with the records | malformed lines reported, never rewritten   |
| If lost | reconstructed free                         | gone                                        |

The store excludes those three files from record listings, and repairs the index
on read. Both hold only because everything goes through one door: the store is
the sole _accessor_, not merely the sole writer.

### `INDEX.md`

A projection, one line per record, sorted by concept id:

```
- [Title](fact.cache-key.md) — fact · accepted · tags: cache · A region-less key serves the wrong data.
```

The line carries `description`, not just the title: a reader consults the index
to decide what is worth opening, and a list of titles does not answer that. Two
concurrent writers regenerating it compute the same function of the same
records, so no lock is needed — the index is _eventually_ correct, and the next
read through the store settles it.

### `log.jsonl`

One JSON object per line, appended with `O_APPEND`:

```json
{
  "at": "2026-08-16T09:14:00Z",
  "by": "agent",
  "operation": "write",
  "conceptId": "decision.cursor-v2"
}
```

| Field       | Required | Meaning                                               |
| ----------- | -------- | ----------------------------------------------------- |
| `at`        | yes      | ISO timestamp                                         |
| `by`        | yes      | the actor, from `STRAUSS_KB_ACTOR`                    |
| `operation` | yes      | what happened, e.g. `write`, `verify:refused`         |
| `conceptId` | yes      | the record acted on                                   |
| `target`    | no       | the second id, where an operation relates two records |

The schema is `.strict()`: unknown keys are a malformed line. Malformed lines
are _reported_ with their 1-based position and never rewritten — rewriting an
append-only log destroys the only copy of what it holds.

## Records

### Identity

The filename is the identity. A record at `fact.auth-retries.md` has concept id
`fact.auth-retries` — the bundle-relative path with `.md` removed.

Both halves of `<type>.<slug>` are kebab-case:

```
slug        ^[a-z0-9]+(?:-[a-z0-9]+)*$
concept id  ^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$
```

The pattern is enforced at the entry point because concept ids are interpolated
into markdown links unescaped; an id carrying a `]` or `)` would emit a broken
edge rather than fail.

One record per file, deliberately: several agents may run in parallel against
one base, and a shared file would need merging. A file-per-record store has no
write conflict to resolve, only distinct filenames to choose.

### Frontmatter

Records are OKF v0.2 concepts. OKF requires exactly one key — `type` — and
explicitly permits extension, requiring consumers to preserve unknown keys when
round-tripping. So everything else is optional, and unknown keys are kept rather
than stripped.

**OKF keys**

| Key           | Type           | Meaning                                                                               |
| ------------- | -------------- | ------------------------------------------------------------------------------------- |
| `type`        | string         | the only always-required key                                                          |
| `title`       | string         | one line, in the reader's terms                                                       |
| `description` | string         | the consequence — what breaks if this is wrong                                        |
| `resource`    | string         | a path this concept names                                                             |
| `tags`        | string[]       | free-text labels (see [Architecture](./architecture.md#tags-are-not-the-growth-path)) |
| `sources`     | Source[]       | material the record draws on                                                          |
| `generated`   | `{ by, at }`   | who wrote it, and when                                                                |
| `verified`    | `{ by, at }[]` | the append-only trail of checks                                                       |
| `stale_after` | string         | the date this record stops being trusted                                              |

A **source** is `{ id, resource, title?, author?, last_modified? }`, with `id`
and `resource` required. Footnotes in the body key to `id`.

**strauss extensions**

Namespaced so a later OKF version defining the same name cannot collide. OKF
names files through path-valued `resource` fields and has no notion of a span,
so anchoring a concept to code has no standard spelling; standing has none
either.

| Key                     | Type         | Meaning                                                                      |
| ----------------------- | ------------ | ---------------------------------------------------------------------------- |
| `strauss_status`        | enum         | see [Standing](#standing-and-adjudication). Parses with a default of `draft` |
| `strauss_supersedes`    | string[]     | ids this record replaces                                                     |
| `strauss_superseded_by` | string       | the id that replaced this one                                                |
| `strauss_anchors`       | Anchor[]     | `{ file, symbol? }` — where the record attaches in the code                  |
| `strauss_verify`        | string[]     | checks that would confirm the record still holds                             |
| `strauss_answered`      | `{ by, at }` | who resolved an open question, and when                                      |
| `strauss_assumption`    | boolean      | the claim has no source                                                      |
| `strauss_materiality`   | enum         | `blocking`, `important`, `non-blocking`                                      |
| `strauss_confidence`    | enum         | `low`, `medium`, `high`                                                      |
| `strauss_owner`         | string       | a name                                                                       |

`strauss_assumption` is a field rather than a sentinel entry inside `sources`,
because a sentinel in a reference list is a value doing a field's work — and as
a field, `sources` may be legitimately empty.

### Anchors

```yaml
strauss_anchors:
  - { file: src/kb-store.ts, symbol: KbStore.setStatus }
```

Symbolic on purpose, and `strict()` — `file` is required, `symbol` optional, and
nothing else is accepted. These are written while the code is still moving: a
`line: 379` recorded at minute five is wrong by minute forty, but
`OrderService.cancel` survives every edit that does not rename it. A later pass
resolves symbols to line ranges once the change has settled, and records that
resolution as a `verified[]` entry.

### Body

Section headings come from the record's type (see [Record types](#record-types))
and are **ordered**. A section a type does not define is rejected rather than
written. A section the caller leaves empty is omitted rather than stubbed — an
empty `## Evidence` reads as evidence that was sought and not found.

Edges are markdown links in the body, as OKF specifies: directed but untyped,
with the kind conveyed by the surrounding prose. `relatedConceptIds` is rendered
as `Relates to [id](id.md).`, so in stored form a related edge _is_ a body link.
Broken links are legal — records are routinely written before the ones they
point at exist.

```yaml
---
type: decision
title: Compare-and-swap rather than a lock
description: A stale lock hold blocks every later writer.
generated: { by: agent, at: 2026-08-16T09:14:00Z }
verified: []
strauss_status: accepted
strauss_anchors:
  - { file: src/kb-store.ts, symbol: KbStore.setStatus }
---
## Decision

Read-modify-write checks a content digest immediately before publishing.

## Rejected

A lock file. It closes the window and adds a stale-hold failure mode that is
worse than the residue.
```

## Record types

Twelve types. They differ only in what their body answers and where they start
in the lifecycle — a table rather than twelve composer modules, which keeps the
one composer honest.

| Type              | Purpose                                                      | Sections                                          | Initial status |
| ----------------- | ------------------------------------------------------------ | ------------------------------------------------- | -------------- |
| `fact`            | Observed or sourced fact                                     | Claim · Evidence · Implication                    | `accepted`     |
| `requirement`     | Required behavior or outcome                                 | Claim · Evidence · Implication                    | `proposed`     |
| `constraint`      | Limitation, compatibility boundary, policy, or restriction   | Claim · Evidence · Implication                    | `accepted`     |
| `decision`        | Chosen or proposed direction                                 | Decision · Rationale · Rejected · Impact          | `accepted`     |
| `assumption`      | Unsourced or not-yet-confirmed working assumption            | Claim · Why we think so · What would falsify it   | `draft`        |
| `open-question`   | Question needing resolution                                  | Question · Why it matters · Default assumption    | `open`         |
| `risk`            | Something that can go wrong                                  | Risk · Why it matters · Mitigation · Verification | `open`         |
| `contract`        | API, data, event, schema, or permission contract             | Contract · Producer · Consumer · Compatibility    | `proposed`     |
| `flow`            | Sequence, lifecycle, or state behavior                       | Flow · Trigger · Steps · Failure modes            | `accepted`     |
| `affected-system` | Component, service, package, integration, or external system | System · How it is affected · Blast radius        | `accepted`     |
| `test-obligation` | Behavior or contract that must be verified                   | Obligation · Why it matters · How to verify       | `open`         |
| `source-note`     | Extracted note from source material                          | Note · Where it came from                         | `accepted`     |

`strauss-kb types` (MCP: `kb_types`) prints this table from the code. Read it
before writing rather than guessing headings.

An OKF `type` this package does not recognise is a **note**, not a failure:
another producer may legitimately be writing into the same bundle.

## Standing and adjudication

OKF's `verified[]` and `stale_after` answer "is this still true?". Nothing in
the spec answers "is this settled, and does it still apply?" — a base supersedes
its own conclusions as work proceeds, so that second question needs an answer,
and it is this package's to define.

Seven statuses map onto five standings:

| `strauss_status` | Standing     | Warning attached                      |
| ---------------- | ------------ | ------------------------------------- |
| `accepted`       | `current`    | —                                     |
| `resolved`       | `current`    | —                                     |
| `draft`          | `unsettled`  | `unsettled`                           |
| `proposed`       | `unsettled`  | `unsettled`                           |
| `open`           | `open`       | `unresolved-question`                 |
| `rejected`       | `rejected`   | `rejected`                            |
| `superseded`     | `superseded` | `superseded`, with the resolved heads |

Adjudication attaches standing to every hit; it never drops one. A filtered
result set is invisible — the caller cannot tell it missed anything, so a
dropped record turns a knowable gap into an unknowable one. `query` has a single
narrow exception: a superseded record is dropped only when its replacement is
also in the results, so the thread is never lost.

### Warnings

| Warning               | Meaning                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rejected`            | Explicitly not adopted. The most dangerous status to return unmarked: a well-formed assertion of what someone decided _not_ to do.                            |
| `superseded`          | Replaced. Carries `by`, the ids of the surviving heads.                                                                                                       |
| `unsettled`           | `draft` or `proposed`. Acting on a proposal as though it were a decision is a defect.                                                                         |
| `unresolved-question` | Says a matter is unresolved. Valuable as a result, never as an answer.                                                                                        |
| `broken-chain`        | `strauss_superseded_by` names a record that is not in the bundle. The case needing most care: returning the stale record unmarked looks exactly like success. |
| `chain-cycle`         | The supersession walk revisited a record.                                                                                                                     |
| `forked-chain`        | Two records claim to replace this one; picking either would be a guess, so every head is reported.                                                            |
| `stale`               | `stale_after` is in the past.                                                                                                                                 |
| `unverified`          | `verified[]` is empty.                                                                                                                                        |

## Supersession

A record whose meaning changed is **superseded**, never edited. A record that
quietly becomes something else invalidates every reference to it, and the
earlier understanding is what a later `trace` needs. Records are never deleted.

Both directions are written together:

```
old.strauss_superseded_by = new
new.strauss_supersedes    = [old, …]
```

Two paths write that pair:

- `supersede <old> <new>` — links two existing records.
- `write` / `write-decision` carrying `supersedes` — the new record publishes
  first, then each prior record it names is marked superseded in turn.

An id naming a record that does not exist yet is legal and does not fail the
write; `validate` reports a target that never resolves. An id naming the
record's own concept id is a no-op. Duplicate ids mark once. The array is capped
at **32** entries.

`kb_write` and `kb_write_decision` return
`{ conceptId, action, supersededIds }`, where `action` is `"created"` or
`"superseded-prior"` and `supersededIds` holds only the ids **actually** marked
— not every id the input named. A crash between publishing the new record and
marking an old one leaves an old record with no backlink, which `validate`
reports as "is not marked superseded"; it is never a silent drift.

### Chain resolution happens on read

Walking to the head is done at read time, not denormalised onto records at write
time — a stored head would have to be rewritten on every ancestor whenever a
chain grows, which is derived state that goes stale.

The walk follows **both** pointers, not just `strauss_superseded_by`. A
hand-edit that left one side behind cannot return a record the bundle openly
claims is replaced. A cycle terminates with `chain-cycle`; a fork reports every
head rather than presenting a guess as a fact; a missing replacement is
`broken-chain` with no head at all.

## Verification

`verified[]` is a record's append-only trail of checks. Each entry is OKF's
actor stamp — `{ by, at }` — and the entries `verify` writes add a required
`note`: what the check actually found, not merely that one happened. Prior
entries are spread forward untouched rather than reshaped, and the frontmatter
schema keeps reading `verified` with the noteless OKF shape so entries a foreign
producer wrote stay readable.

**Who may append is the point.** A verifier whose actor equals the record's
`generated.by` — compared case-insensitively over the whole actor, so case drift
cannot mint a distinct verifier identity — is refused unless the actor is
`human:`-prefixed. Trust that can be self-granted is not trust, and a generator
re-reading its own output is not an independent check. The refusal is recorded
in the log as `verify:refused`, so an audit sees the attempt as well as the
rule.

The `human:` prefix is an honor-system label: actor identity is self-declared
through `STRAUSS_KB_ACTOR`, not an authenticated claim. Worth knowing when
deciding how much weight a human-verified event carries.

Adjudication today reports only the first rung of OKF's trust ladder — the
`unverified` warning when `verified[]` is empty. Reporting the full tier is
upcoming; when it lands it will be derived from the events at read time, never
stored, so it cannot drift from the trail that justifies it.

## Writes

Records are staged to a sibling file and published atomically, so a concurrent
reader sees a whole record or none. Publication uses `link`, which **fails when
the name is taken** — two writers choosing one concept id is a 409 the caller
must answer, by picking a more specific slug or by saying it meant to replace. A
409 carries `action: "refused"` in its `details` alongside the `conceptId`.
`rename` is used only when the caller passes `overwrite`.

Read-modify-write (`status`, `answer`) checks a content digest immediately
before publishing. That narrows the lost-update window to two adjacent syscalls
rather than closing it; [Architecture](./architecture.md#compare-and-swap-rather-than-a-lock)
says why a lock was rejected.

### Write input

`write` takes a type and this object; `write-decision` takes the same minus
`sections`, plus `alternative` and `impact`. The schema is `.strict()` —
unknown keys are rejected.

| Field               | Required | Meaning                                                                  |
| ------------------- | -------- | ------------------------------------------------------------------------ |
| `slug`              | yes      | the second half of the concept id                                        |
| `title`             | yes      | one line, in the reader's terms → OKF `title`                            |
| `why`               | yes      | the consequence — what breaks if this is wrong → OKF `description`       |
| `sections`          | no       | keyed by section heading from the type's spec; unknown headings rejected |
| `anchors`           | no       | `{ file, symbol? }[]`                                                    |
| `sources`           | no       | `{ id, resource, title?, author?, last_modified? }[]`                    |
| `assumption`        | no       | `true` when no source exists                                             |
| `stale_after`       | no       | `YYYY-MM-DD`, and a real date                                            |
| `verify`            | no       | checks that would confirm this still holds                               |
| `tags`              | no       | free-text labels                                                         |
| `relatedConceptIds` | no       | rendered as body links                                                   |
| `supersedes`        | no       | ids this record replaces, max 32                                         |
| `materiality`       | no       | `blocking` \| `important` \| `non-blocking`                              |
| `confidence`        | no       | `low` \| `medium` \| `high`                                              |
| `owner`             | no       | a name                                                                   |

A freshly written record always gets `generated: { by, at }` and
`verified: []` — empty rather than absent, because an empty list says "not yet
verified" where a missing key would only say "this producer didn't think about
it".

### `no-decision`

`decision.none` is the explicit claim that a piece of work had nothing to
decide. It exists for workflow gates: gating on "did you write a decision?"
rewards writing a junk one; gating on "did you answer?" does not, so silence has
to be expressible. The record is idempotent — restating it overwrites rather
than colliding — and callers asking "what was decided" are never handed it.

## Validation rules

Per-record shape is the schema's job and is enforced on **every read**. So
`validate` covers only what a single record cannot see, and a problem it reports
means someone edited a file by hand.

| Check           | Reported when                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `type`          | the `type` is not one of the twelve — a note, since OKF permits any type                                                       |
| `superseded_by` | a `superseded` record names no replacement, or names one that is missing                                                       |
| `backlink`      | the replacement does not list this record in `strauss_supersedes`                                                              |
| `supersedes`    | a named target is missing, or exists but is not marked `superseded`                                                            |
| `assumption`    | `strauss_assumption` is set _and_ `sources` is non-empty — an assumption with sources is a fact that forgot to change its mind |

Each problem is `{ check, conceptId, note }`. The CLI exits **1** when the list
is non-empty: a check that reports a problem succeeded as a command and failed
as a check, and a shell caller can only see the difference through the exit
code.

## Retrieval

Three axes decide whether a record answers a question, and only one is a search
problem:

| Axis      | Source                                                  | Question                        |
| --------- | ------------------------------------------------------- | ------------------------------- |
| Relevance | BM25 where an index exists, substring where it does not | does this match?                |
| Standing  | `strauss_status`, the supersession chain                | is this still what we hold?     |
| Freshness | `stale_after`, `verified[]`                             | has anyone confirmed it lately? |

`@tobilu/qmd` is an **optional peer dependency** providing BM25 over a
`.index.sqlite` per base, rebuilt when a record is newer than the index. With it
absent — the default — `query` falls back to a substring scan over concept ids,
titles, descriptions, and bodies. Nothing throws, no answer changes shape, and
only recall degrades. Measured on a twenty-record base, the lexical tier wins on
word forms (`pages` finds a record saying only `page`) and on little else: eight
of nine probe queries returned exactly what substring returned.

### Budgets and refusals

`load` **refuses rather than truncating** when a base exceeds its budget
(25,000 tokens by default), returning `{ loaded: false, recordCount,
approxTokens, budgetTokens }`. A truncated base is indistinguishable from a
complete one, so a caller would answer "that was never decided" from a slice it
did not know was a slice. `pack` and `context` refuse the same way at their own
budgets.

A loaded result carries `tokensLoaded`, the estimate the budget is held against;
`budgetTokens: null` marks that `all` was used and no ceiling was applied.

Superseded records come back as **stubs** — `{ conceptId, title, supersededBy,
at }` — not bodies. Standing is a qualifier on a body, and over a long session
the body outlives the qualifier: the reader keeps what the record said and loses
that it no longer holds. A stub has nothing left to act on. `trace` still
reaches the content by id.

### Edges

Four edge kinds connect records in one bundle:

| Kind           | Two records are neighbours when                  |
| -------------- | ------------------------------------------------ |
| `body-link`    | one body links `](<concept-id>.md)` to the other |
| `supersession` | either direction of a supersession pair          |
| `anchor`       | they share a code anchor                         |
| `source`       | they share a source                              |

`pack` walks all four. `trace` walks `supersession`, `anchor`, and `source` —
body links can reach most of a bundle from anywhere, which suits a bounded pack
but floods a timeline. There is no separate `related` kind, because
`relatedConceptIds` is stored as a body link and a distinct kind would count the
same markdown twice.
