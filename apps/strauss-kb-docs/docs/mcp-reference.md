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
[CLI](./cli-reference.md) projects, so the two cannot drift. Twenty-one tools;
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
`relatedConceptIds`, `supersedes` (max 32), `materiality`, `confidence`, `owner`
optional. Unknown keys are rejected, and `sections` keys must be headings the
type defines (see [`kb_types`](#kb_types)).

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

---

## Read tools

`kb_load`, `kb_query`, `kb_pack`, and `kb_trace` are the only supported ways to
read a base. A raw file read bypasses supersession resolution and returns
replaced records as if current.

### `kb_load`

Load the whole base at once, each record with its standing. Usually the right
first call: these bases run to a few thousand tokens, and a reader holding all
of it has perfect recall and knows why it is asking, which no ranker does.

| Parameter      | Type             | Required | Notes                                                                           |
| -------------- | ---------------- | -------- | ------------------------------------------------------------------------------- |
| `bundlePath`   | `string`         | yes      |                                                                                 |
| `type`         | enum (12 types)  | no       | narrow to one record type                                                       |
| `budgetTokens` | positive integer | no       | approximate ceiling. Defaults to 25000.                                         |
| `all`          | `boolean`        | no       | load everything regardless of size. **Mutually exclusive** with `budgetTokens`. |

Refuses with a count rather than truncating when the base is too large.
Superseded records arrive as name, replacement and date stubs — pass the id to
`kb_trace` for the history.

```json
{ "bundlePath": "/repo/.strauss/kb", "type": "decision" }
```

### `kb_query`

Search and return each match with its standing. Flagged, never filtered.

| Parameter           | Type            | Required | Notes                                                           |
| ------------------- | --------------- | -------- | --------------------------------------------------------------- |
| `bundlePath`        | `string`        | yes      |                                                                 |
| `text`              | `string`        | no       | the query                                                       |
| `type`              | enum (12 types) | no       | narrow to one record type                                       |
| `includeNonCurrent` | `boolean`       | no       | include records that are not current. The CLI always sets this. |

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

| Parameter    | Type                                            | Required | Default   |
| ------------ | ----------------------------------------------- | -------- | --------- |
| `bundlePath` | `string`                                        | yes      |           |
| `conceptId`  | `string`                                        | yes      | the seed  |
| `edges`      | array of `supersession` \| `anchor` \| `source` | no       | all three |
| `depth`      | positive integer                                | no       | 3         |

```json
{
  "bundlePath": "/repo/.strauss/kb",
  "conceptId": "decision.cursor-v2",
  "edges": ["supersession"],
  "depth": 3
}
```

Each step is `{ conceptId, at, status, title, depth, via, body }`.

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
and assumptions that cite sources. Per-record shape is enforced on every read,
so a problem here means someone edited a file by hand.

| Parameter    | Type     | Required |
| ------------ | -------- | -------- |
| `bundlePath` | `string` | yes      |

```json
{ "bundlePath": "/repo/.strauss/kb" }
```

Returns an array of `{ check, conceptId, note }` — empty when the base is clean.

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
