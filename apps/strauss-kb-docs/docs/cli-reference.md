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
| `--json`           | The machine shape, on the commands that print a table. Refused rather than ignored on commands that have only one form.                                                                                |
| `--`               | Ends flag parsing. Everything after it is text, for the verbs that end in free prose.                                                                                                                  |
| `-h`, `--help`     | Print the usage listing. Also printed when no verb is given.                                                                                                                                           |
| `-v`, `--version`  | The installed package version. The plugin in front of this CLI updates from a marketplace while the CLI updates from npm, and neither prompts for the other; this is what makes that skew diagnosable. |
| `STRAUSS_KB_ACTOR` | Names the writer in the log and in `generated.by` / `verified[].by`. Defaults to `unknown`.                                                                                                            |

Results go to stdout as JSON. `index`, `catalog`, and `pack` emit markdown,
which is what they are, and `context` emits the block itself; `doctor` prints a
table unless `--json` asks for the object behind it. `--json` is refused rather
than ignored on the commands that have only one form, since a flag that quietly
does nothing reads as one that worked.

A flag taking a value accepts either spelling — `--budget 4000` or
`--budget=4000` — and a flag given **no** value is an error rather than a fall
back to the default. `strauss-kb load --max-records` quietly returning the
default 40 would hand the caller the exact ceiling they were trying to move, and
a trailing typo would be indistinguishable from success.

Errors go to stderr and exit 1. `validate` and `doctor --strict` are the
commands whose exit code says more than "did it run": a check that reports a
problem succeeded as a command and failed as a check, so it exits **1** with its
findings still on stdout.

`context` prints nothing at all when nothing is pinned — it runs from hooks at
every session start, and even a bare newline is noise injected into a fresh
context.

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

Write one record of any of the twelve types. The record body is JSON on
**stdin**; `<type>` is the only positional argument.

Search first — the same knowledge filed twice under different slugs is how a
base rots, and a duplicate concept id is rejected rather than overwritten. Call
`types` for the sections each type accepts.

