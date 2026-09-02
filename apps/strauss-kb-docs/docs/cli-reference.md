---
id: cli-reference
title: CLI reference
sidebar_label: CLI reference
sidebar_position: 5
description: Every strauss-kb verb, its flags, and an example invocation.
---

# CLI reference

```
strauss-kb [--bundle PATH] <command> [args]
```

## Global

| Flag / variable    | Effect                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--bundle PATH`    | The base to act on. Defaults to `./.strauss/kb`. Accepted before or after the verb — it is removed from argv before the verb parses the rest.                                                          |
| `-h`, `--help`     | Print the usage listing. Also printed when no verb is given.                                                                                                                                           |
| `-v`, `--version`  | The installed package version. The plugin in front of this CLI updates from a marketplace while the CLI updates from npm, and neither prompts for the other; this is what makes that skew diagnosable. |
| `STRAUSS_KB_ACTOR` | Names the writer in the log and in `generated.by` / `verified[].by`. Defaults to `unknown`.                                                                                                            |

Results go to stdout as JSON. `index`, `pack`, and `context` emit markdown,
which is what they are. Errors go to stderr and exit 1. `validate` is the one
command whose exit code says more than "did it run": it exits **1** when it
reports a problem, with the findings on stdout.

`context` prints nothing at all when nothing is pinned — it runs from hooks at
every session start, and even a bare newline is noise injected into a fresh
context.

Every write verb refuses outright when the base is pinned `--frozen` in this
workspace: `write`, `write-decision`, `no-decision`, `status`, `supersede`,
`answer`, and `verify`.

---

## The write path

### `write`

```
write <type> < record.json
```

Write one record of any of the twelve types. The record body is JSON on
**stdin**; `<type>` is the only positional argument.

Search first — the same knowledge filed twice under different slugs is how a
base rots, and a duplicate concept id is rejected rather than overwritten. Call
`types` for the sections each type accepts.

The stdin object is the write input described in the
[Specification](./specification.md#write-input): `slug`, `title` and `why` are
required; `sections`, `anchors`, `sources`, `assumption`, `stale_after`,
`verify`, `tags`, `relatedConceptIds`, `supersedes`, `materiality`,
`confidence`, and `owner` are optional. Unknown keys are rejected.

```bash
strauss-kb --bundle .strauss/kb write fact <<'JSON'
{
  "slug": "cache-key-includes-region",
  "title": "The cache key includes the region",
  "why": "A region-less key serves one region another region's data.",
  "sections": { "Claim": "Every key is prefixed with the region." },
  "anchors": [{ "file": "src/cache/order-cache.ts", "symbol": "OrderCache.get" }]
}
JSON
```

Returns `{ conceptId, action, supersededIds }`.

### `write-decision`

```
write-decision < decision.json
```

Write a decision, with the rejected alternative as a field. Takes the same stdin
object as `write` minus `sections`, plus `alternative` and `impact` — because
what was rejected is the part a later reader cannot reconstruct, and a heading
is too easy to leave empty.

```bash
strauss-kb write-decision <<'JSON'
{
  "slug": "cas-not-lock",
  "title": "Compare-and-swap rather than a lock",
  "why": "A stale lock hold blocks every later writer.",
  "alternative": "A lock file, which adds a stale-hold failure mode.",
  "impact": "Read-modify-write callers must retry on conflict."
}
JSON
```

Returns `{ conceptId, action, supersededIds }`.

### `no-decision`

```
no-decision <reason...>
```

Claim in one sentence that there was nothing to decide. Writes the idempotent
`decision.none` record — restating it is not a collision.

```bash
strauss-kb no-decision "Renamed a private helper; the diff answers every question about it."
```

### `status`

```
status <concept-id> <status>
```

Move a record's status, leaving everything else alone. Uses a compare-and-swap,
so a concurrent change fails loudly rather than being overwritten. `<status>` is
one of `draft`, `proposed`, `accepted`, `open`, `resolved`, `rejected`,
`superseded`.

```bash
strauss-kb status requirement.export-csv accepted
```

### `supersede`

```
supersede <concept-id> <replacement-id>
```

Mark a record superseded by another, linking both directions.

```bash
strauss-kb supersede decision.cursor-v1 decision.cursor-v2
```

### `answer`

```
answer <concept-id> <answer...>
```

Resolve an open question: sets the status, stamps who answered and when, and
appends an Answer section. All remaining arguments are joined into the answer
text.

```bash
strauss-kb answer open-question.retry-budget "Three retries with full jitter."
```

### `verify`

```
verify <concept-id> --note <text>
```

Append one `verified[]` event. `--note` is required and must say what the check
found. A record's own generator is refused unless the actor is
`human:`-prefixed.

```bash
STRAUSS_KB_ACTOR="human:assaf" strauss-kb verify decision.cas-not-lock \
  --note "Re-read KbStore.setStatus; the digest check is still immediately before publish."
