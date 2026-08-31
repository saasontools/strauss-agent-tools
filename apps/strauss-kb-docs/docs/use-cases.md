---
id: use-cases
title: Use cases
sidebar_label: Use cases
sidebar_position: 4
description: Recording decisions, querying before deciding, superseding, verifying, tracing, loading into agent context, and packing subgraphs.
---

# Use cases

Seven things a base is actually for. Each shows the CLI; the
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
`query`, `load`, `pack`, and `trace` are the supported ways to read a base. A
raw file read bypasses supersession resolution and returns replaced records as
if current.
:::

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
strauss-kb validate || echo "problems above"
```

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

Valid edges are `supersession`, `anchor`, and `source`. Body links are excluded
by design: they can reach most of a bundle from anywhere, which suits a bounded
pack but floods a timeline.

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
strauss-kb load                    # the whole base, each record with its standing
strauss-kb load decision           # one type
strauss-kb load --budget 40000     # a wider ceiling
strauss-kb load --all              # no ceiling at all
```

Call it **at the point of use**, not once per session. If the visible context
holds no records from a base and the question at hand is one it might govern,
load before answering — never conclude nothing was decided from a context with
no records in it.

Superseded records arrive as name, replacement and date stubs; their bodies no
longer hold, and reading one later in a long session is the mistake the stub
prevents. `trace` reaches them by id.

`--all` is the deliberate-operator escape hatch — it bypasses the refusal and
loads everything regardless of size — and is mutually exclusive with
`--budget`. A reader that does not need every record is better served by a
`type` filter, a `query`, or a `pack`.

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
strauss-kb pack decision.cursor-v2 --hops 2 --max-nodes 20
```

```markdown
# KB Pack — decision.cursor-v2

bundle: /repo/.strauss/kb
budget: ~4120 of 25000 tokens, 7 records
packed: 2026-08-16T09:14:00Z

## Records (5)

### decision.cursor-v2 — Cursor pagination keyed on (created_at, id) [current]

anchors: src/api/list.ts#listOrders

## Decision

…

## Superseded (1)

- decision.cursor-v1 → decision.cursor-v2 (2026-08-16T09:14:00Z)

## Excluded (1)

- fact.index-on-created-at
```

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
supersession in both directions, shared code anchors, and shared sources.
Defaults: `--hops 2`, `--max-nodes 20`, `--budget 25000`.

With neither a budget problem nor a root record in hand, the question is a point
lookup — and that is [`query`](./cli-reference.md#query).
