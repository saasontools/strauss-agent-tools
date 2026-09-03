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
{ "mcpServers": { "strauss-kb": { "command": "strauss-kb-mcp" } } }
```

Every tool is a projection of the same command table the
[CLI](./cli-reference.md) projects, so the two cannot drift. Twenty-three tools;
the one CLI verb with no tool is `sync-instructions`. `STRAUSS_KB_ACTOR` names
the writer in the log, defaulting to `mcp` here. Diagnostics go to stderr,
because stdout is the JSON-RPC transport.

## Shared parameters

- `bundlePath` (`string`) — **absolute** path to the base. Required by every
  tool except `kb_schema`, `kb_types`, `kb_pins`, and `kb_context`.
- `conceptId` (`string`) — `<type>.<slug>`, both kebab-case, e.g.
  `decision.cursor-v2`.
- `type` (enum) — one of `fact`, `requirement`, `constraint`, `decision`,
  `assumption`, `open-question`, `risk`, `contract`, `flow`, `affected-system`,
  `test-obligation`, `source-note`.

The tool descriptions the server registers carry the judgment a schema cannot:
an unsourced claim is an `assumption`, a conflict belongs in a `risk` or a
superseding `decision`, and `kb_load` is usually the right first call.

---

## Write tools

Each refuses when the base is pinned `--frozen` in the workspace.

### `kb_write`

As CLI [`write`](./cli-reference.md#write); the record object is the
`input` parameter rather than stdin.

Parameters: `bundlePath`, `type` (enum, 12 types), `input` (object) — all
required. `input` is the write object — `slug`, `title`, `why` required;
`sections`, `anchors`, `sources`, `assumption`, `stale_after`, `verify`, `tags`,
`relatedConceptIds`, `links` (max 64), `supersedes` (max 32), `materiality`,
`confidence`, `owner` optional. Unknown keys are rejected, and `sections` keys
must be headings the type defines (see [`kb_types`](#kb_types)). `links` are
[typed causal edges](./specification.md#typed-causal-links) — `{ target, rel }`,
source → target, from the closed eight-rel vocabulary; a self-link is refused.

```json
{
  "bundlePath": "/repo/.strauss/kb",
  "type": "fact",
  "input": {
    "slug": "cache-key-includes-region",
    "title": "The cache key includes the region",
    "why": "A region-less key serves another region's data.",
    "sections": { "Claim": "Every key is prefixed with the region." }
  }
}
```

### `kb_write_decision`

As CLI [`write-decision`](./cli-reference.md#write-decision). Parameters:
`bundlePath` and `input`, both required; `input` is `kb_write`'s object minus
`sections`, plus optional `alternative` and `impact`.

```json
{
  "bundlePath": "/repo/.strauss/kb",
  "input": {
    "slug": "cas-not-lock",
    "title": "Compare-and-swap rather than a lock",
    "why": "A stale lock hold blocks every later writer.",
    "alternative": "A lock file, which adds a stale-hold failure mode."
  }
}
```

### `kb_no_decision`

As CLI [`no-decision`](./cli-reference.md#no-decision). Parameters:
`bundlePath` and `reason` (`string`), both required.

```json
{ "bundlePath": "/repo/.strauss/kb", "reason": "The diff answers it." }
```

### `kb_status`

As CLI [`status`](./cli-reference.md#status). Parameters: `bundlePath`,
`conceptId`, and `status` — one of `draft`, `proposed`, `accepted`, `open`,
`resolved`, `rejected`, `superseded` — all required.

```json
{
  "bundlePath": "…/kb",
  "conceptId": "requirement.export-csv",
  "status": "accepted"
}
```

### `kb_supersede`

As CLI [`supersede`](./cli-reference.md#supersede). Parameters:
`bundlePath`, `conceptId`, `replacementId` — all required.

```json
{
  "bundlePath": "…/kb",
  "conceptId": "decision.cursor-v1",
  "replacementId": "decision.cursor-v2"
}
```

### `kb_answer`

As CLI [`answer`](./cli-reference.md#answer). Parameters: `bundlePath`,
`conceptId`, `answer` (`string`) — all required.

```json
{
  "bundlePath": "…/kb",
  "conceptId": "open-question.retry-budget",
  "answer": "Three retries with full jitter."
}
```

### `kb_verify`

As CLI [`verify`](./cli-reference.md#verify); `--note` is the `note`
parameter, a non-blank string that must say what the check found. Parameters:
`bundlePath`, `conceptId`, `note` — all required.

```json
{
  "bundlePath": "…/kb",
  "conceptId": "decision.cas-not-lock",
  "note": "Re-read KbStore.setStatus; the digest check is still before publish."
}
```

### `kb_anchor_resolve`

As CLI [`anchor-resolve`](./cli-reference.md#anchor-resolve), with the
flags as camelCase parameters. The non-zero exit on drift is CLI-only.

Parameters: `bundlePath` and `conceptId` required; `repoRoot` (`string`,
defaults to the working directory), `rebaseline` (`boolean`) and `restamp`
(`boolean`) optional.

```json
{
  "bundlePath": "…/kb",
  "conceptId": "decision.cas-not-lock",
  "repoRoot": "/repo"
}
```

---

## Read tools

`kb_load`, `kb_catalog`, `kb_query`, `kb_pack`, and `kb_trace` are the only
supported ways to read a base: a raw file read bypasses supersession resolution.

### `kb_load`

As CLI [`load`](./cli-reference.md#load), with the flags as camelCase
parameters. Usually the right first call.

Parameters: `bundlePath` required; `type` (enum, narrows to one record type),
`budgetTokens` (positive integer, default 25000), `all` (`boolean` — bypasses
the budget, mutually exclusive with `budgetTokens`), and `repoRoot` (`string`, default cwd, for the drift
check) optional. Superseded records arrive as name, replacement and date
stubs — pass the id to `kb_trace` for the history.

Refuses over budget rather than truncating, `message` naming the next rung.

Every result — refused or not — carries a `digest`, the base's content stamp
(see [the load digest](./specification.md#the-load-digest)).

:::tip Place this output in the stable prefix
`kb_load`'s result belongs in the **stable prefix** — the system prompt, or the
first turn — and should be reloaded only when the returned
[`digest`](./specification.md#the-load-digest) changes. A prompt cache matches a
prefix byte-for-byte, so one volatile result placed ahead of a stable load
prices the whole base at full rate on every later call.
:::

```json
{ "bundlePath": "/repo/.strauss/kb", "type": "decision" }
```

### `kb_catalog`

As CLI [`catalog`](./cli-reference.md#catalog): every record as one line —
concept id, type, title, standing, stale flag — at roughly thirty tokens each.
Parameters: `bundlePath` required, `type` optional.

The **tier-one listing**, and what to reach for when `kb_load` refuses: alone
among the read tools it has **no ceiling and never refuses**. Bodies are not
here.

```json
{ "bundlePath": "/repo/.strauss/kb", "type": "open-question" }
```

### `kb_query`

As CLI [`query`](./cli-reference.md#query); the query text is `text`, and
this surface adds `type` and `includeNonCurrent`.

Parameters: `bundlePath` required; `text` (`string`), `type` (enum),
`includeNonCurrent` (`boolean` — the CLI always sets this), and `repoRoot`
(`string`, default cwd, for the drift check) optional.

:::note These results are volatile per call
Place them at the **tail** of the context, not the stable prefix `kb_load`'s
output belongs in, or every query invalidates a prompt cache that would
otherwise hold.
:::

```json
{ "bundlePath": "/repo/.strauss/kb", "text": "cache key region" }
```

### `kb_pack`

As CLI [`pack`](./cli-reference.md#pack), with the flags as camelCase
parameters. Emits markdown. Parameters: `bundlePath` and `conceptId` (the root)
required; `hops` (default 2), `maxNodes` (default 20) and `budgetTokens`
(default 25000) optional positive integers.

```json
{ "bundlePath": "/repo/.strauss/kb", "conceptId": "decision.cursor-v2" }
```

### `kb_trace`

As CLI [`trace`](./cli-reference.md#trace); the edge names are the `edges`
array, and this surface adds `depth`.

Parameters: `bundlePath` and `conceptId` (the seed) required; `edges` (array of
`typed-link`, `supersession`, `anchor`, `source`; default all four) and `depth`
(positive integer, default 3) optional. `typed-link` follows only the **causal**
rels — `related_to` is excluded for the same flooding reason body links are.

```json
{
  "bundlePath": "…/kb",
  "conceptId": "decision.cursor-v2",
  "edges": ["supersession"]
}
```

### `kb_impact`

As CLI [`impact`](./cli-reference.md#impact): the transitive set of
**dependants** of a record.

Parameters: `bundlePath` and `conceptId` (the root) required; `depth` (positive
integer, unbounded by default — a walk it cuts reports `truncated: true`) and
`rels` (array of causal rels, default every rel but `related_to`) optional.

The walk follows each rel in whichever direction its dependence runs. Naming
`related_to` — or an unknown rel — in `rels` is an **error**, not an empty
result.

```json
{
  "bundlePath": "…/kb",
  "conceptId": "fact.region-key",
  "rels": ["depends_on", "satisfies"]
}
```

`via` holds each edge as `{ source, target, rel }` — the edge as **written**,
not as walked. For one flat hop of every rel, use `kb_backlinks`.

### `kb_backlinks`

As CLI [`backlinks`](./cli-reference.md#backlinks): every inbound typed
link, one hop, every rel including `related_to`, each with its rel and the
standing of the record that made it. Parameters: `bundlePath`, `conceptId`.

```json
{ "bundlePath": "/repo/.strauss/kb", "conceptId": "fact.region-key" }
```

### `kb_list`

As CLI [`list`](./cli-reference.md#list): every record, optionally narrowed
to one type. Parameters: `bundlePath` required, `type` optional.

```json
{ "bundlePath": "/repo/.strauss/kb", "type": "open-question" }
```

### `kb_index`

As CLI [`index`](./cli-reference.md#index): the index, rebuilt if it
disagrees with the records — the cheap re-orientation call after compaction.
Parameter: `bundlePath`.

```json
{ "bundlePath": "/repo/.strauss/kb" }
```

### `kb_log`

As CLI [`log`](./cli-reference.md#log): what touched what, and when.
Malformed lines are reported rather than repaired. Parameter: `bundlePath`.

```json
{ "bundlePath": "/repo/.strauss/kb" }
```

### `kb_stamp`

As CLI [`stamp`](./cli-reference.md#stamp): the base's
[`digest`](./specification.md#the-load-digest), counts, and a digest per
record — no bodies. Parameters: `bundlePath` optional (omit it to stamp every
pinned base), `since` optional (a digest, or a path to a prior stamp, which
also names the changed ids). Empty means nothing moved.

Ask it when a [reload hook](./architecture.md#the-plugins-hooks) said a base
changed, or before trusting a `kb_load` result from earlier in the session.

```json
{ "bundlePath": "/repo/.strauss/kb", "since": "9f2c…" }
```

---

## Format tools

### `kb_validate`

As CLI [`validate`](./cli-reference.md#validate): cross-record checks over
supersession pointers, typed-link rels and targets, and assumptions that cite
sources. Parameter: `bundlePath`.

```json
{ "bundlePath": "/repo/.strauss/kb" }
```

Returns an array of `{ check, conceptId, note, severity }`. Only errors fail the
check; the non-zero exit is CLI-only.

### `kb_doctor`

As CLI [`doctor`](./cli-reference.md#doctor), with the flags as camelCase
parameters. **Read-only** — every finding names a record for a person to repair.

Parameters: `bundlePath` required; `expiringDays` (default 30), `unverifiedDays`
(default 90), `agingDays` (default 90), `repoRoot` (default cwd, for `drifted`),
and `strict` (`boolean` — turns an expired record into a non-zero **CLI** exit,
with no effect on the report) optional.

The checks are `expired`, `expiring`, `unverified`, `aging`, `orphaned`,
`broken-supersession`, `superseded-but-cited`, and `drifted` — see the
[CLI reference](./cli-reference.md#doctor) for what each detects. **Every group
is reported even when empty.**

```json
{ "bundlePath": "/repo/.strauss/kb", "unverifiedDays": 30 }
```

Returns `{ bundlePath, checkedAt, recordCount, thresholds, counts, groups,
findingCount, healthy }`, where each group is
`{ check, headline, count, findings }` and each finding is
`{ conceptId, title, status, note }`.

### `kb_schema`

As CLI [`schema`](./cli-reference.md#schema): JSON Schema for the
frontmatter, the write input, and log entries. Takes no parameters.

```json
{}
```

### `kb_types`

As CLI [`types`](./cli-reference.md#types): the twelve record types with
their purpose, body sections, and starting status. Read this before writing
rather than guessing headings. Takes no parameters.

```json
{}
```

---

## Workspace pin tools

### `kb_pin`

As CLI [`pin`](./cli-reference.md#pin); the base to pin is `bundlePath`
rather than a positional, and the layer flags become one `layer` parameter.
Idempotent.

Parameters: `bundlePath` required; optional `mode` (`full`: always emit this
base's records whole, still under the block budget — `index`: never upgrade —
absent: the profile's full-under threshold decides), `profiles` (`string[]`, the
context profiles this pin surfaces in; absent means all), `layer` (`project` |
`local` | `user`, default `project`, the committed `.strauss/kb-pins.json`), and
`frozen` (`boolean`: `true` concludes the base so writes against it refuse,
`false` lifts the freeze).

```json
{ "bundlePath": "/repo/docs/adr", "mode": "full", "layer": "project" }
```

### `kb_unpin`

As CLI [`unpin`](./cli-reference.md#unpin): remove a base from every
manifest layer that holds it, reporting which were touched. Parameter:
`bundlePath`.

```json
{ "bundlePath": "/repo/docs/adr" }
```

### `kb_pins`

As CLI [`pins`](./cli-reference.md#pins): every pinned base across the
layers, each with its layer and whether it currently resolves to readable
records. Takes no parameters.

```json
{}
```

### `kb_context`

As CLI [`context`](./cli-reference.md#context), with the flags as camelCase
parameters. Emits nothing when nothing is
pinned, and refuses with the list of bases and their sizes rather than
truncating past its budget. Takes no `bundlePath`.

All parameters are optional: `budgetTokens` (ceiling on the whole block, default
4000), `fullUnderTokens` (per-base threshold applied before the budget: a base
whose complete load fits under it arrives as full records; off by default),
`profile` (named budget set — built-ins `session-start` (full-under 1500),
`compact` and `turn` (budget 2500); an unknown name falls through to defaults),
`format` (`markdown` | `json` — the CLI envelope for hook protocols requiring
strict JSON on stdout; MCP callers omit it, the block itself is identical), and
`event` (`string`, the `hookEventName` stamped into that envelope, only
meaningful with `format: "json"`).

Budgets resolve most-specific-first: explicit parameters, then the workspace
manifests' `context` tables (per profile, over their `default`), then the
built-in profile, then package defaults.

```json
{ "profile": "session-start" }
```
