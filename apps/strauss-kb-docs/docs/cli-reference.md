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

| Flag / variable    | Effect                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `--bundle PATH`    | The base to act on. Defaults to `./.strauss/kb`. Accepted before or after the verb.                      |
| `--json`           | The machine shape, on commands that print a table. Refused, not ignored, on commands with only one form. |
| `--`               | Ends flag parsing; everything after it is text, for the verbs that end in free prose.                    |
| `-h`, `--help`     | The usage listing. Also printed when no verb is given.                                                   |
| `-v`, `--version`  | The installed package version — what makes plugin/CLI skew diagnosable, since neither updates the other. |
| `STRAUSS_KB_ACTOR` | Names the writer in the log and in `generated.by` / `verified[].by`. Defaults to `unknown`.              |

Results go to stdout as JSON; `index`, `catalog`, and `pack` emit markdown,
`context` emits the block itself, and `doctor` prints a table unless `--json`.
A flag taking a value accepts `--budget 4000` or `--budget=4000`; given **no**
value it is an error rather than a fall back to the default.

Errors go to stderr and exit 1. `validate` and `doctor --strict` exit **1** with
their findings still on stdout: a check that reports a problem succeeded as a
command and failed as a check. `context` prints nothing at all when nothing is
pinned, since even a bare newline is noise in a fresh context.

Every write verb refuses outright when the base is pinned `--frozen` in this
workspace: `write`, `write-decision`, `no-decision`, `status`, `supersede`,
`answer`, and `verify`. `anchor-resolve` stamps nothing on a frozen base and
says so in its result rather than failing.

---

## The write path

### `write`

```
write <type> < record.json
```

