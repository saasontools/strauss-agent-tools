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
  .gitattributes      merge      store-owned, written on first write
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

The store excludes the store-owned files from record listings, and repairs the
index on read. Both hold only because everything goes through one door: the store is
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

The schema is `.strict()`: unknown keys are a malformed line, and `at` must be
an ISO-8601 UTC datetime — a well-formed line carrying an unreadable date is
malformed rather than sorted unpredictably. Malformed lines are _reported_ with
their 1-based position and never rewritten — rewriting an append-only log
destroys the only copy of what it holds.

Reads are **sorted by `at`** and **deduplicated on exact equality**: the key is
the whole parsed entry, so two entries differing only in their timestamp are
both kept. Both exist to absorb what a union merge does to an append-only file,
below.

### `.gitattributes` and cross-worktree writes

A committed base is routinely written from more than one worktree at once, and
each appends to the same `log.jsonl`. Git's ordinary line-level merge is the
wrong resolution for that: it picks a side, or conflicts, on lines both branches
only ever meant to _add_.

So the first call that appends a log line writes a merge driver for it:

```
log.jsonl text eol=lf merge=union
```

`union` is one of git's built-in drivers, so the attribute alone is enough —
nothing else needs configuring. `eol=lf` pins line endings regardless of a
checkout's `core.autocrlf`, so a Windows checkout cannot leave the file with
endings mixed against the raw `\n` every append writes.

The write is careful about a file that is already there. A missing
`.gitattributes` is created exclusively, so a racing creator loses loudly rather
than being truncated. An existing one that declares **no** merge strategy for
`log.jsonl` gets the line appended. An existing one that already gives
`log.jsonl` _any_ strategy — this one, or a deliberate `merge=ours` — is left
alone rather than layered under a second, possibly conflicting declaration. The
whole step is best-effort: a failure is logged and never fails the mutation that
triggered it.

A union merge does not preserve line order, and can occasionally keep the same
line twice — a cherry-pick or rebase that carried one side's entry into the
other's history before the merge. That is exactly what the reader's sort and
exact-duplicate dedupe absorb, so neither is something a caller accounts for.

