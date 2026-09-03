---
id: specification
title: Specification
sidebar_label: Specification
sidebar_position: 2
description: The record model — frontmatter, types, standing, supersession, verification, bundle layout, and validation.
---

# Specification

A knowledge base is a directory. Everything below describes what is in it.

:::tip Do not work from memory on the frontmatter contract
`strauss-kb schema` emits JSON Schema generated from the Zod schemas that
enforce it, so it cannot drift from what a write will accept.
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

The default base is `.strauss/kb`, relative to the working directory;
`--bundle PATH` addresses any other.

`INDEX.md` and `log.jsonl` are both store-owned, and differ in kind:

|         | `INDEX.md`                | `log.jsonl`                         |
| ------- | ------------------------- | ----------------------------------- |
| Nature  | derived, recomputable     | primary — events nothing else holds |
| Write   | full regenerate           | append                              |
| Repair  | rebuilt when it disagrees | malformed lines reported            |
| If lost | reconstructed free        | gone                                |

The store excludes both from record listings and repairs the index on read,
which holds only because it is the sole _accessor_.

### `INDEX.md`

A projection, one line per record, sorted by concept id:

```
- [Title](fact.cache-key.md) — fact · accepted · tags: cache · A region-less key serves the wrong data.
```

It carries `description`, not just the title, so a reader can decide what is
worth opening. No lock is needed: two writers compute the same function.

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

| Field       | Required | Meaning                                    |
| ----------- | -------- | ------------------------------------------ |
| `at`        | yes      | ISO timestamp                              |
| `by`        | yes      | the actor, from `STRAUSS_KB_ACTOR`         |
| `operation` | yes      | e.g. `write`, `verify:refused`             |
| `conceptId` | yes      | the record acted on                        |
| `target`    | no       | the second id, when an operation pairs two |

The schema is `.strict()`: unknown keys are a malformed line, and `at` must be
an ISO-8601 UTC datetime. Malformed lines are reported with their 1-based
position and never rewritten. Reads are **sorted by `at`** and **deduplicated on
exact equality** over the whole parsed entry.

### `.gitattributes` and cross-worktree writes

Git's line-level merge is wrong for a file both sides only append to, so the
first call that appends a log line writes a merge driver:

```
log.jsonl text eol=lf merge=union
```

`union` is built in, so the attribute alone is enough, and `eol=lf` pins line
endings regardless of `core.autocrlf`. A `.gitattributes` that already gives
`log.jsonl` any strategy is left alone; the step is best-effort and never fails
the mutation that triggered it.

:::warning This applies to a local `git merge`, not to GitHub
GitHub computes pull request merges through its own service, which does not read
`.gitattributes` merge-driver declarations.
:::

## Records

### Identity

The filename is the identity: `fact.auth-retries.md` has concept id
`fact.auth-retries`, the bundle-relative path with `.md` removed.

```
slug        ^[a-z0-9]+(?:-[a-z0-9]+)*$
concept id  ^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$
```

Both halves are kebab-case, enforced at the entry point because concept ids are
interpolated into markdown links unescaped.

### Frontmatter

Records are OKF v0.2 concepts: `type` is the only required key, everything else
is optional, and unknown keys are kept rather than stripped.

**OKF keys**

