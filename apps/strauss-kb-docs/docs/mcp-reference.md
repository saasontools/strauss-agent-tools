---
id: mcp-reference
title: MCP reference
sidebar_label: MCP reference
sidebar_position: 6
description: Every strauss-kb MCP tool, its parameters, and a short example.
---

# MCP reference

`strauss-kb-mcp` speaks stdio and takes no API key and no required environment.

```json
{
  "mcpServers": {
    "strauss-kb": { "command": "strauss-kb-mcp" }
  }
}
```

Every tool is a projection of the same command table the
[CLI](./cli-reference.md) projects, so the two cannot drift. Twenty-six tools;
the one CLI verb with no tool is `sync-instructions` — file plumbing for hooks,
not an agent capability, and the capability it serves is `kb_context`.

`STRAUSS_KB_ACTOR` names the writer in the log, defaulting to `mcp` on this
surface. Diagnostics go to stderr, because stdout is the JSON-RPC transport.

## Shared parameters

| Parameter    | Type     | Notes                                                                                                                                                                   |
| ------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bundlePath` | `string` | **Absolute** path to the knowledge base directory. Required by every tool except `kb_schema`, `kb_types`, `kb_pins`, and `kb_context`.                                  |
| `conceptId`  | `string` | `<type>.<slug>`, both kebab-case — e.g. `decision.cursor-v2`.                                                                                                           |
| `type`       | enum     | One of `fact`, `requirement`, `constraint`, `decision`, `assumption`, `open-question`, `risk`, `contract`, `flow`, `affected-system`, `test-obligation`, `source-note`. |

`kb_schema` and `kb_types` describe the format rather than any one base;
`kb_pins` and `kb_context` read the workspace pin manifests instead. Those four
take no `bundlePath`.

The tool descriptions the server registers carry the judgment a schema cannot —
that an unsourced claim is an `assumption` and not a `fact` with a vague source,
that a conflict between two records belongs in a `risk` or a superseding
`decision` rather than being quietly resolved, and that `kb_load` is usually the
right first call.

---

## Write tools

Each of these refuses when the base is pinned `--frozen` in the workspace.

### `kb_write`

Write one record. Search first; a duplicate concept id is rejected rather than
overwritten.

| Parameter    | Type            | Required |
| ------------ | --------------- | -------- |
| `bundlePath` | `string`        | yes      |
| `type`       | enum (12 types) | yes      |
| `input`      | object          | yes      |

`input` is the write object — `slug`, `title`, `why` required; `sections`,
`anchors`, `sources`, `assumption`, `stale_after`, `verify`, `tags`,
`relatedConceptIds`, `links` (max 64), `supersedes` (max 32), `materiality`,
`confidence`, `owner` optional. Unknown keys are rejected, and `sections` keys
must be headings the type defines (see [`kb_types`](#kb_types)).

`links` are [typed causal edges](./specification.md#typed-causal-links) —
`{ target, rel }`, source → target, so a link on this record says _this record
`<rel>` the target_. The rel must be one of the eight in the closed vocabulary,
and a self-link is refused.

```json
{
  "bundlePath": "/repo/.strauss/kb",
  "type": "fact",
  "input": {
    "slug": "cache-key-includes-region",
    "title": "The cache key includes the region",
    "why": "A region-less key serves one region another region's data.",
    "sections": { "Claim": "Every key is prefixed with the region." },
    "anchors": [
      { "file": "src/cache/order-cache.ts", "symbol": "OrderCache.get" }
    ]
  }
}
```

Returns `{ conceptId, action, supersededIds }`.

### `kb_write_decision`

Write a decision, with the rejected alternative as a field.

| Parameter    | Type     | Required |
| ------------ | -------- | -------- |
| `bundlePath` | `string` | yes      |
| `input`      | object   | yes      |

`input` is `kb_write`'s object minus `sections`, plus optional `alternative`
(what you turned down and why) and `impact`.

```json
{
  "bundlePath": "/repo/.strauss/kb",
  "input": {
    "slug": "cas-not-lock",
    "title": "Compare-and-swap rather than a lock",
    "why": "A stale lock hold blocks every later writer.",
    "alternative": "A lock file, which adds a stale-hold failure mode.",
    "supersedes": ["decision.lock-file"]
  }
}
```

Returns `{ conceptId, action, supersededIds }`.

### `kb_no_decision`

Claim in one sentence that there was nothing to decide. Idempotent.

| Parameter    | Type     | Required |
| ------------ | -------- | -------- |
| `bundlePath` | `string` | yes      |
| `reason`     | `string` | yes      |

```json
{
  "bundlePath": "/repo/.strauss/kb",
  "reason": "Renamed a private helper; the diff answers it."
}
```

### `kb_status`

Move a record's status, leaving everything else alone. Compare-and-swap, so a
concurrent change fails loudly.

| Parameter    | Type                                                                                      | Required |
| ------------ | ----------------------------------------------------------------------------------------- | -------- |
| `bundlePath` | `string`                                                                                  | yes      |
| `conceptId`  | `string`                                                                                  | yes      |
| `status`     | `draft` \| `proposed` \| `accepted` \| `open` \| `resolved` \| `rejected` \| `superseded` | yes      |

```json
{
  "bundlePath": "/repo/.strauss/kb",
  "conceptId": "requirement.export-csv",
  "status": "accepted"
}
```

### `kb_supersede`

Mark a record superseded by another, linking both directions.

| Parameter       | Type     | Required |
| --------------- | -------- | -------- |
| `bundlePath`    | `string` | yes      |
| `conceptId`     | `string` | yes      |
| `replacementId` | `string` | yes      |

```json
{
  "bundlePath": "/repo/.strauss/kb",
  "conceptId": "decision.cursor-v1",
  "replacementId": "decision.cursor-v2"
}
```

### `kb_answer`

Resolve an open question: sets the status, stamps who answered and when, and
appends an Answer section.

| Parameter    | Type     | Required |
| ------------ | -------- | -------- |
| `bundlePath` | `string` | yes      |
| `conceptId`  | `string` | yes      |
| `answer`     | `string` | yes      |

```json
{
  "bundlePath": "/repo/.strauss/kb",
  "conceptId": "open-question.retry-budget",
  "answer": "Three retries with full jitter."
}
```

### `kb_verify`

Append one `verified[]` event. Appends only; a record's own generator is refused
unless the actor is `human:`-prefixed.

| Parameter    | Type               | Required                               |
| ------------ | ------------------ | -------------------------------------- |
| `bundlePath` | `string`           | yes                                    |
| `conceptId`  | `string`           | yes                                    |
| `note`       | non-blank `string` | yes — it must say what the check found |

```json
{
  "bundlePath": "/repo/.strauss/kb",
  "conceptId": "decision.cas-not-lock",
  "note": "Re-read KbStore.setStatus; the digest check is still immediately before publish."
}
```

### `kb_anchor_resolve`

Resolve a record's [anchors](./specification.md#anchors) against the working
tree: stamp a hash onto anchors that lack one, and report drift where the code
moved out from under a stored hash. An unreadable file or unfindable symbol is a
**finding, not an error**.

| Parameter    | Type      | Required | Notes                                                               |
| ------------ | --------- | -------- | ------------------------------------------------------------------- |
| `bundlePath` | `string`  | yes      |                                                                     |
| `conceptId`  | `string`  | yes      |                                                                     |
| `repoRoot`   | `string`  | no       | where the anchored source lives. Defaults to the working directory. |
| `rebaseline` | `boolean` | no       | accept the current code as the new baseline.                        |
| `restamp`    | `boolean` | no       | refresh `resolved_at` on anchors that already match.                |

An anchor that still matches is left alone rather than re-dated, so a green run
writes **nothing at all** — `restamp` exists for when you want the record to say
when it was last checked. On the CLI this exits non-zero when an anchor drifted
or when one carrying a hash no longer resolves, so a CI gate can run it.

```json
{
  "bundlePath": "/repo/.strauss/kb",
  "conceptId": "decision.cas-not-lock",
  "repoRoot": "/repo"
}
```

Returns `{ conceptId, results, verified }`, each result carrying a `state` of
`stamped`, `match`, `drifted`, or `unresolved`. A clean run appends one
`verified[]` event and is subject to the same self-verification rule as
`kb_verify`.

---

## Read tools

`kb_load`, `kb_catalog`, `kb_query`, `kb_pack`, and `kb_trace` are the only
supported ways to read a base. A raw file read bypasses supersession resolution
and returns replaced records as if current.

**The decision rule, in one line:** while the base fits `kb_load`'s token budget
(25,000 by default), `kb_load` it whole; once `kb_load` refuses, `kb_catalog` to
see every record in one line each and then `kb_pack` on the record the work
centres on; for a lookup by wording, `kb_query`.

The rungs are ordered by what they cost and by what they can tell you. A whole
read gives perfect recall and can say _no record answers this_. A catalog keeps
that second property at a fraction of the price — it names every record, so
"nothing covers this" stays a supportable conclusion — and gives up the bodies.
A query gives up both: it returns its nearest hit whatever the distance, so it
can confirm what exists and never that something does not.

### `kb_load`

Load the whole base at once, each record with its standing. Usually the right
first call: these bases run to a few thousand tokens, and a reader holding all
of it has perfect recall and knows why it is asking, which no ranker does.

| Parameter      | Type             | Required | Notes                                                                                    |
| -------------- | ---------------- | -------- | ---------------------------------------------------------------------------------------- |
| `bundlePath`   | `string`         | yes      |                                                                                          |
| `type`         | enum (12 types)  | no       | narrow to one record type                                                                |
| `budgetTokens` | positive integer | no       | approximate token ceiling. Defaults to 25000.                                            |
| `all`          | `boolean`        | no       | load everything regardless of size, bypassing the budget. Mutually exclusive with it.    |
| `repoRoot`     | `string`         | no       | where the anchored source lives, for the drift check. Defaults to the working directory. |

Refuses with counts rather than truncating when the base trips the budget,
naming the budget and pointing at the next rung down in `message`.
Superseded records arrive as name, replacement and date stubs — pass the id to
`kb_trace` for the history.

:::tip Place this output in the stable prefix
`kb_load`'s result belongs in the **stable prefix** — the system prompt, or the
first turn. In the tail, next to `kb_query` and `kb_pack`'s volatile results, it
is prompt-cache money left on the table.

A provider prompt cache matches a prefix byte-for-byte, and the first token that
differs ends the match — so one volatile result placed ahead of a stable load
prices the whole base at full rate on every call after the first. A long context
also privileges its beginning: the base that is supposed to anchor a session's
answers earns that by sitting where it is read most reliably, not by merely
being present somewhere.

The [`digest`](./specification.md#the-load-digest) is the base's content stamp —
identical content digests identically, any record changing flips it, and a
refused load carries the same digest over what would have been handed back. A
change-notification hook and `kb_stamp` (SAA-719) compare it to detect change;
the model does not reload to check.
:::

```json
{ "bundlePath": "/repo/.strauss/kb", "type": "decision" }
```

### `kb_catalog`

Every record in the base as one line — concept id, type, title, standing, and a
stale flag — sorted by type then title, at roughly thirty tokens each. The
**tier-one listing**: it costs a fraction of `kb_load` and is what to reach for
when `kb_load` refuses, because a base too large to hold whole is still small
enough to name.

| Parameter    | Type            | Required | Notes                     |
| ------------ | --------------- | -------- | ------------------------- |
| `bundlePath` | `string`        | yes      |                           |
| `type`       | enum (12 types) | no       | narrow to one record type |

What that buys is the ability to **choose**: seeing every id and title, you know
which record `kb_pack` should centre on, and you can conclude that no record
covers a question at all — the one conclusion a truncated read can never
support. Superseded records are listed with the replacement that stands in their
place. The header counts every record by standing.

Alone among the read tools this one has **no ceiling and never refuses** — it is
where the others send you, so a refusal here would leave nowhere to go. Its cost
is linear and predictable: a hundred records is about 3k tokens, a thousand
about 30k, five thousand about 150k. On a base of that last size, narrow with
`type` rather than listing everything.

```json
{ "bundlePath": "/repo/.strauss/kb", "type": "open-question" }
```

Bodies are not here; `kb_load`, `kb_pack`, and `kb_trace` fetch them.

### `kb_query`

Search and return each match with its standing. Flagged, never filtered.

| Parameter           | Type            | Required | Notes                                                                                    |
| ------------------- | --------------- | -------- | ---------------------------------------------------------------------------------------- |
| `bundlePath`        | `string`        | yes      |                                                                                          |
| `text`              | `string`        | no       | the query                                                                                |
| `type`              | enum (12 types) | no       | narrow to one record type                                                                |
| `includeNonCurrent` | `boolean`       | no       | include records that are not current. The CLI always sets this.                          |
| `repoRoot`          | `string`        | no       | where the anchored source lives, for the drift check. Defaults to the working directory. |

This is the lookup-by-wording rung, and the narrowest of the three: use it when
you know roughly what the record says. A query **cannot** tell you that nothing
was decided — it returns its nearest hit whatever the distance — so reach for
`kb_catalog` when the question is what exists.

:::note These results are volatile per call
Place them at the **tail** of the context, not the stable prefix `kb_load`'s
output belongs in, or every query invalidates a prompt cache that would
otherwise hold.
:::

```json
{
  "bundlePath": "/repo/.strauss/kb",
  "text": "cache key region",
  "includeNonCurrent": true
}
```

Each hit is `{ conceptId, title, description, standing, supersededBy, warnings,
body }`.

### `kb_pack`

The bounded neighbourhood around one record, ranked and cut, with every excluded
record named. Emits markdown.

| Parameter      | Type             | Required | Default  |
| -------------- | ---------------- | -------- | -------- |
| `bundlePath`   | `string`         | yes      |          |
| `conceptId`    | `string`         | yes      | the root |
| `hops`         | positive integer | no       | 2        |
| `maxNodes`     | positive integer | no       | 20       |
| `budgetTokens` | positive integer | no       | 25000    |

Refuses outright rather than truncating past its budget, reporting the record
count and every already-cut id.

```json
{
  "bundlePath": "/repo/.strauss/kb",
  "conceptId": "decision.cursor-v2",
  "hops": 2,
  "maxNodes": 20
}
```

### `kb_trace`

How a position was arrived at, as a timeline ordered by when each record was
written. Deliberately includes rejected, draft, and superseded records.

| Parameter    | Type                                                            | Required | Default  |
| ------------ | --------------------------------------------------------------- | -------- | -------- |
| `bundlePath` | `string`                                                        | yes      |          |
| `conceptId`  | `string`                                                        | yes      | the seed |
| `edges`      | array of `typed-link` \| `supersession` \| `anchor` \| `source` | no       | all four |
| `depth`      | positive integer                                                | no       | 3        |

`typed-link` follows only the **causal** rels — `related_to` is excluded for the
same flooding reason body links are. A `strauss_links` entry is a deliberate
claim from a closed vocabulary, which is exactly the kind of edge a timeline
should follow; a body link is any markdown a writer happened to type.

```json
{
  "bundlePath": "/repo/.strauss/kb",
  "conceptId": "decision.cursor-v2",
  "edges": ["supersession"],
  "depth": 3
}
```

Each step is `{ conceptId, at, status, title, depth, via, body }`.

### `kb_impact`

What breaks if this record changes: its transitive set of **dependants**. Use it
before superseding, contradicting, or narrowing a record — the answer is the set
of records whose claims were written assuming the current one holds, which is
exactly what a diff cannot show you.

| Parameter    | Type                 | Required | Default    | Notes                                                           |
| ------------ | -------------------- | -------- | ---------- | --------------------------------------------------------------- |
| `bundlePath` | `string`             | yes      |            |                                                                 |
| `conceptId`  | `string`             | yes      |            | the root                                                        |
| `depth`      | positive integer     | no       | unbounded  | hops out. A walk this cuts reports `truncated: true`.           |
| `rels`       | array of causal rels | no       | all causal | narrow which rels the walk follows — every rel but `related_to` |

Each rel says which of its two ends depends on the other, and it is **not always
the source**: `A depends_on B` means A needs B, so B's dependants include A;
`A informs B` means B was shaped by A, so A's dependants include B. The walk
follows each rel in whichever direction its dependence runs, which is why this
is not simply "inbound links".

`related_to` carries no dependence and is not followed. Naming it — or an
unknown rel — in `rels` is an **error** rather than an empty result, because
"nothing breaks" is the one answer you must never receive from a typo.

Every result carries its standing and nothing is filtered out, but a superseded
or rejected record is reported and **not walked through** — its own declared
edges no longer hold — and every such stopping point is named under `stopped`.
Unbounded by default, because a blast radius silently cut at some depth looks
exactly like a small one.

```json
{
  "bundlePath": "/repo/.strauss/kb",
  "conceptId": "fact.region-key",
  "rels": ["depends_on", "satisfies"]
}
```

Returns `{ root, impacted, stopped, truncated, unexpanded }`. Each impacted
record is `{ conceptId, title, standing, warnings, depth, via }`, where `depth`
1 is a direct dependant and `via` holds every edge that reached it as
`{ source, target, rel }` — the edge as it is **written**, not as it was walked.

For one flat hop of every rel, including `related_to`, use `kb_backlinks`.

### `kb_backlinks`

Who points at this record: every inbound typed causal link, one hop, every rel
including `related_to`, each with the rel it was made with and the standing of
the record that made it.

| Parameter    | Type     | Required |
| ------------ | -------- | -------- |
| `bundlePath` | `string` | yes      |
| `conceptId`  | `string` | yes      |

The flat counterpart to `kb_impact` — this answers "what does the base currently
say about this id", where `kb_impact` answers "what breaks if it changes" and
takes positions to do it. Reach for it when reviewing or renaming a record and
you need the exact edges rather than a causal closure. A backlink from a
superseded record is not a live dependency, which is why every row carries its
standing rather than arriving as a bare id.

```json
{ "bundlePath": "/repo/.strauss/kb", "conceptId": "fact.region-key" }
```

Returns `{ target, backlinks }`, each `{ from, rel, title, standing, warnings }`,
ordered by source id then rel. The outbound direction is on the record itself,
in its own `strauss_links`.

### `kb_list`

Every record, optionally narrowed to one type. For enumerating — use `kb_query`
when you have a question.

| Parameter    | Type            | Required |
| ------------ | --------------- | -------- |
| `bundlePath` | `string`        | yes      |
| `type`       | enum (12 types) | no       |

```json
{ "bundlePath": "/repo/.strauss/kb", "type": "open-question" }
```

### `kb_index`

The index, rebuilt if it disagrees with the records. The cheap re-orientation
call after compaction or deep in a long session — a few hundred tokens. Call it
(or `kb_context`, when bases are pinned) first, then `kb_load` or fetch by
concept id.

| Parameter    | Type     | Required |
| ------------ | -------- | -------- |
| `bundlePath` | `string` | yes      |

```json
{ "bundlePath": "/repo/.strauss/kb" }
```

### `kb_log`

What touched what, and when. Malformed lines are reported rather than repaired.

| Parameter    | Type     | Required |
| ------------ | -------- | -------- |
| `bundlePath` | `string` | yes      |

```json
{ "bundlePath": "/repo/.strauss/kb" }
```

---

## Format tools

### `kb_validate`

Cross-record checks: supersession links that disagree between the two records,
typed causal links whose rel is outside the closed vocabulary or whose target is
not in the bundle, and assumptions that cite sources. Per-record shape is
enforced on every read, so a problem here means someone edited a file by hand.

| Parameter    | Type     | Required |
| ------------ | -------- | -------- |
| `bundlePath` | `string` | yes      |

```json
{ "bundlePath": "/repo/.strauss/kb" }
```

Returns an array of `{ check, conceptId, note, severity }` — empty when the base
is clean. An unknown rel is an `error`, because no walk can ever traverse it; a
link to a record that does not exist yet is a `warning`, because writing a
record before the one it points at is ordinary. Only errors fail the check.

### `kb_doctor`

A health sweep over a whole base: what the calendar has already retired, what
nobody ever confirmed, what has been open or proposed long enough that the
status is now the answer, and what the graph has dropped on the floor.
**Read-only** — it never writes, never supersedes, and never re-dates anything;
every finding names a record for a person to repair.

| Parameter        | Type             | Required | Default | Notes                                                                                 |
| ---------------- | ---------------- | -------- | ------- | ------------------------------------------------------------------------------------- |
| `bundlePath`     | `string`         | yes      |         |                                                                                       |
| `expiringDays`   | positive integer | no       | 30      | how far ahead `expiring` looks                                                        |
| `unverifiedDays` | positive integer | no       | 90      | how old an unconfirmed record must be before it is reported                           |
| `agingDays`      | positive integer | no       | 90      | how long a record may stay `open` or `proposed`                                       |
| `repoRoot`       | `string`         | no       | cwd     | where the anchored source lives, for `drifted`                                        |
| `strict`         | `boolean`        | no       | —       | turns an expired record into a non-zero **CLI** exit. No effect on the report itself. |

The checks are `expired`, `expiring`, `unverified`, `aging`, `orphaned`,
`broken-supersession`, `superseded-but-cited`, and `drifted` — see the
[CLI reference](./cli-reference.md#doctor) for what each detects and the
judgments they make.

**Every group is reported even when empty**, because a check that found nothing
and a check that never ran look identical in a report that only lists findings.

This is the question no reader thinks to ask, which is why it needs a tool:
decay is invisible from inside a single record — a stale one reads exactly like
a live one, and a question nobody answered reads exactly like one nobody asked.
Reach for it when picking up a base someone else kept, before trusting a base
you have not touched in months, or on a schedule. `kb_validate` is the narrower
neighbour, checking only whether pointers between records agree.

```json
{ "bundlePath": "/repo/.strauss/kb", "unverifiedDays": 30 }
```

Returns `{ bundlePath, checkedAt, recordCount, thresholds, counts, groups,
findingCount, healthy }`, where each group is
`{ check, headline, count, findings }` and each finding is
`{ conceptId, title, status, note }`.

### `kb_schema`

JSON Schema for the frontmatter, the write input, and log entries — generated
from the code that enforces them. Takes no parameters.

```json
{}
```

### `kb_types`

The twelve record types with their purpose, body sections, and starting status.
Read this before writing rather than guessing headings — a section the type does
not define is rejected. Takes no parameters.

```json
{}
```

---

## Workspace pin tools

### `kb_pin`

Pin a base into a workspace pin manifest, so `kb_context` surfaces it at every
context birth. Idempotent — re-pinning changes nothing unless `mode`,
`profiles`, or `frozen` is given, which updates just those fields.

| Parameter    | Type                           | Required | Notes                                                                                                                                                     |
| ------------ | ------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bundlePath` | `string`                       | yes      | the base to pin                                                                                                                                           |
| `mode`       | `full` \| `index`              | no       | `full`: always emit this base's records whole (still under the block budget). `index`: never upgrade. Absent: the profile's full-under threshold decides. |
| `profiles`   | `string[]`                     | no       | context profiles this pin surfaces in. Absent: all of them.                                                                                               |
| `layer`      | `project` \| `local` \| `user` | no       | which manifest to write. Defaults to `project` — the committed `.strauss/kb-pins.json`.                                                                   |
| `frozen`     | `boolean`                      | no       | `true`: the base is concluded, and writes against it refuse while pinned. `false`: lift a freeze.                                                         |