```

Returns `{ conceptId, verified }`, where `verified` is the new event count.

---

## The read path

### `load`

```
load [type] [--budget N | --all]
```

Hand over the whole base, each record with its standing. The optional positional
narrows to one record type.

| Flag         | Effect                                                                  |
| ------------ | ----------------------------------------------------------------------- |
| `--budget N` | Approximate token ceiling. Defaults to 25000.                           |
| `--all`      | Load everything regardless of size. Mutually exclusive with `--budget`. |

Refuses with a count rather than truncating when the base is too large — a
truncated base is indistinguishable from a complete one.

```bash
strauss-kb load
strauss-kb load decision --budget 8000
strauss-kb load --all
```

### `pack`

```
pack <conceptId> [--hops N] [--max-nodes N] [--budget N]
```

The bounded neighbourhood around one record: everything within `--hops` of the
root, ranked and cut to `--max-nodes`, with every cut record named under
`Excluded`. Emits markdown.

| Flag            | Default | Effect                                            |
| --------------- | ------- | ------------------------------------------------- |
| `--hops N`      | 2       | how far from the root the walk may reach          |
| `--max-nodes N` | 20      | how many records the pack may hold, root included |
| `--budget N`    | 25000   | approximate token ceiling over what is emitted    |

```bash
strauss-kb pack decision.cursor-v2 --hops 2 --max-nodes 20
```

### `query`

```
query <text...>
```

Search and return each match with its standing. All remaining arguments are
joined into the query text. Results are flagged, never filtered.

```bash
strauss-kb query cache key region
```

The CLI always includes non-current records. To narrow by type, use `load <type>`
or `list <type>`; the `type` filter is an MCP-side parameter of
[`kb_query`](./mcp-reference.md#kb_query).

### `trace`

```
trace <concept-id> [edges...]
```

How a position was arrived at, as a timeline ordered by `generated.at`.
Deliberately includes rejected, draft, and superseded records. Any trailing
arguments that name an edge — `supersession`, `anchor`, `source` — narrow the
walk; anything else is ignored. With none given, all three are followed.

```bash
strauss-kb trace decision.cursor-v2
strauss-kb trace decision.cursor-v2 supersession anchor
```

### `list`

```
list [type]
```

Every record, optionally narrowed to one type. For enumerating — use `query`
when you have a question. Returns concept id, title, description, status, and
anchors per record.

```bash
strauss-kb list
strauss-kb list open-question
```

### `index`

```
index
```

The index, rebuilt if it disagrees with the records. One call gives the whole
shape of the base — title, type, status, and description per record — in a few
hundred tokens. The cheap re-orientation call after compaction or deep in a long
session. Emits markdown.

```bash
strauss-kb index
```

### `log`

```
log
```

What touched what, and when. Returns `{ entries, malformed }`; malformed lines
are reported with their 1-based position and never repaired, because the log is
the only artifact here that cannot be reconstructed from the records.

```bash
strauss-kb log
```

---

## Format and housekeeping

### `validate`

```
validate
```

Cross-record checks: supersession links that disagree between the two records,
and assumptions that cite sources. Per-record shape is enforced on every read,
so a problem here means someone edited a file by hand.

**Exits 1** when it reports a problem.

```bash
strauss-kb validate || echo "problems above"
```

### `schema`

```
schema
```

JSON Schema for the frontmatter, the write input, and log entries — generated
from the code that enforces them, so it cannot drift from what a write will
accept.

```bash
strauss-kb schema > kb.schema.json
```

### `types`

```
types
```

The twelve record types with their purpose, body sections, and starting status.
Read this before writing rather than guessing headings — a section the type does
not define is rejected.

```bash
strauss-kb types
```

---

## Workspace pins

These read and write the workspace pin manifests. `pins` and `context` do not
take `--bundle` at all: which bases a session should see is workspace state, not
a property of one base.

### `pin`

```
pin [bundle-path] [--mode full|index] [--profiles a,b] [--local|--user] [--frozen|--unfreeze]
```

Pin a base into a pin manifest, so `context` surfaces it at every context birth.
The positional path wins over `--bundle`; with neither, the default base is
pinned. Idempotent — re-pinning changes nothing unless a flag below is given,
which updates just that field.

| Flag             | Effect                                                                           |
| ---------------- | -------------------------------------------------------------------------------- |
| `--mode full`    | preload the whole base into the block regardless of the full-under threshold     |
| `--mode index`   | never upgrade to bodies                                                          |
| `--profiles a,b` | comma-separated context profiles this pin surfaces in. Absent: all of them.      |
| `--local`        | write `.strauss/kb-pins.local.json` (personal, gitignored)                       |
| `--user`         | write `~/.strauss/kb-pins.json` (every workspace)                                |
| _(neither)_      | write `.strauss/kb-pins.json`, the committed project manifest — the default      |
| `--frozen`       | mark the base concluded: write commands refuse and `context` labels it read-only |
| `--unfreeze`     | lift a freeze                                                                    |

A path with no records yet succeeds with a warning; bases are routinely pinned
before they are populated. The pinned base itself is never touched — not even
its log.

```bash
strauss-kb pin docs/adr --mode full
strauss-kb pin docs/research --frozen --local
```

### `unpin`

```
unpin [bundle-path]
```

Remove a base from **every** manifest layer that holds it — project, local, and
user — because unpinned means gone, not still injected from another file.
Reports which layers were touched.

```bash
strauss-kb unpin docs/adr
```

### `pins`

```
pins
```

Every pinned base across the layers, each with its layer and whether it
currently resolves to readable records.

```bash
strauss-kb pins
```

### `context`

```
context [--profile NAME] [--budget N] [--full-under N] [--format json] [--event NAME]
```

The pinned-base index block, for injection at every context birth — startup,
clear, resume, and after compaction. An index, not the content.

| Flag             | Effect                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--profile NAME` | named budget set. Built-ins: `session-start` (full-under 1500), `compact` and `turn` (budget 2500). An unknown name falls through to defaults rather than failing. |
| `--budget N`     | ceiling on the whole emitted block; past it the command refuses with a list of bases rather than truncating. Defaults to 4000.                                     |
| `--full-under N` | per-base threshold: a base whose complete load fits under this arrives as full records instead of index lines. Off by default.                                     |
| `--format json`  | wrap the block in a JSON envelope, for hook protocols that require strict JSON on stdout.                                                                          |
| `--event NAME`   | the `hookEventName` stamped into that envelope. Only meaningful with `--format json`.                                                                              |

Budgets resolve most-specific-first: explicit flags, then the manifests'
`context` tables (per profile, over their `default`), then the built-in profile,
then package defaults.

```bash
strauss-kb context
strauss-kb context --profile session-start
strauss-kb context --format json --event SessionStart
```

### `sync-instructions`

```
sync-instructions <file> [--profile NAME] [--budget N] [--full-under N]
```

Idempotently plant the `context` block between `<!-- strauss-kb:begin -->` and
`<!-- strauss-kb:end -->` sentinels in an instruction file, creating the block
when absent and leaving everything outside the sentinels alone.

**CLI-only.** This is file plumbing for runtimes whose instruction files are
re-read where their conversations are not; the agent capability it serves is
`kb_context`. It is the one verb with no MCP tool.

```bash
strauss-kb sync-instructions AGENTS.md
strauss-kb sync-instructions CLAUDE.md --profile session-start
```
