---
id: use-cases
title: Use cases
sidebar_label: Use cases
sidebar_position: 4
description: Recording decisions, querying before deciding, superseding, verifying, tracing, impact analysis, health sweeps, and loading into agent context.
---

# Use cases

What a base is actually for. Each shows the CLI; the
[MCP reference](./mcp-reference.md) has the equivalent tool call.

## Recording a decision

A decision is the one thing a later pass cannot recover. The diff shows what
changed; nothing in it says which alternative was rejected, or which constraint
a future reader would otherwise "simplify" away.

`write-decision` takes `alternative` and `impact` as **fields** rather than free
sections, because what was rejected is exactly the part a writer leaves empty
when it is only a heading.

```bash
strauss-kb write-decision <<'JSON'
{
  "slug": "cas-not-lock",
  "title": "Compare-and-swap rather than a lock",
  "why": "A stale lock hold blocks every later writer; a lost update costs one retry.",
  "alternative": "A lock file. It closes the window and adds a stale-hold failure mode worse than the residue it removes.",
  "impact": "Read-modify-write callers must handle a conflict error and retry.",
  "anchors": [{ "file": "src/kb-store.ts", "symbol": "KbStore.setStatus" }]
}
JSON
```

```json
{
  "conceptId": "decision.cas-not-lock",
  "action": "created",
  "supersededIds": []
}
```

What belongs in one:

- Record a decision when a later reader would otherwise simplify the constraint
  away. **If the diff already answers the question, there is nothing to write.**
- `alternative` is what you turned down and why, not a list of everything
  considered.
- Material you read goes in `sources`; code goes in `anchors`; another record
  goes in `relatedConceptIds`.

Other types use `write` with a section map keyed by the type's own headings —
call `strauss-kb types` first rather than guessing, since a heading the type
does not define is rejected:

```bash
strauss-kb write fact <<'JSON'
{
  "slug": "cache-key-includes-region",
  "title": "The cache key includes the region",
  "why": "A region-less key serves one region another region's data.",
  "sections": {
    "Claim": "Every key is prefixed with the region.",
    "Evidence": "src/cache/order-cache.ts builds the key from `${region}:${id}`.",
    "Implication": "Any new cache must carry the prefix or it will cross-serve."
  },
  "anchors": [{ "file": "src/cache/order-cache.ts", "symbol": "OrderCache.get" }]
}
JSON
```

Judgment the tool cannot enforce:

- An unsourced claim is an `assumption` with `assumption: true`, never a `fact`
  with a vague source. That distinction is what lets a later reader separate
  what was established from what was guessed.
- When two records conflict, say so in a `risk`, an `open-question`, or a
  superseding `decision`. Quietly picking a winner destroys the disagreement,
  which is usually the useful part.
- Prefer a new record over overloading an existing one, and keep each short. A
  record nobody finishes reading is not durable memory.

### When there was nothing to decide

```bash
strauss-kb no-decision "Renamed a private helper; the diff answers every question about it."
```

Idempotent, writing `decision.none`. It exists so a workflow gate can ask "did
you answer?" rather than "did you write a decision?" — the first does not reward
writing a junk one.

## Querying before deciding

Search first. The same knowledge filed twice under different slugs is how a base
rots, and a duplicate concept id is rejected rather than overwritten.

```bash
strauss-kb query cache key region
```

Every match comes back with its standing, never filtered:

```json
[
  {
    "conceptId": "decision.cas-not-lock",
    "title": "Compare-and-swap rather than a lock",
    "description": "A stale lock hold blocks every later writer.",
    "standing": "current",
    "supersededBy": [],
    "warnings": [{ "kind": "unverified" }],
    "body": "## Decision\n\n…"
  }
]
```

`standing` is one of `current`, `superseded`, `rejected`, `unsettled`, `open`.
Read it before acting on `body` — a superseded record is usually the older,
longer, more general one, so it is exactly what a ranker prefers.

:::warning Never read record files directly
`load`, `catalog`, `query`, `pack`, and `trace` are the supported ways to read a
base. A raw file read bypasses supersession resolution and returns replaced
records as if current.
:::