A path with no records yet succeeds with a warning. Pins are workspace state:
the pinned base itself is never touched.

```json
{ "bundlePath": "/repo/docs/adr", "mode": "full", "layer": "project" }
```

### `kb_unpin`

Remove a base from every manifest layer that holds it — project, local, and user
— because unpinned means gone, not still injected from another file. Reports
which layers were touched.

| Parameter    | Type     | Required |
| ------------ | -------- | -------- |
| `bundlePath` | `string` | yes      |

```json
{ "bundlePath": "/repo/docs/adr" }
```

### `kb_pins`

Every pinned base across the manifest layers, each with its layer and whether it
currently resolves to readable records. Takes no parameters — it reads the
workspace manifests rather than any one base.

```json
{}
```

### `kb_context`

The pinned-base index block, for injection at every context birth. An index, not
the content: concept ids, titles and standing, with the bodies left behind
`kb_load` at the point of use. Emits nothing when nothing is pinned, and refuses
with the list of bases and their sizes rather than truncating past its budget.

Takes no `bundlePath` — which bases a session should see is workspace state.

| Parameter         | Type                 | Required | Notes                                                                                                                                          |
| ----------------- | -------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `budgetTokens`    | positive integer     | no       | ceiling on the whole block. Defaults to 4000.                                                                                                  |
| `fullUnderTokens` | positive integer     | no       | per-base threshold applied before the budget: a base whose complete load fits under this arrives as full records. Off by default.              |
| `profile`         | `string`             | no       | named budget set. Built-ins: `session-start` (full-under 1500), `compact` and `turn` (budget 2500). An unknown name falls through to defaults. |
| `format`          | `markdown` \| `json` | no       | CLI envelope for hook protocols requiring strict JSON on stdout. MCP callers omit this — the block itself is identical.                        |
| `event`           | `string`             | no       | `hookEventName` stamped into the JSON envelope. Only meaningful with `format: "json"`.                                                         |

Budgets resolve most-specific-first: explicit parameters, then the workspace
manifests' `context` tables (per profile, over their `default`), then the
built-in profile, then package defaults.

```json
{ "profile": "session-start" }
```