The stdin object is the write input described in the
[Specification](./specification.md#write-input): `slug`, `title` and `why` are
required; `sections`, `anchors`, `sources`, `assumption`, `stale_after`,
`verify`, `tags`, `relatedConceptIds`, `links`, `supersedes`, `materiality`,
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

### `anchor-resolve`

```
anchor-resolve <concept-id> [--repo-root <path>] [--rebaseline] [--restamp]
```

Resolve a record's [anchors](./specification.md#anchors) against the working
tree: stamp a hash onto anchors that lack one, and report drift where the code
moved out from under a stored hash. An unreadable file or unfindable symbol is a
**finding, not an error**.

| Flag                 | Effect                                                              |
| -------------------- | ------------------------------------------------------------------- |
| `--repo-root <path>` | Where the anchored source lives. Defaults to the working directory. |
| `--rebaseline`       | Accept the current code as the new baseline.                        |
| `--restamp`          | Refresh `resolved_at` on anchors that already match.                |

**Exits 1** when an anchor drifted, or when one carrying a hash no longer
resolves — a deleted file is as much a broken anchor as a rewritten one — so a
CI gate can run it.

An anchor that still matches is left alone rather than re-dated, so a green run
writes **nothing at all**; `--restamp` is there for when you want the record to
say when it was last checked. A clean run appends one `verified[]` event noting
how many anchors matched, and is subject to the same self-verification rule as
[`verify`](#verify): a record's own generator is refused.

```bash
strauss-kb anchor-resolve decision.cas-not-lock
strauss-kb anchor-resolve decision.cas-not-lock --repo-root /repo --rebaseline
```

Returns `{ conceptId, results, verified }`, each result
`{ file, symbol?, state, storedHash?, currentHash?, diffSize?, reason?,
rebaselined? }`. On a frozen base nothing is stamped and the result says so.

---

## The read path

### `load`

```
load [type] [--budget N] [--max-records N] [--all] [--repo-root PATH]
```

Hand over the whole base, each record with its standing. The optional positional
narrows to one record type.

| Flag               | Default | Effect                                                                                                  |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------- |
| `--budget N`       | 25000   | Approximate token ceiling.                                                                              |
| `--max-records N`  | 40      | How many whole records may be handed over before the load refuses. Superseded stubs are not counted.    |
| `--all`            | —       | Load everything regardless of size, bypassing **both** ceilings. Mutually exclusive with the other two. |
| `--repo-root PATH` | cwd     | Where the anchored source lives, for the [drift check](./specification.md#drift).                       |

Refuses with counts rather than truncating when the base trips either ceiling —
a truncated base is indistinguishable from a complete one. The refusal names
every ceiling it tripped in `refusedBy` and carries a `message` pointing at the
next rung down. A successful load reports `pageCount` and `maxRecords` too, so a
caller can see the line coming rather than discover it.

Every result carries a `digest` — one SHA-256 over the content it would hand
back — for [cache-stable placement](./mcp-reference.md#kb_load).

```bash
strauss-kb load
strauss-kb load decision --budget 8000
strauss-kb load --max-records 80
strauss-kb load --all
```

### `catalog`

```
catalog [type]
```

Every record in one line — concept id, type, title, standing, and a stale flag —
sorted by type then title, at roughly thirty tokens each. The **tier-one
listing**, and what to reach for when `load` refuses: a base too large to hold
whole is still small enough to name. Emits markdown. The optional positional
narrows to one record type; there are no flags.

Superseded records are listed with the replacement that stands in their place,
so the line to follow instead is already in view. The header counts every record
by standing and reports the `pageCount` the record gate is held against, so you
can tell before calling whether a `load` would refuse.

```bash
strauss-kb catalog
strauss-kb catalog open-question
```

```text
# KB Catalog
bundle: /repo/.strauss/kb
3 records: 2 current · 1 superseded
2 pages for kb_load's record gate (40 by default); superseded records are stubs, not pages

- decision.retry-timeouts-only · decision · Retry timeouts only · current
- fact.cache-key-includes-region · fact · The cache key includes the region · current
- open-question.retry-scope · open-question · Which failures should the client retry? · superseded → decision.retry-timeouts-only
```

Alone among the read paths, `catalog` has **no ceiling and never refuses** — it
is where the others send you, so a refusal here would leave nowhere to go. Its
cost is linear and predictable: a hundred records is about 3k tokens, a thousand
about 30k. On a base that large, narrow with the `type` positional rather than
reaching for a ceiling that does not exist.

Output is deterministic given a fixed clock — no timestamp is emitted and the
ordering is total down to the concept id, compared by code unit so two machines
agree — so two catalogs of an unchanged base diff to nothing. The one exception
is a stale flag flipping as a record's `stale_after` date passes.

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

Search and return each match with its standing. All remaining arguments are
joined into the query text. Results are flagged, never filtered.

The **narrowest** of the three retrieval rungs: reach for it when you already
know roughly what the record says. A query cannot tell you that nothing was
decided — it returns its nearest hit whatever the distance — so when the
question is _what exists_, use [`catalog`](#catalog).

`--repo-root PATH` says where the anchored source lives for the
[drift check](./specification.md#drift), defaulting to the working directory. It
is spliced out of the argv before the remaining words become the query text, so
it cannot fall into the search string.

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

### `impact`

```
impact <concept-id> [--depth N] [--rels a,b]
```

What breaks if this record changes: its transitive set of **dependants**. Reach
for it before superseding, contradicting, or narrowing a record — the answer is
the set of records whose claims were written assuming the current one holds,
which is exactly what a diff cannot show you.

| Flag         | Default    | Effect                                                                  |
| ------------ | ---------- | ----------------------------------------------------------------------- |
| `--depth N`  | unbounded  | Hops out from the record. A walk this cuts reports `truncated: true`.   |
| `--rels a,b` | all causal | Comma-separated rels to follow. Defaults to every rel but `related_to`. |

This is **not** simply "inbound links". Each rel says which of its two ends
depends on the other, and the walk follows each in whichever direction its
dependence runs — see the [direction table](./specification.md#typed-causal-links).
`related_to` carries no dependence and is not followed; naming it, or an unknown
rel, in `--rels` is an **error** rather than an empty result, because "nothing
breaks" is the one answer you must never receive from a typo.

Unbounded by default, because a blast radius silently cut at some depth looks
exactly like a small one. A superseded or rejected record is reported and **not
walked through** — its own declared edges no longer hold — and every such
stopping point is named under `stopped`.

```bash
strauss-kb impact fact.region-key
strauss-kb impact fact.region-key --depth 2 --rels depends_on,satisfies
```

Returns `{ root, impacted, stopped, truncated, unexpanded }`, where each
impacted record is `{ conceptId, title, standing, warnings, depth, via }` and
`via` names every edge that reached it, nearest first.

### `backlinks`

```
backlinks <concept-id>
```

Who points at this record: every inbound typed link, one hop, **every** rel
including `related_to`, each with the rel it was made with and the standing of
the record that made it. No flags.

The flat counterpart to `impact` — this answers "what does the base currently
say about this id", where `impact` answers "what breaks if it changes" and takes
positions to do it. Reach for it when reviewing or renaming a record and you
need the exact edges rather than a causal closure. A backlink from a superseded
record is not a live dependency, which is why every row carries its standing
rather than arriving as a bare id.

```bash
strauss-kb backlinks fact.region-key
```

Returns `{ target, backlinks }`, each backlink `{ from, rel, title, standing,
warnings }`, ordered by source id then rel. The outbound direction is on the
record itself, in its own `strauss_links`.

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
typed causal links whose rel is outside the closed vocabulary or whose target is
not in the bundle, and assumptions that cite sources. Per-record shape is
enforced on every read, so a problem here means someone edited a file by hand.

Each finding carries a `severity`. An unknown rel is an **error**, because no
walk can ever traverse it; a link to a record that does not exist yet is a
**warning**, because writing a record before the one it points at is ordinary.

**Exits 1 on an error; warnings alone exit 0.**

```bash
strauss-kb validate || echo "errors above"   # warnings alone still exit 0
```

### `doctor`

```
doctor [--expiring-days N] [--unverified-days N] [--aging-days N] [--repo-root PATH] [--strict]
```

A health sweep over a whole base: what the calendar has already retired, what
nobody ever confirmed, what has been open or proposed long enough that the
status is now the answer, and what the graph has dropped on the floor.
**Read-only** — it never writes, never supersedes, and never re-dates anything.
Every finding names a record for a person to repair.

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
strauss-kb doctor                       # the table
strauss-kb doctor --json                # the object behind it
strauss-kb doctor --strict              # exit 1 if anything has expired
strauss-kb doctor --unverified-days 30  # a stricter confirmation window
```

**All groups are reported even when empty.** A check that found nothing and a
check that never ran look identical in a report that only lists findings, which
is the whole value of a sweep.

Judgments worth knowing before reading a report:

- **Superseded and rejected records sit out the freshness checks.** A replaced
  record whose date has passed needs no repair, and reporting it would bury the
  records that do. They stay in the graph checks, where standing is not the
  question.
- **A date-only `stale_after` expires at UTC midnight.** A sweep run at exactly
  that instant still calls it expiring; one a minute later calls it expired.
- **Age is read from `generated.at`, exclusively.** A record carrying no
  timestamp is not reported as aging or unverified — without a start there is no
  duration. Exactly N days old is not yet "older than N".
- **`orphaned` counts incoming links only, and reads supersession one way.** The
  replacement references what it replaced, never the reverse; taken
  symmetrically, an old→new pair nothing else touches would rescue itself.
  Shared anchors and shared sources are co-location rather than reference.
- **A record citing the one it replaced is not `superseded-but-cited`.** That
  link is the history working as designed.

`--strict` gates on **expiry alone**. The other checks report debt a reader
decides about; an expired record is the base itself saying it would stop
standing behind something, which is the one finding a pipeline can act on
without a judgment call.

`validate` is the narrower neighbour, checking only whether pointers between
records agree.

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