A query cannot tell you that nothing was decided — it returns its nearest hit
whatever the distance. When the question is _what exists_, `catalog` is the one
that can support "no record covers this", because it names every record.

## Superseding

A record whose meaning changed is superseded, never edited. Editing it
invalidates every reference to it, and the earlier understanding is what a later
trace needs.

Two ways. Link two existing records:

```bash
strauss-kb supersede decision.cursor-v1 decision.cursor-v2
```

```json
{ "superseded": "decision.cursor-v1", "replacedBy": "decision.cursor-v2" }
```

Or declare it while writing the replacement, which is the usual path:

```bash
strauss-kb write-decision <<'JSON'
{
  "slug": "cursor-v2",
  "title": "Cursor pagination keyed on (created_at, id)",
  "why": "Offset pagination skipped rows under concurrent inserts.",
  "alternative": "Keeping offsets and accepting the skew.",
  "supersedes": ["decision.cursor-v1"]
}
JSON
```

```json
{
  "conceptId": "decision.cursor-v2",
  "action": "superseded-prior",
  "supersededIds": ["decision.cursor-v1"]
}
```

`supersededIds` holds only the ids **actually** marked. An id naming a record
that does not exist yet is legal and left out for `validate` to report; the
array is capped at 32.

Both directions are written, so `validate` drops to catching hand-edits:

```bash
strauss-kb validate || echo "errors above"   # warnings alone still exit 0
```

## "What breaks if I change this?"

Ask **before** superseding, contradicting, or narrowing a record. The answer is
the set of records whose claims were written assuming the current one holds —
exactly what a diff cannot show you.

The edges come from `strauss_links`, written on the record that makes the claim:

```bash
strauss-kb write fact <<'JSON'
{
  "slug": "region-key",
  "title": "The cache key is prefixed with the region",
  "why": "A region-less key serves one region another region's data.",
  "sections": { "Claim": "Every key is prefixed with the region." },
  "links": [
    { "target": "requirement.tenant-isolation", "rel": "satisfies" },
    { "target": "test-obligation.region-bleed", "rel": "verified_by" }
  ]
}
JSON
```

Then:

```bash
strauss-kb impact fact.region-key
```

```json
{
  "root": "fact.region-key",
  "impacted": [
    {
      "conceptId": "decision.single-cache-namespace",
      "title": "One cache namespace per deployment",
      "standing": "current",
      "depth": 1,
      "via": [
        {
          "source": "decision.single-cache-namespace",
          "target": "fact.region-key",
          "rel": "depends_on"
        }
      ]
    }
  ],
  "stopped": ["decision.cache-v1"],
  "truncated": false,
  "unexpanded": []
}
```

Three things to read carefully:

- **`via` shows the edge as written, not as walked.** The walk runs against a
  `depends_on` and along an `informs`, so without both ends named you could not
  tell which way the dependence ran.
- **`stopped` names where the walk halted.** A superseded or rejected record is
  reported and not walked through — its declared edges no longer hold. Naming
  the stopping points is what keeps the gap knowable.
- **`truncated` is the honest flag.** The walk is unbounded by default, because
  a blast radius silently cut at some depth looks exactly like a small one. Pass
  `--depth N` and the result says so, with `unexpanded` naming what it skipped.