| Key           | Type           | Meaning                                                                           |
| ------------- | -------------- | --------------------------------------------------------------------------------- |
| `type`        | string         | the only always-required key                                                      |
| `title`       | string         | one line, in the reader's terms                                                   |
| `description` | string         | what breaks if this is wrong                                                      |
| `resource`    | string         | a path this concept names                                                         |
| `tags`        | string[]       | free-text labels ([Architecture](./architecture.md#tags-are-not-the-growth-path)) |
| `sources`     | Source[]       | material the record draws on                                                      |
| `generated`   | `{ by, at }`   | who wrote it, and when                                                            |
| `verified`    | `{ by, at }[]` | the append-only trail of checks                                                   |
| `stale_after` | string         | the date this record stops being trusted                                          |

A **source** is `{ id, resource, title?, author?, last_modified? }`, `id` and
`resource` required; footnotes key to `id`.

**strauss extensions**, namespaced so a later OKF version cannot collide:

| Key                     | Type         | Meaning                                                         |
| ----------------------- | ------------ | --------------------------------------------------------------- |
| `strauss_status`        | enum         | see [Standing](#standing-and-adjudication); defaults to `draft` |
| `strauss_supersedes`    | string[]     | ids this record replaces                                        |
| `strauss_superseded_by` | string       | the id that replaced this one                                   |
| `strauss_anchors`       | Anchor[]     | where it attaches in code — see [Anchors](#anchors)             |
| `strauss_links`         | Link[]       | typed causal edges — see [below](#typed-causal-links)           |
| `strauss_verify`        | string[]     | checks that would confirm the record still holds                |
| `strauss_answered`      | `{ by, at }` | who resolved an open question, and when                         |
| `strauss_assumption`    | boolean      | the claim has no source                                         |
| `strauss_materiality`   | enum         | `blocking`, `important`, `non-blocking`                         |
| `strauss_confidence`    | enum         | `low`, `medium`, `high`                                         |
| `strauss_owner`         | string       | a name                                                          |

### Anchors

```yaml
strauss_anchors:
  - file: src/kb-store.ts
    symbol: KbStore.setStatus
    hash: sha256:9f2c…
    lines: 24
    resolved_at: 2026-08-16T09:14:00Z
    resolver: tree-sitter
```

`strict()` — `file` is required and nothing outside this table is accepted:

| Field         | Required | Meaning                                         |
| ------------- | -------- | ----------------------------------------------- |
| `file`        | yes      | the repo-relative path the concept names        |
| `symbol`      | no       | a symbol within it; absent means the file       |
| `hash`        | no       | `sha256:<64 hex>` over the anchored text        |
| `lines`       | no       | the **line count** that hash was taken over     |
| `resolved_at` | no       | ISO timestamp of the last resolution            |
| `resolver`    | no       | `tree-sitter` or `regex`; absent reads as regex |
| `repo`        | no       | which repository; absent means the base's own   |
| `ref`         | no       | git rev the evidence was taken at; unused in v1 |

Anchors stay symbolic because they are written while the code is still moving;
once it settles, a resolution pass stamps `hash`, `lines`, `resolved_at`, and
`resolver`. Those four are measured; `repo` and `ref` are author-owned and never
stamped.
CRLF is normalized to LF before hashing, and `lines` is what lets a drift report
say how much changed.

#### Drift

An anchor carrying a hash can be re-resolved and compared. Four states:

| State        | Meaning                                    |
| ------------ | ------------------------------------------ |
| `stamped`    | had no hash; one was just written          |
| `match`      | the code still hashes to what was recorded |
| `drifted`    | it resolves, and hashes to something else  |
| `unresolved` | it no longer resolves at all               |

`unresolved` carries a reason: `file-missing`, `symbol-not-found`,
`symbol-ambiguous`, `resolver-unavailable`, `outside-repo`, `file-too-large`,
`file-unreadable`, or `foreign-repo`. `drifted` carries `resolver-changed` when
the resolver changed and the code did not.

#### Symbol resolution

A symbol resolves through a chain, and the first resolver that understands the
file answers for it:

| Resolver      | Covers                                                                         |
| ------------- | ------------------------------------------------------------------------------ |
| `tree-sitter` | `.ts` `.mts` `.cts` `.tsx` `.js` `.mjs` `.cjs` `.jsx` `.py` `.pyi` `.go` `.rs` |
| `regex`       | every other extension                                                          |
| whole-file    | an anchor with no `symbol`                                                     |

Tree-sitter parses the file and matches `tags.scm`-style definition queries. A
dotted symbol (`KbStore.setStatus`) resolves to the definition whose enclosing
chain matches — a Go method through its receiver, a Rust function through its
`impl` block. A bare symbol must match exactly one definition; two make it
`symbol-ambiguous`. Only declarations count, so a symbol that appears only in a
call is `symbol-not-found` rather than the call site. Grammars ship as WASM with
the package; one that cannot be loaded is `resolver-unavailable`, never a throw.

The regex resolver ranks candidates by shape, scopes a dotted symbol to the
nearest parent above it, and captures by brace depth or Python indentation. It
runs only where no grammar applies.

Because the two resolvers span code differently, an anchor stamped by one and
re-resolved by the other can hash differently over unchanged code. That is
reported as `drifted` with reason `resolver-changed`, and
[`anchor-resolve --rebaseline`](./cli-reference.md#anchor-resolve) accepts it;
nothing is ever restamped silently.

**Drift is computed on read, never stored.** [`load`](./cli-reference.md#load)
and [`query`](./cli-reference.md#query) re-resolve hash-carrying anchors against
the working tree and attach a warning:

```json
{
  "kind": "drifted",
  "anchors": [
    { "file": "src/kb-store.ts", "symbol": "KbStore.setStatus", "diffSize": 6 }
  ]
}
```

`diffSize` is `null` when the anchor recorded no line count. Anchors with **no**
hash are never read, and any failure degrades to no drift information rather
than failing the read. When `--repo-root` is omitted and _every_ checked anchor
comes back missing, the finding is discarded.

### Typed causal links

`strauss_links` carries directed, typed edges. Every edge reads **source →
target** and lives on the source's frontmatter, so
`{ target: fact.b, rel: depends_on }` on record `A` says _A needs B_.

```yaml
strauss_links:
  - { target: fact.index-on-created-at, rel: depends_on }
  - { target: requirement.stable-ordering, rel: satisfies }
```

The vocabulary is **closed** — eight rels, and nothing else may be written:

| `rel`         | Meaning                                                | Dependant |
| ------------- | ------------------------------------------------------ | --------- |
| `depends_on`  | the source needs the target to hold                    | source    |
| `constrains`  | the source bounds what the target may do               | target    |
| `informs`     | the source shaped the target without binding it        | target    |
| `blocks`      | the target cannot proceed until the source is settled  | target    |
| `invalidates` | the source makes the target no longer hold             | target    |
| `verified_by` | the target is the check that confirms the source       | source    |
| `satisfies`   | the source discharges the target's requirement         | source    |
| `related_to`  | a pointer worth following, with no claim of dependence | —         |

The **dependant** column is load-bearing: dependence does not follow the
direction of the edge, so [`impact`](./cli-reference.md#impact) follows each rel
in whichever direction its dependence runs, and nothing propagates along
`related_to`. Supersession is a lifecycle rather than a rel.

**Tolerant read, strict write.** The schema keeps `rel` a plain string so an
unknown rel stays readable; `composeRecord` refuses to write one, and
[`validate`](#validation-rules) turns a stored one into an error. `target` need
not resolve. The write path caps `links` at **64** and refuses a self-link. Each
link also renders into the body as one sentence from a fixed per-rel template —
`Depends on [fact.b](fact.b.md).`

### Body

Section headings come from the record's type (see [Record types](#record-types))
and are **ordered**; one the type does not define is rejected, and one left
empty is omitted rather than stubbed. Body edges are markdown links, directed
but untyped, and broken ones are legal; `relatedConceptIds` renders as
`Relates to [id](id.md).`

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

A lock file, which adds a stale-hold failure mode.
```

## Record types

Twelve types, differing only in what their body answers and where they start in
the lifecycle.

| Type              | Purpose                                          | Sections                                          | Initial status |
| ----------------- | ------------------------------------------------ | ------------------------------------------------- | -------------- |
| `fact`            | Observed or sourced fact                         | Claim · Evidence · Implication                    | `accepted`     |
| `requirement`     | Required behavior or outcome                     | Claim · Evidence · Implication                    | `proposed`     |
| `constraint`      | Limitation, boundary, policy, or restriction     | Claim · Evidence · Implication                    | `accepted`     |
| `decision`        | Chosen or proposed direction                     | Decision · Rationale · Rejected · Impact          | `accepted`     |
| `assumption`      | Unsourced working assumption                     | Claim · Why we think so · What would falsify it   | `draft`        |
| `open-question`   | Question needing resolution                      | Question · Why it matters · Default assumption    | `open`         |
| `risk`            | Something that can go wrong                      | Risk · Why it matters · Mitigation · Verification | `open`         |
| `contract`        | API, data, event, schema, or permission contract | Contract · Producer · Consumer · Compatibility    | `proposed`     |
| `flow`            | Sequence, lifecycle, or state behavior           | Flow · Trigger · Steps · Failure modes            | `accepted`     |
| `affected-system` | Component, service, package, or external system  | System · How it is affected · Blast radius        | `accepted`     |
| `test-obligation` | Behavior or contract that must be verified       | Obligation · Why it matters · How to verify       | `open`         |
| `source-note`     | Extracted note from source material              | Note · Where it came from                         | `accepted`     |

`strauss-kb types` prints this table from the code. An unrecognised OKF `type`
is a **note**, not a failure.

## Standing and adjudication

OKF answers "is this still true?"; standing answers "is this settled, and does
it still apply?". Seven statuses map onto five standings:

| `strauss_status` | Standing     | Warning attached                      |
| ---------------- | ------------ | ------------------------------------- |
| `accepted`       | `current`    | —                                     |
| `resolved`       | `current`    | —                                     |
| `draft`          | `unsettled`  | `unsettled`                           |
| `proposed`       | `unsettled`  | `unsettled`                           |
| `open`           | `open`       | `unresolved-question`                 |
| `rejected`       | `rejected`   | `rejected`                            |
| `superseded`     | `superseded` | `superseded`, with the resolved heads |

Adjudication attaches standing to every hit and never drops one: a filtered
result set is invisible. `query` drops a superseded record only when its
replacement is also in the results.

### Warnings

| Warning               | Meaning                                                                              |
| --------------------- | ------------------------------------------------------------------------------------ |
| `rejected`            | explicitly not adopted — a well-formed assertion of what someone decided _not_ to do |
| `superseded`          | replaced; carries `by`, the surviving heads                                          |
| `unsettled`           | `draft` or `proposed`                                                                |
| `unresolved-question` | says a matter is unresolved — valuable as a result, never as an answer               |
| `broken-chain`        | `strauss_superseded_by` names a record not in the bundle                             |
| `chain-cycle`         | the supersession walk revisited a record                                             |
| `forked-chain`        | two records claim to replace this one, so every head is reported                     |
| `stale`               | `stale_after` is in the past                                                         |
| `unverified`          | `verified[]` is empty                                                                |
| `drifted`             | anchored code moved; carries `anchors`, each with `diffSize` and any reason          |

## Supersession

A record whose meaning changed is **superseded**, never edited or deleted: one
that quietly becomes something else invalidates every reference to it. Both
directions are written together:

```
old.strauss_superseded_by = new
new.strauss_supersedes    = [old, …]
```

Two paths write that pair: `supersede <old> <new>`, and `write` /
`write-decision` carrying `supersedes`, which publishes the new record first and
then marks each prior record it names.

An id naming a record that does not exist yet is legal, one naming the record's
own id is a no-op, duplicates mark once, and the array is capped at **32**. The
write returns `{ conceptId, action, supersededIds }`, where `supersededIds`
holds only the ids **actually** marked, so a crash mid-way is reported by
`validate` rather than silent.

### Chain resolution happens on read

Walking to the head is done at read time, following **both** pointers: a stored
head would have to be rewritten on every ancestor whenever a chain grows. A
cycle terminates with `chain-cycle`, a fork reports every head, and a missing
replacement is `broken-chain`.

## Verification

`verified[]` is a record's append-only trail of checks: OKF's `{ by, at }` actor
stamp, plus a required `note` on entries `verify` writes. Prior entries are
spread forward untouched, and the schema still reads the noteless OKF shape.

A verifier whose actor equals the record's `generated.by`, compared
case-insensitively, is refused unless the actor is `human:`-prefixed: a
generator re-reading its own output is not an independent check. The refusal is
logged as `verify:refused`, and `human:` is an honor-system label. Adjudication
today reports only the `unverified` warning.

## Writes

Records are staged to a sibling file and published atomically with `link`, which
**fails when the name is taken** — a 409 carrying `action: "refused"` in its
`details`. `rename` is used only when the caller passes `overwrite`.
Read-modify-write (`status`, `answer`) checks a content digest immediately
before publishing; see
[Architecture](./architecture.md#compare-and-swap-rather-than-a-lock).

### Write input

`write` takes a type and this object; `write-decision` takes the same minus
`sections`, plus `alternative` and `impact`. The schema is `.strict()`, so
unknown keys are rejected.

| Field               | Required | Meaning                                                       |
| ------------------- | -------- | ------------------------------------------------------------- |
| `slug`              | yes      | the second half of the concept id                             |
| `title`             | yes      | one line → OKF `title`                                        |
| `why`               | yes      | what breaks if this is wrong → OKF `description`              |
| `sections`          | no       | keyed by the type's section headings; unknown ones rejected   |
| `anchors`           | no       | `{ file, symbol? }[]`                                         |
| `sources`           | no       | `{ id, resource, title?, author?, last_modified? }[]`         |
| `assumption`        | no       | `true` when no source exists                                  |
| `stale_after`       | no       | `YYYY-MM-DD`, and a real date                                 |
| `verify`            | no       | checks that would confirm this still holds                    |
| `tags`              | no       | free-text labels                                              |
| `relatedConceptIds` | no       | rendered as body links                                        |
| `links`             | no       | typed edges `{ target, rel }`, max 64; a self-link is refused |
| `supersedes`        | no       | ids this record replaces, max 32                              |
| `materiality`       | no       | `blocking` \| `important` \| `non-blocking`                   |
| `confidence`        | no       | `low` \| `medium` \| `high`                                   |
| `owner`             | no       | a name                                                        |

Every written record gets `generated: { by, at }` and `verified: []`.

### `no-decision`

`decision.none` is the explicit claim that a piece of work had nothing to
decide, so a workflow gate can ask "did you answer?" rather than "did you write
a decision?". It is idempotent, and "what was decided" never returns it.

## Validation rules

Per-record shape is enforced on **every read**, so `validate` covers only what a
single record cannot see; a problem it reports means someone hand-edited a file.

| Check           | Severity | Reported when                                                         |
| --------------- | -------- | --------------------------------------------------------------------- |
| `type`          | error    | the `type` is not one of the twelve — a note, since OKF permits any   |
| `superseded_by` | error    | a `superseded` record names no replacement, or a missing one          |
| `backlink`      | error    | the replacement does not list this record in `strauss_supersedes`     |
| `supersedes`    | error    | a named target is missing, or is not marked `superseded`              |
| `link_rel`      | error    | a `rel` outside the closed vocabulary                                 |
| `link_target`   | error    | a target that is not a well-formed concept id                         |
| `link_target`   | warning  | a well-formed target not in the bundle, or a record linking to itself |
| `assumption`    | error    | `strauss_assumption` set _and_ `sources` non-empty                    |

Each problem is `{ check, conceptId, note, severity }`, and **only errors fail
the check** — the CLI exits **1** on at least one. The line between the two is
whether time can fix it: a link to a record that does not exist **yet** is the
ordinary state of a base being written. These checks live here rather than in
the schema because a file that fails to parse is skipped by listings.

## Retrieval

Three axes decide whether a record answers a question, and only one is a search
problem:

| Axis      | Source                                     | Question                        |
| --------- | ------------------------------------------ | ------------------------------- |
| Relevance | BM25 where an index exists, else substring | does this match?                |
| Standing  | `strauss_status`, the supersession chain   | is this still what we hold?     |
| Freshness | `stale_after`, `verified[]`                | has anyone confirmed it lately? |

`@tobilu/qmd` is an **optional peer dependency** providing BM25 over a
`.index.sqlite` per base, rebuilt when a record is newer than the index. Absent
— the default — `query` falls back to a substring scan over concept ids, titles,
descriptions, and bodies, and only recall degrades: on a twenty-record base,
eight of nine probe queries returned what substring returned.

### Budgets and refusals

`load` **refuses rather than truncating** past a ceiling, because a truncated
base is indistinguishable from a complete one; `pack` and `context` do the same
at their own budgets.

| Ceiling                     | Default | Held against                              |
| --------------------------- | ------- | ----------------------------------------- |
| `--budget` / `budgetTokens` | 25,000  | the estimated size of what is handed back |

The comparison is strictly greater, so a base at the budget loads.

```json
{
  "loaded": false,
  "recordCount": 62,
  "approxTokens": 31000,
  "budgetTokens": 25000,
  "message": "Refusing to load this base whole: 31000 tokens is past the 25,000-token budget. …"
}
```

`message` names the budget value, the next calls, and both escape hatches. A
**successful** load reports `recordCount`, `budgetTokens`, and `tokensLoaded`;
nulls mark that `all` was used.

### The load digest

Every `load` result, refused or not, carries a `digest`: one SHA-256 over the
records it would hand back. Each current record contributes
`<conceptId>:current:<hash of its canonical recomposed markdown>` and each
superseded stub `<conceptId>:superseded:<hash of the stub>`, sorted, joined,
hashed again — any change flips it. A hook or `kb_stamp` (SAA-719) detects
change without loading. It also drives
[cache-stable placement](./mcp-reference.md#kb_load).

:::caution A same-environment signal, not a cross-checkout proof
The digest hashes each record's **canonical recomposed** form, not its on-disk
bytes, and the parser does not normalize the body's line endings — so a record
authored with CRLF digests differently from the same record authored with LF.
:::

Superseded records come back as **stubs** — `{ conceptId, title, supersededBy,
at }` — not bodies, because over a long session a body outlives its qualifier.
`trace` still reaches the content by id.

### Edges

Five edge kinds connect records in one bundle:

| Kind           | Two records are neighbours when                       | Directed |
| -------------- | ----------------------------------------------------- | -------- |
| `body-link`    | one body links `](<concept-id>.md)` to the other      | yes      |
| `typed-link`   | one declares a `strauss_links` entry naming the other | yes      |
| `supersession` | either direction of a supersession pair               | no       |
| `anchor`       | they share a code anchor                              | no       |
| `source`       | they share a source                                   | no       |

The first two are edges a record itself **makes**; the other three are
symmetric. `pack` walks all five with the whole rel vocabulary including
`related_to`. `trace` walks `typed-link`, `supersession`, `anchor`, and
`source`, narrowed to the **causal** rels: body links and `related_to` would
flood a timeline. There is no separate `related` kind, because
`relatedConceptIds` is stored as a body link.

A pair connected both ways comes back with **both** kinds in `via`, and an
unknown rel is never traversed. The **inbound** half of a typed edge is answered
by [`backlinks`](./cli-reference.md#backlinks) and
[`impact`](./cli-reference.md#impact).