:::warning This applies to a local `git merge`, not to GitHub
GitHub computes pull request merges through its own service, which does not read
`.gitattributes` merge-driver declarations. A PR merging two branches'
`log.jsonl` appends gets git's ordinary line-level merge — or a conflict — even
with the attribute in place. The union driver only fires for a merge run by a
local git client.
:::

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
| `strauss_anchors`       | Anchor[]     | where the record attaches in the code — see [Anchors](#anchors)              |
| `strauss_links`         | Link[]       | typed causal edges — see [Typed causal links](#typed-causal-links)           |
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
  - file: src/kb-store.ts
    symbol: KbStore.setStatus
    hash: sha256:9f2c…
    lines: 24
    resolved_at: 2026-08-16T09:14:00Z
```

Symbolic on purpose, and `strict()` — `file` is required and nothing outside
this table is accepted:

| Field         | Required | Meaning                                                       |
| ------------- | -------- | ------------------------------------------------------------- |
| `file`        | yes      | the repo-relative path the concept names                      |
| `symbol`      | no       | a symbol within it; absent means the anchor is about the file |
| `hash`        | no       | `sha256:<64 hex>` over the anchored text as it was            |
| `lines`       | no       | the **line count** of the text that hash was taken over       |
| `resolved_at` | no       | ISO timestamp of the last successful resolution               |

Anchors stay symbolic because they are written while the code is still moving: a
`line: 379` recorded at minute five is wrong by minute forty, but
`OrderService.cancel` survives every edit that does not rename it. Once the
change settles, a resolution pass stamps `hash`, `lines`, and `resolved_at`.

`hash` carries its algorithm as a prefix so a future one can coexist with stored
values. CRLF is normalized to LF before hashing, so checkout style cannot read
as drift. `lines` exists because the anchor keeps a **hash, not the text**:
without the line count at hash time, a drift report could say "changed" but
never how much. It is a count, not a range — the three optional fields are all
optional precisely so anchors written before this existed stay valid.

#### Drift

An anchor carrying a hash can be re-resolved and compared. Four states:

| State        | Meaning                                         |
| ------------ | ----------------------------------------------- |
| `stamped`    | the anchor had no hash and one was just written |
| `match`      | the code still hashes to what was recorded      |
| `drifted`    | it resolves, and hashes to something else       |
| `unresolved` | it no longer resolves at all                    |

`unresolved` carries a reason: `file-missing`, `symbol-not-found`,
`outside-repo`, `file-too-large`, or `file-unreadable`. A deleted file is as
much a broken anchor as a rewritten one.

**Drift is computed on read, never stored.** [`load`](./cli-reference.md#load)
and [`query`](./cli-reference.md#query) re-resolve hash-carrying anchors against
the working tree and attach a `drifted` warning to any record whose anchors no
longer match:

```json
{
  "kind": "drifted",
  "anchors": [
    { "file": "src/kb-store.ts", "symbol": "KbStore.setStatus", "diffSize": 6 }
  ]
}
```

`diffSize` is `null` when the anchor recorded no line count — size unknown, not
zero. Anchors with **no** hash are never read, so a base nobody has stamped
costs nothing. The whole step is an enrichment: any failure degrades to no
drift information rather than failing the read.

`--repo-root` says where the anchored source lives, defaulting to the working
directory. When it is omitted and _every_ checked anchor comes back missing, the
finding is discarded rather than reported — that pattern means the command ran
from the wrong directory, not that the repository lost every anchored file.

### Typed causal links

`strauss_links` carries directed, typed edges between records. Every edge reads
**source → target** and lives on the source's frontmatter, so
`{ target: fact.b, rel: depends_on }` on record `A` says _A needs B_.

```yaml
strauss_links:
  - { target: fact.index-on-created-at, rel: depends_on }
  - { target: requirement.stable-ordering, rel: satisfies }
```

The vocabulary is **closed** — eight rels, and nothing else may be written:

| `rel`         | Meaning                                                                                        | Dependant |
| ------------- | ---------------------------------------------------------------------------------------------- | --------- |
| `depends_on`  | The source needs the target to hold; the source breaks if the target changes                   | source    |
| `constrains`  | The source bounds what the target may do; the target breaks if the constraint changes          | target    |
| `informs`     | The source shaped the target without binding it; the target is what needs revisiting           | target    |
| `blocks`      | The target cannot proceed until the source is settled; the target is what waits                | target    |
| `invalidates` | The source makes the target no longer hold; the target is what stops holding                   | target    |
| `verified_by` | The target is the check that confirms the source; the source's confirmation moves with it      | source    |
| `satisfies`   | The source discharges the target's requirement; the source must change if the requirement does | source    |
| `related_to`  | A pointer worth following, with no claim of dependence                                         | —         |

The **dependant** column is the load-bearing one, and it is why a boolean could
not express this: the direction of dependence does not follow the direction of
the edge. `A depends_on B` puts the dependant at the source, so B's dependants
include A. `A informs B` puts it at the target, so A's dependants include B. A
walk that treated every inbound edge as a dependant would report the blast
radius of `informs`, `blocks`, `invalidates`, and `constrains` **backwards** —
naming the records that are safe and omitting the ones at risk.
[`impact`](./cli-reference.md#impact) follows each rel in whichever direction
its dependence runs. `related_to` asserts no dependence, so nothing propagates
along it.

Supersession is deliberately **not** a rel. It is a lifecycle: a record's
standing changes, `strauss_supersedes` / `strauss_superseded_by` carry it in
both directions, and the store settles the pair. Restating it as an edge would
give one fact two spellings that can disagree.

**Tolerant read, strict write.** The frontmatter schema keeps `rel` as a plain
string, for the same reason `type` is open: a record carrying a rel this package
does not know must stay _readable_, because a bundle cannot report a defect in a
file it refuses to load. Rejecting it at parse time would make the record vanish
from listings instead. So `composeRecord` refuses to **write** anything outside
the vocabulary, and [`validate`](#validation-rules) is what turns a stored
unknown rel into an error. `target` likewise is not required to resolve —
records are routinely written before the ones they point at.

The write path caps `links` at **64** entries and refuses a self-link outright,
with `kb: <id> cannot <rel> itself — a link must name another record`. A
self-link asserts a record depends on itself, which no walk can act on.

Each link is also rendered into the body as one prose sentence from a fixed
per-rel template — `Depends on [fact.b](fact.b.md).` — so an OKF reader that has
never heard of `strauss_links` still gets the meaning. The frontmatter is
authoritative; the sentence is its rendering, which is why a hand-written record
carrying only the frontmatter still connects.

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
| `drifted`             | The code a hash-carrying anchor points at moved out from under it. Carries `anchors`, each with its `diffSize` and, where it no longer resolves, a reason.    |

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
| `links`             | no       | typed causal edges `{ target, rel }`, max 64. A self-link is refused     |
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

| Check           | Severity | Reported when                                                                                                                  |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `type`          | error    | the `type` is not one of the twelve — a note, since OKF permits any type                                                       |
| `superseded_by` | error    | a `superseded` record names no replacement, or names one that is missing                                                       |
| `backlink`      | error    | the replacement does not list this record in `strauss_supersedes`                                                              |
| `supersedes`    | error    | a named target is missing, or exists but is not marked `superseded`                                                            |
| `link_rel`      | error    | a `strauss_links` entry's `rel` is outside the closed vocabulary                                                               |
| `link_target`   | error    | a link target is not a well-formed concept id — no write could ever produce that filename                                      |
| `link_target`   | warning  | a well-formed link target is not in the bundle, or a record links to itself                                                    |
| `assumption`    | error    | `strauss_assumption` is set _and_ `sources` is non-empty — an assumption with sources is a fact that forgot to change its mind |

Each problem is `{ check, conceptId, note, severity }`, where `severity` is
`error` or `warning`. **Only errors fail the check** — the CLI exits **1** when
at least one finding is an error, because a check that reports a problem
succeeded as a command and failed as a check, and a shell caller can only see
the difference through the exit code.

The line between the two is whether time can fix it. An unknown `rel` is a claim
no walk can ever traverse and no later write repairs; a malformed target names a
file no write could produce. Both are wrong now and forever. A link to a record
that does not exist **yet** is the ordinary state of a base being written — the
same tolerance body links already have — so failing on it would train callers to
ignore the exit code, which is the one signal a shell caller has.

The typed-link checks live here rather than in the schema for a reason that
looks backwards until you try the alternative: a frontmatter schema that rejected
an unknown `rel` would make the offending file fail to parse, and a file that
fails to parse is skipped by listings. The bundle would silently drop the record
instead of reporting it, and the writer would never learn why.

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

`load` **refuses rather than truncating** when a base exceeds a ceiling. A
truncated base is indistinguishable from a complete one, so a caller would
answer "that was never decided" from a slice it did not know was a slice. `pack`
and `context` refuse the same way at their own budgets.

Two ceilings, and they ask different questions:

| Ceiling                        | Default | Held against                                                   |
| ------------------------------ | ------- | -------------------------------------------------------------- |
| `--max-records` / `maxRecords` | 40      | whole records handed back (`pageCount`); stubs are not counted |
| `--budget` / `budgetTokens`    | 25,000  | the estimated size of what is handed back (`approxTokens`)     |

The record gate is not a restatement of the budget. The budget asks whether the
base will _fit_; the gate asks whether it is the right _shape_ to read whole. A
base of many short records passes the budget and still reads as a skim, and the
recall a whole read buys is the entire reason to prefer it over searching. The
comparison is strictly greater, so a base sitting exactly at the gate loads.

A refusal is:

```json
{
  "loaded": false,
  "recordCount": 62,
  "pageCount": 62,
  "approxTokens": 18400,
  "budgetTokens": 25000,
  "maxRecords": 40,
  "refusedBy": ["pages"],
  "message": "Refusing to load this base whole: 62 records is past the 40-record gate. …"
}
```

`refusedBy` names every ceiling that tripped — `pages` and `tokens`, pages
first. The `message` names the gate value, the next calls, and both escape
hatches, because a caller told only "too big" raises the ceiling, which is the
one move the ceiling exists to discourage, and a caller told nothing at all
invents a raw file read, which is worse.

A **successful** load reports `pageCount` and `maxRecords` too, symmetric with
the refusal: a caller that can see how close it came can act before the base
crosses the line, where one that only ever hears "refused" finds out by being
refused. It also carries `tokensLoaded`, the estimate the budget is held
against. `budgetTokens: null` and `maxRecords: null` mark that `all` was used
and no ceiling was applied.

:::note A base of 41 or more whole records now refuses
The record gate is on by default, so a base that loaded before may refuse. That
is the intended behaviour — the token budget cannot see shape — but it is a
change in what an unchanged call returns. Raise `maxRecords`, or pass `all`, to
restore the old result on a given call; the intended path past the gate is
`catalog` then `pack`.
:::

### The load digest

Every `load` result — refused or not — carries a `digest`: one SHA-256, hex, over
every record it would hand back.

Each current record contributes `<conceptId>:current:<hash of its canonical
recomposed markdown>`, each superseded stub contributes
`<conceptId>:superseded:<hash of the stub>`, the entries are sorted, joined, and
hashed again. So the digest never depends on listing order, identical content
digests identically across calls, and any record's body, frontmatter, or
standing flipping changes it. A refused load carries the same digest computed
over what _would_ have been handed back, so a caller narrowing a `type` filter
after a refusal can tell whether that changed anything without loading it.

It exists for [cache-stable placement](./mcp-reference.md#kb_load): hold `load`'s
output in a stable prefix and reload only when the digest changes.

:::caution A same-environment signal, not a cross-checkout proof
The digest hashes each record's **canonical recomposed** form, not its on-disk
bytes — deliberately different input from the write path's content-addressed
check, and the two are never interchangeable. The frontmatter parser does not
normalize the body's line endings, so a record authored with CRLF digests
differently from the same record authored with LF. A bundle that has crossed a
line-ending-translating `git checkout`, or been edited from two platforms, can
digest differently for reasons that have nothing to do with what changed.
:::

Superseded records come back as **stubs** — `{ conceptId, title, supersededBy,
at }` — not bodies. Standing is a qualifier on a body, and over a long session
the body outlives the qualifier: the reader keeps what the record said and loses
that it no longer holds. A stub has nothing left to act on. `trace` still
reaches the content by id.

### Edges

Five edge kinds connect records in one bundle:

| Kind           | Two records are neighbours when                       | Directed |
| -------------- | ----------------------------------------------------- | -------- |
| `body-link`    | one body links `](<concept-id>.md)` to the other      | yes      |
| `typed-link`   | one declares a `strauss_links` entry naming the other | yes      |
| `supersession` | either direction of a supersession pair               | no       |
| `anchor`       | they share a code anchor                              | no       |
| `source`       | they share a source                                   | no       |

`body-link` and `typed-link` are the edges a record itself **makes**, read off
its own body or frontmatter. The other three are symmetric: they hold because
both records name the same thing, so either end sees the other.

`pack` walks all five, taking the whole rel vocabulary including `related_to` —
a neighbourhood is the one place a bibliography belongs. `trace` walks
`typed-link`, `supersession`, `anchor`, and `source`, and narrows the typed
edges to the **causal** rels only.

Body links stay out of a trace because they are cheap to make: a body link is
any markdown a writer happened to type, where a `strauss_links` entry is a
deliberate claim from a closed vocabulary. That is exactly the kind of edge a
timeline should follow — "we chose this because of that" is the history.
`related_to` is excluded from a trace for the same flooding reason body links
are. There is no separate `related` kind, because `relatedConceptIds` is stored
as a body link and a distinct kind would count the same markdown twice.

A pair connected both ways — a declared link that is also written about — comes
back with **both** kinds in `via`, which is the honest answer. An unknown rel is
never traversed anywhere; it is a claim no walk can interpret, so `validate`
reports it rather than a walk quietly acting on it.

The **inbound** half of a typed edge is a different question, answered by
[`backlinks`](./cli-reference.md#backlinks) and
[`impact`](./cli-reference.md#impact) rather than by this walk, which only ever
answers "what does this record point at".