Which direction each rel runs is the whole subtlety — see the
[direction table](./specification.md#typed-causal-links). `A depends_on B` means
B's dependants include A; `A informs B` means A's dependants include B. Naming
`related_to`, or a rel that does not exist, in `--rels` is an **error** rather
than an empty result: "nothing breaks" is the one answer you must never receive
from a typo.

For the flat question — who points at this, one hop, every rel — use
`backlinks`:

```bash
strauss-kb backlinks fact.region-key
```

That is the one to reach for when reviewing or renaming a record and you need
the exact edges rather than a causal closure. Every row carries its standing,
because a backlink from a superseded record is not a live dependency.

## Moving a status, answering a question

`status` moves a record's status and nothing else, with a compare-and-swap — a
concurrent change fails loudly rather than being overwritten:

```bash
strauss-kb status requirement.export-csv accepted
```

`answer` resolves an `open-question`: it sets the status, stamps who answered
and when into `strauss_answered`, and appends an Answer section.

```bash
strauss-kb answer open-question.retry-budget "Three retries with full jitter; measured p99 at 240ms."
```

If the answer overturns an assumption or a decision, that is a supersession —
do it explicitly.

## Verification

`verify` appends one `verified[]` event: who checked the record, when, and what
the check found. Appends only; prior events are never rewritten.

```bash
STRAUSS_KB_ACTOR="human:assaf" strauss-kb verify decision.cas-not-lock \
  --note "Re-read KbStore.setStatus; the digest check is still immediately before publish."
```

```json
{ "conceptId": "decision.cas-not-lock", "verified": 1 }
```

The `--note` is required and must say what the check found — "verified" on its
own is not an event worth appending.

A record's own generator is **refused** unless the actor is `human:`-prefixed:
re-reading your own output is not an independent check. The refusal lands in the
log as `verify:refused`, so an audit sees the attempt as well as the rule. Set
the actor with `STRAUSS_KB_ACTOR`; it is a self-declared label, not an
authenticated identity.

## Keeping anchors honest

An [anchor](./specification.md#anchors) names where a record attaches in the
code. Stamp it with a hash once the change has settled, and the base can tell
you later when the code moved out from under it:

```bash
strauss-kb anchor-resolve decision.cas-not-lock --repo-root /repo
```

```json
{
  "conceptId": "decision.cas-not-lock",
  "results": [
    {
      "file": "src/kb-store.ts",
      "symbol": "KbStore.setStatus",
      "state": "stamped",
      "currentHash": "sha256:9f2c…"
    }
  ],
  "verified": true
}
```

Run it again later and the states become the answer: `match`, `drifted`, or
`unresolved` with a reason — a deleted file is as much a broken anchor as a
rewritten one. It **exits non-zero** on drift or an unresolvable hash-carrying
anchor, so it works as a CI gate:

```bash
strauss-kb anchor-resolve decision.cas-not-lock || echo "the code moved"
```

A green run writes **nothing at all** — a matching anchor is left alone rather
than re-dated, because rewriting the record on every clean run would fill the
log with nothing. Pass `--restamp` when you do want the record to say when it
was last checked, or `--rebaseline` to accept the current code as the new
baseline.

You do not have to run it to see drift, though. `load` and `query` re-resolve
hash-carrying anchors as they read, and attach a `drifted` warning:

```json
{
  "kind": "drifted",
  "anchors": [
    { "file": "src/kb-store.ts", "symbol": "KbStore.setStatus", "diffSize": 6 }
  ]
}
```

Anchors with no hash are never read, so a base nobody has stamped costs nothing.
Point `--repo-root` at the checkout when the working directory is not it — and
note that when it is omitted and _every_ anchor comes back missing, the finding
is dropped rather than reported, because that pattern means you ran from the
wrong directory, not that the repository lost every anchored file.

## Sweeping a base for decay

Decay is invisible from inside a single record. A stale record reads exactly
like a live one, a question nobody answered reads exactly like one nobody asked,
and a record nothing links to is reachable only by someone who already knows it
is there. `doctor` is the question no reader thinks to ask:

```bash
strauss-kb doctor
```

```text
# KB Doctor — /repo/.strauss/kb
records: 24
thresholds: expiring within 30d, unverified over 90d, aging over 90d
checked: 2026-09-01T10:00:00.000Z

  expired                 1  past its stale_after date
  expiring                0  stale_after falls within the window
  unverified              3  nobody has ever confirmed it, and it is old enough to matter
  aging                   2  still open or still proposed long after it was written
  orphaned                0  no other record links to it
  broken-supersession     0  the supersession pointers do not resolve
  superseded-but-cited    1  a live record's body links to one that no longer holds
  drifted                 0  the code an anchor points at moved out from under its hash

## expired (1)
- fact.tls-cipher-list — The accepted cipher list: stale since 2026-06-01 (92 days ago)

7 findings across 4 of 8 checks.
```

**Every group is reported even when empty.** A check that found nothing and a
check that never ran look identical in a report that only lists findings, which
is the whole value of a sweep.

It is **read-only**: nothing is re-dated, re-verified, superseded, or deleted,
because every finding is a judgment somebody has to make — whether a claim still
holds, which question is worth answering, which island to link or drop.

Reach for it when picking up a base someone else kept, before trusting one you
have not touched in months, or on a schedule. In a pipeline:

```bash
strauss-kb doctor --strict              # exit 1 if anything has expired
strauss-kb doctor --json | jq '.counts' # the object behind the table
```

`--strict` gates on **expiry alone**. The other checks report debt a reader
decides about; an expired record is the base itself saying it would stop
standing behind something, which is the one finding a pipeline can act on
without a judgment call. Tighten the windows when a base deserves it:

```bash
strauss-kb doctor --unverified-days 30 --aging-days 45
```

`validate` is the narrower neighbour: it asks only whether pointers between
records agree, where `doctor` asks whether the base is still worth trusting.

## Tracing history

`query` asks "what do we hold now". `trace` asks "why is this the way it is",
and answers as a timeline ordered by when each record was written.

```bash
strauss-kb trace decision.cursor-v2
```

```json
[
  {
    "conceptId": "open-question.pagination",
    "at": "2026-07-02T10:00:00Z",
    "status": "resolved",
    "depth": 2,
    "via": ["anchor"],
    "body": "…"
  },
  {
    "conceptId": "decision.cursor-v1",
    "at": "2026-07-04T14:20:00Z",
    "status": "superseded",
    "depth": 1,
    "via": ["supersession"],
    "body": "…"
  },
  {
    "conceptId": "decision.cursor-v2",
    "at": "2026-08-16T09:14:00Z",
    "status": "accepted",
    "depth": 0,
    "via": [],
    "body": "…"
  }
]
```

It deliberately includes rejected, draft, and superseded records — in a history
those are the content, not noise. Narrow the walk by naming edges:

```bash
strauss-kb trace decision.cursor-v2 supersession
```

Valid edges are `typed-link`, `supersession`, `anchor`, and `source`. Body links
are excluded by design: they can reach most of a bundle from anywhere, which
suits a bounded pack but floods a timeline. A typed link is in for the opposite
reason — it is a deliberate claim from a closed vocabulary rather than markdown
a writer happened to type, and "we chose this because of that" is the history. A
trace follows only the **causal** rels, so `related_to` is excluded on the same
flooding grounds as body links.

## Loading a base into agent context

Two tiers, because long sessions lose a base twice over — attention decays, and
compaction summarises away both the records loaded early and the instruction
that said to consult them.

### Tier 1 — a small index at every context birth

```bash
strauss-kb pin docs/kb                   # mark a base every session should see
strauss-kb context                       # emit the pinned index block
strauss-kb sync-instructions AGENTS.md   # or keep it in an instruction file
```

`context` emits concept ids, titles and standing — an index, not the content,
with bodies left behind `load` at the point of use. It emits **nothing** when
nothing is pinned, and refuses with the list of bases and their sizes rather
than truncating past its budget (4,000 tokens by default).

Pins live in `.strauss/kb-pins.json`, committed with the repo. Two more layers
exist — `.strauss/kb-pins.local.json` (personal, gitignored) and
`~/.strauss/kb-pins.json` (every workspace). Nearest layer wins per base, and
`unpin` removes from all three. A malformed layer is skipped on read and refused
on write.

Per pin:

| Flag                 | Effect                                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--mode full`        | inject the records themselves, not just the index — for small or critical bases such as an ADR set. Falls back to a labelled index when it cannot fit the block budget. |
| `--mode index`       | never inject bodies, whatever the threshold                                                                                                                             |
| `--profiles a,b`     | only surface in the named context profiles                                                                                                                              |
| `--frozen`           | the base is concluded: write commands refuse until `--unfreeze`, and `context` labels it read-only                                                                      |
| `--local` / `--user` | write a layer other than the committed project manifest                                                                                                                 |

Budgets are named profiles — `session-start` (full-under 1500), `compact` and
`turn` (budget 2500) — with per-repo overrides in the manifest, so hook commands
never carry numbers:

```json
{
  "pins": [{ "path": "docs/adr", "mode": "full" }],
  "context": { "compact": { "budgetTokens": 1500 } }
}
```

Flags beat the manifest, the manifest beats the built-ins, and an invalid value
falls back to a default instead of silencing the index. `sync-instructions`
keeps the same block between `<!-- strauss-kb:begin -->` and
`<!-- strauss-kb:end -->` sentinels in `AGENTS.md` or `CLAUDE.md`, touching
nothing outside them — the mechanism for runtimes without a reliable
post-compaction hook, since instruction files are re-read where conversation
history is not.

### Tier 2 — bodies fetched when a question needs them

```bash
strauss-kb load                     # the whole base, each record with its standing
strauss-kb load decision            # one type
strauss-kb load --budget 40000      # a wider token ceiling
strauss-kb load --max-records 80    # a wider record gate
strauss-kb load --all               # no ceiling at all
```

Call it **at the point of use**, not once per session. If the visible context
holds no records from a base and the question at hand is one it might govern,
load before answering — never conclude nothing was decided from a context with
no records in it.

Superseded records arrive as name, replacement and date stubs; their bodies no
longer hold, and reading one later in a long session is the mistake the stub
prevents. `trace` reaches them by id.

Place the result in the **stable prefix** — the system prompt, or the first turn
— and reload only when the returned `digest` changes. A prompt cache matches a
prefix byte-for-byte and the first differing token ends the match, so a volatile
`query` result placed ahead of a stable load prices the whole base at full rate
on every subsequent call. Query and pack results belong at the tail.

`--all` is the deliberate-operator escape hatch — it bypasses both ceilings and
loads everything regardless of size — and is mutually exclusive with `--budget`
and `--max-records`. A reader that does not need every record is better served
by a `type` filter, a `catalog`, or a `pack`.

### When the load refuses

Two ceilings can stop it: a 25,000-token budget, and a 40-record gate. The
refusal names which, and points at the next rung down:

```json
{
  "loaded": false,
  "recordCount": 62,
  "pageCount": 62,
  "maxRecords": 40,
  "refusedBy": ["pages"],
  "message": "Refusing to load this base whole: 62 records is past the 40-record gate. …"
}
```

The move is **not** to raise the ceiling. It is `catalog`:

```bash
strauss-kb catalog
```

One line per record — id, type, title, standing, stale flag — at roughly thirty
tokens each. A base far past `load`'s gate still fits in one call, and seeing
every id and title is what lets you name the record `pack` should centre on. It
is the only read path with no ceiling, because it is where the others send you.

Note that a **successful** load reports `pageCount` and `maxRecords` too, so a
caller can see the line coming rather than discover it by being refused.

A workspace can also block raw reads, so a base is only ever read through the
tools:

```json
{
  "permissions": {
    "deny": ["Read(.strauss/kb/**)", "Read(**/.strauss/kb/**)"]
  }
}
```

## Packing a subgraph

`pack` is the middle rung between `load` and `query`. Under budget, load the
base whole. Over budget, when the work centres on a record you can name, pack
hands over that record's bounded neighbourhood instead.

```bash
strauss-kb pack decision.cursor-v2 --hops 2 --max-nodes 4
```

```text
# KB Pack — decision.cursor-v2
bundle: /repo/.strauss/kb
budget: ~358 of 25000 tokens, 4 records
packed: 2026-08-31T22:54:18.986Z

## Records (3)

### decision.cursor-v2 — Cursor pagination keyed on (created_at, id) [current]
warnings: unverified
anchors: src/api/list.ts#listOrders

## Decision

Cursor pagination keyed on (created_at, id)

## Rationale

Offset pagination skipped rows under concurrent inserts.

## Rejected

Keeping offsets and accepting the skew.

### requirement.stable-ordering — The orders list must be stably ordered [unsettled]
warnings: unsettled (proposed); unverified
anchors: src/api/list.ts#listOrders

## Claim

Ordering is total, not just by created_at.

### fact.index-on-created-at — orders has a composite index on (created_at, id) [current]
warnings: unverified
anchors: src/api/list.ts#listOrders

## Claim

The index exists and is used by the list query.

## Superseded (1)
- decision.cursor-v1 → decision.cursor-v2 (2026-08-31T22:54:18.430Z)

## Excluded (1)
- open-question.pagination
```

The header's `4 records` is `recordCount`, which counts everything the walk
kept and adjudicated: the three whole records plus the one superseded stub.
`Excluded` is separate — those were cut by `--max-nodes` before adjudication,
so they are named but not counted.

Three properties make it usable as an artifact rather than just a dump:

- **Every cut record is named** under `Excluded`. A named gap is knowable; a
  silent one is not.
- **It refuses rather than truncating** past its token budget, reporting the
  record count and every already-cut id, so the caller can lower `--hops` or
  `--max-nodes`, or raise `--budget`.
- **Everything below the header is byte-identical** across runs over an
  unchanged base — the timestamp is the header's last line and appears nowhere
  else. Two packs can be diffed, and a changed byte means changed knowledge.

The walk follows body links (a `relatedConceptIds` entry is stored as one),
typed causal links, supersession in both directions, shared code anchors, and
shared sources. A pack takes the **whole** rel vocabulary including
`related_to` — a neighbourhood is the one place a bibliography belongs, which is
also where it differs from a trace. Defaults: `--hops 2`, `--max-nodes 20`,
`--budget 25000`.

With neither a size problem nor a root record in hand, the question is a point
lookup — and that is [`query`](./cli-reference.md#query).

## Writing from several worktrees at once

Nothing special is required. One record per file means parallel writers never
merge records — they only choose distinct names, and a collision is a 409 the
caller answers rather than a silent last-write-wins.

The one shared file is `log.jsonl`, and the store handles it declaratively: the
first call that appends a log line writes a merge driver into the base's
`.gitattributes`.

```
log.jsonl text eol=lf merge=union
```

With that in place, a local merge of two branches that both appended keeps both
sides' lines instead of picking one. A `.gitattributes` you wrote yourself is
respected — a file already giving `log.jsonl` any strategy, including a
deliberate `merge=ours`, is left alone.

A union merge does not preserve order, and can keep the same line twice after a
cherry-pick or rebase. Neither is yours to handle: `log` sorts entries by
timestamp and drops exact duplicates before returning them.

:::warning The union driver does not fire on GitHub
GitHub computes pull request merges through its own service, which does not read
`.gitattributes` merge drivers. A PR merging two branches' `log.jsonl` appends
gets git's ordinary line-level merge, or a conflict, even with the attribute in
place. It fires for a merge run by a local git client.
:::

## Catching a hand-edit

The store's guarantees hold because everything goes through one door, and a
hand-edit is the case that does not. The plugin ships two hooks that close it
from the outside.

A **`PreToolUse` deny** blocks edits to the generated files sitting directly in
a bundle — `INDEX.md`, `log.jsonl`, and `.index.sqlite` — with a reason that
says why rather than just refusing: they are written by the store's write path,
so a direct edit will be overwritten and can desync from the records it
summarizes. Edit the underlying record instead, or write through the tools.

A **`PostToolUse` validate** runs after any edit that lands inside a bundle and
reports what broke, so a hand-edited supersession pointer surfaces in the same
turn rather than at the next read. It is advisory, never blocking, and fails
open — if its own plumbing breaks it says nothing rather than blocking a
session.

To turn the validate hook off for a session:

```bash
export STRAUSS_KB_NO_VALIDATE_HOOK=1
```

`0`, `false`, and unset all mean "not opted out" — only a truthy value disables
it, because those are common ways to spell "not set" in a shared env file. It
names the validate hook specifically; the deny hook is disabled through the
runtime's own hook settings.

Both recognise a bundle by path: a directory segment named `.kb`, or a `kb`
segment under `.strauss`. A base pinned somewhere else is invisible to them, and
a `Bash` write is a deliberate side door — a matcher wide enough to catch
`INDEX.md` in a shell command would false-positive on any `Bash` call that
merely mentions it.