Write one record of any of the twelve types; the record is JSON on **stdin**,
`<type>` is the only positional, and `types` lists the sections each type
accepts. The stdin object is the
[write input](./specification.md#write-input): `slug`, `title` and `why`
required; `sections`, `anchors`, `sources`, `assumption`, `stale_after`,
`verify`, `tags`, `relatedConceptIds`, `links`, `supersedes`, `materiality`,
`confidence`, and `owner` optional. Unknown keys are rejected.

```bash
strauss-kb write fact <<'JSON'
{
  "slug": "cache-key-includes-region",
  "title": "The cache key includes the region",
  "why": "A region-less key serves another region's data.",
  "sections": { "Claim": "Every key is prefixed with the region." }
}
JSON
```

Returns `{ conceptId, action, supersededIds }`.

### `write-decision`

```
write-decision < decision.json
```

Write a decision, with the rejected alternative as a field: the same stdin
object as `write` minus `sections`, plus `alternative` and `impact`.

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

Claim in one sentence that there was nothing to decide, writing the idempotent
`decision.none` record.

```bash
strauss-kb no-decision "Renamed a private helper; the diff answers it."
```

### `status`

```
status <concept-id> <status>
```

Move a record's status, leaving everything else alone, with a compare-and-swap.
`<status>` is one of `draft`, `proposed`, `accepted`, `open`, `resolved`,
`rejected`, `superseded`.

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
appends an Answer section. Remaining arguments are joined into the answer text.

```bash
strauss-kb answer open-question.retry-budget "Three retries with full jitter."
```

### `verify`

```
verify <concept-id> --note <text>
```

Append one `verified[]` event. `--note` is required and must say what the check
found; a record's own generator is refused unless the actor is
`human:`-prefixed.

```bash
STRAUSS_KB_ACTOR="human:assaf" strauss-kb verify decision.cas-not-lock \
  --note "Re-read KbStore.setStatus; the digest check is still before publish."
```

Returns `{ conceptId, verified }`, the new event count.

### `anchor-resolve`

```
anchor-resolve <concept-id> [--repo-root <path>] [--rebaseline] [--restamp]
```

Resolve a record's [anchors](./specification.md#anchors) against the working
tree: stamp a hash onto anchors that lack one, and report drift where the code
moved. An unreadable file or unfindable symbol is a **finding, not an error**.

| Flag                 | Effect                                                              |
| -------------------- | ------------------------------------------------------------------- |
| `--repo-root <path>` | Where the anchored source lives. Defaults to the working directory. |
| `--rebaseline`       | Accept the current code as the new baseline.                        |
| `--restamp`          | Refresh `resolved_at` on anchors that already match.                |

**Exits 1** when an anchor drifted, or when one carrying a hash no longer
resolves, so a CI gate can run it. A matching anchor is left alone rather than
re-dated; a clean run appends one `verified[]` event, subject to the same
self-verification rule as [`verify`](#verify).

```bash
strauss-kb anchor-resolve decision.cas-not-lock --repo-root /repo --rebaseline
```

Returns `{ conceptId, results, verified }`, each result
`{ file, symbol?, state, storedHash?, currentHash?, diffSize?, reason?,
rebaselined? }`.

---

## The read path

### `load`

```
load [type] [--budget N] [--all] [--repo-root PATH]
```

Hand over the whole base, each record with its standing; the optional positional
narrows to one record type.

| Flag               | Default | Effect                                                                                        |
| ------------------ | ------- | --------------------------------------------------------------------------------------------- |
| `--budget N`       | 25000   | Approximate token ceiling.                                                                    |
| `--all`            | —       | Load everything regardless of size, bypassing the budget; mutually exclusive with `--budget`. |
| `--repo-root PATH` | cwd     | Where the anchored source lives, for the [drift check](./specification.md#drift).             |

Refuses with counts rather than truncating when the base trips the budget
ceiling, pointing at the next rung down in `message`. Every result carries a
`digest` for
[cache-stable placement](./mcp-reference.md#kb_load).

```bash
strauss-kb load decision --budget 8000
strauss-kb load --all
```

### `catalog`

```
catalog [type]
```

Every record in one line — concept id, type, title, standing, and a stale flag —
sorted by type then title, at roughly thirty tokens each. Emits markdown; the
optional positional narrows to one record type, and there are no flags.

```bash
strauss-kb catalog open-question
```

```text
# KB Catalog
bundle: /repo/.strauss/kb
3 records: 2 current · 1 superseded

- decision.retry-timeouts-only · decision · Retry timeouts only · current
- open-question.retry-scope · open-question · Which failures should the client retry? · superseded → decision.retry-timeouts-only
```

The **tier-one listing**, and what to reach for when `load` refuses. Superseded
records are listed with their replacement. Alone among the read paths it has
**no ceiling and never refuses**; its cost is linear, roughly 3k tokens per
hundred records. Output is deterministic given a fixed clock, so two catalogs of
an unchanged base diff to nothing.

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
query <text...> [--repo-root PATH]
```

Search and return each match with its standing, flagged and never filtered; the
remaining arguments are joined into the query text. The **narrowest** of the
three retrieval rungs: a query cannot tell you that nothing was decided, so when
the question is _what exists_, use [`catalog`](#catalog). `--repo-root PATH`
says where the anchored source lives for the
[drift check](./specification.md#drift), and is spliced out of the argv before
the remaining words become the query text.

```bash
strauss-kb query cache key region
```

The CLI always includes non-current records; the `type` filter is an MCP-side
parameter of [`kb_query`](./mcp-reference.md#kb_query).

### `trace`

```
trace <concept-id> [edges...]
```

How a position was arrived at, as a timeline ordered by `generated.at`,
deliberately including rejected, draft, and superseded records. Trailing
arguments naming an edge — `supersession`, `anchor`, `source` — narrow the walk;
anything else is ignored, and with none given all three are followed.

```bash
strauss-kb trace decision.cursor-v2 supersession anchor
```

### `impact`

```
impact <concept-id> [--depth N] [--rels a,b]
```

What breaks if this record changes: its transitive set of **dependants**, asked
before superseding, contradicting, or narrowing a record.

| Flag         | Default    | Effect                                                                  |
| ------------ | ---------- | ----------------------------------------------------------------------- |
| `--depth N`  | unbounded  | Hops out from the record. A walk this cuts reports `truncated: true`.   |
| `--rels a,b` | all causal | Comma-separated rels to follow. Defaults to every rel but `related_to`. |

This is **not** simply "inbound links": the walk follows each rel in whichever
direction its dependence runs — see the
[direction table](./specification.md#typed-causal-links). Naming `related_to`,
or an unknown rel, in `--rels` is an **error** rather than an empty result. A
superseded or rejected record is reported and **not walked through**, named
under `stopped`.

```bash
strauss-kb impact fact.region-key --depth 2 --rels depends_on,satisfies
```

Returns `{ root, impacted, stopped, truncated, unexpanded }`, each impacted
record `{ conceptId, title, standing, warnings, depth, via }` with `via` naming
every edge that reached it, nearest first.

### `backlinks`

```
backlinks <concept-id>
```

Who points at this record: every inbound typed link, one hop, **every** rel
including `related_to`, each with its rel and the standing of the record that
made it. No flags. It is the one to reach for when you need the exact edges
rather than `impact`'s causal closure.

```bash
strauss-kb backlinks fact.region-key
```

Returns `{ target, backlinks }`, each `{ from, rel, title, standing, warnings }`,
ordered by source id then rel.

### `list`

```
list [type]
```

Every record, optionally narrowed to one type — for enumerating, where `query`
is for a question. Returns concept id, title, description, status, and anchors
per record.

```bash
strauss-kb list open-question
```

### `index`

```
index
```

The index, rebuilt if it disagrees with the records — title, type, status, and
description per record, in a few hundred tokens. Emits markdown.

```bash
strauss-kb index
```

### `log`

```
log
```

What touched what, and when. Returns `{ entries, malformed }`; malformed lines
are reported with their 1-based position and never repaired.

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
typed causal links whose rel is outside the closed vocabulary or whose target is
not in the bundle, and assumptions that cite sources. Per-record shape is
enforced on every read, so a problem here means someone edited a file by hand.
An unknown rel is an **error** and a link to a record that does not exist yet is
a **warning**: **exits 1 on an error; warnings alone exit 0.**

```bash
strauss-kb validate || echo "errors above"   # warnings alone still exit 0
```

### `doctor`

```
doctor [--expiring-days N] [--unverified-days N] [--aging-days N] [--repo-root PATH] [--strict]
```

A health sweep over a whole base. **Read-only** — it never writes, supersedes,
or re-dates; every finding names a record for a person to repair.

| Check                  | Reports                                                                        |
| ---------------------- | ------------------------------------------------------------------------------ |
| `expired`              | `stale_after` is in the past — or is not a readable date, which is no better.  |
| `expiring`             | `stale_after` falls inside the next `--expiring-days`.                         |
| `unverified`           | `verified[]` is empty and the record is over `--unverified-days` old.          |
| `aging`                | Still `open` or `proposed` after `--aging-days`.                               |
| `orphaned`             | No other record links to it, by body link or supersession.                     |
| `broken-supersession`  | A chain that does not resolve: no replacement, a missing one, a cycle, a fork. |
| `superseded-but-cited` | A record that still holds, whose body links to one that does not.              |
| `drifted`              | A hash-carrying anchor whose code moved, or whose file or symbol is gone.      |

| Flag                  | Default | Effect                                                |
| --------------------- | ------- | ----------------------------------------------------- |
| `--expiring-days N`   | 30      | How far ahead `expiring` looks.                       |
| `--unverified-days N` | 90      | How old an unconfirmed record must be to be reported. |
| `--aging-days N`      | 90      | How long a record may stay `open` or `proposed`.      |
| `--repo-root PATH`    | cwd     | Where the anchored source lives, for `drifted`.       |
| `--strict`            | —       | Exit 1 if anything has **expired**.                   |

```bash
strauss-kb doctor --json                # the object behind the table
strauss-kb doctor --strict              # exit 1 if anything has expired
strauss-kb doctor --unverified-days 30  # a stricter confirmation window
```

**All groups are reported even when empty**, because a check that found nothing
and a check that never ran look identical in a report that only lists findings.
Judgments worth knowing before reading one:

- **Superseded and rejected records sit out the freshness checks**, staying in
  the graph checks where standing is not the question.
- **A date-only `stale_after` expires at UTC midnight.**
- **Age is read from `generated.at`, exclusively**, so a record with no
  timestamp is never reported as aging or unverified, and exactly N days old is
  not yet "older than N".
- **`orphaned` counts incoming links only, and reads supersession one way.**
  Shared anchors and sources are co-location rather than reference.
- **A record citing the one it replaced is not `superseded-but-cited`.**

`--strict` gates on **expiry alone**, the one finding a pipeline can act on
without a judgment call. `validate` is the narrower neighbour, checking only
whether pointers between records agree.

### `schema`

```
schema
```

JSON Schema for the frontmatter, the write input, and log entries, generated
from the code that enforces them.

```bash
strauss-kb schema > kb.schema.json
```

### `types`

```
types
```

The twelve record types with their purpose, body sections, and starting status.
Read this before writing rather than guessing headings.

```bash
strauss-kb types
```

---

## Workspace pins

These read and write the workspace pin manifests. `pins` and `context` take no
`--bundle`: which bases a session should see is workspace state.

### `pin`

```
pin [bundle-path] [--mode full|index] [--profiles a,b] [--local|--user] [--frozen|--unfreeze]
```

Pin a base into a pin manifest, so `context` surfaces it at every context birth.
The positional path wins over `--bundle`, and with neither the default base is
pinned. Idempotent — re-pinning changes nothing unless a flag below is given.

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

A path with no records yet succeeds with a warning, and the pinned base itself
is never touched — not even its log.

```bash
strauss-kb pin docs/adr --mode full
```

### `unpin`

```
unpin [bundle-path]
```

Remove a base from **every** manifest layer that holds it — project, local, and
user — reporting which were touched, because unpinned means gone rather than
still injected from another file.

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

| Flag             | Effect                                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `--profile NAME` | named budget set. Built-ins: `session-start` (full-under 1500), `compact` and `turn` (budget 2500). An unknown name falls through to defaults. |
| `--budget N`     | ceiling on the whole emitted block; past it the command refuses with a list of bases rather than truncating. Defaults to 4000.                 |
| `--full-under N` | per-base threshold: a base whose complete load fits under this arrives as full records instead of index lines. Off by default.                 |
| `--format json`  | wrap the block in a JSON envelope, for hook protocols that require strict JSON on stdout.                                                      |
| `--event NAME`   | the `hookEventName` stamped into that envelope. Only meaningful with `--format json`.                                                          |

Budgets resolve most-specific-first: explicit flags, then the manifests'
`context` tables (per profile, over their `default`), then the built-in profile,
then package defaults.

```bash
strauss-kb context --format json --event SessionStart
```

### `sync-instructions`

```
sync-instructions <file> [--profile NAME] [--budget N] [--full-under N]
```

Idempotently plant the `context` block between `<!-- strauss-kb:begin -->` and
`<!-- strauss-kb:end -->` sentinels in an instruction file, leaving everything
outside them alone. **CLI-only** — the one verb with no MCP tool; the capability
it serves is `kb_context`.

```bash
strauss-kb sync-instructions CLAUDE.md --profile session-start
```
