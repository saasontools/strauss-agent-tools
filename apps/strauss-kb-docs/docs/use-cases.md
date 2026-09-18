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

A decision is the one thing a later pass cannot recover: the diff shows what
changed, not which alternative was rejected. `write-decision` takes
`alternative` and `impact` as **fields** rather than free sections, because what
was rejected is the part a writer leaves empty when it is a heading.

```bash
strauss-kb write-decision <<'JSON'
{
  "slug": "cas-not-lock",
  "title": "Compare-and-swap rather than a lock",
  "why": "A stale lock hold blocks every later writer.",
  "alternative": "A lock file, which adds a stale-hold failure mode.",
  "impact": "Read-modify-write callers must handle a conflict and retry.",
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
- `alternative` is what you turned down and why, not everything considered.
- Material you read goes in `sources`; code goes in `anchors`; another record
  goes in `relatedConceptIds`.

Other types use `write` with a section map keyed by the type's own headings —
call `strauss-kb types` first, since a heading the type does not define is
rejected.

```bash
strauss-kb write fact <<'JSON'
{
  "slug": "cache-key-includes-region",
  "title": "The cache key includes the region",
  "why": "A region-less key serves another region's data.",
  "sections": { "Claim": "Every key is prefixed with the region." },
  "anchors": [{ "file": "src/cache/order-cache.ts", "symbol": "OrderCache.get" }]
}
JSON
```

Judgment the tool cannot enforce:

- An unsourced claim is an `assumption` with `assumption: true`, never a `fact`
  with a vague source.
- When two records conflict, say so in a `risk`, an `open-question`, or a
  superseding `decision`. Quietly picking a winner destroys the disagreement.
- Prefer a new record over overloading an existing one, and keep each short.

### When there was nothing to decide

```bash
strauss-kb no-decision "Renamed a private helper; the diff answers it."
```

Idempotent, writing `decision.none`, so a workflow gate can ask "did you
answer?" rather than "did you write a decision?".

## Querying before deciding

Search first: a duplicate concept id is rejected rather than overwritten, and
the same knowledge filed twice under different slugs is how a base rots.

```bash
strauss-kb query cache key region
```

Every match comes back with its standing, never filtered:

```json
[
  {
    "conceptId": "decision.cas-not-lock",
    "title": "Compare-and-swap rather than a lock",
    "standing": "current",
    "supersededBy": [],
    "warnings": [{ "kind": "unverified" }],
    "body": "## Decision\n\n…"
  }
]
```

`standing` is one of `current`, `superseded`, `rejected`, `unsettled`, `open`.
Read it before acting on `body`.

:::warning Never read record files directly
`load`, `catalog`, `query`, `pack`, and `trace` are the supported ways to read a
base. A raw file read bypasses supersession resolution and returns replaced
records as if current.
:::

A query cannot tell you that nothing was decided — it returns its nearest hit
whatever the distance. When the question is _what exists_, use `catalog`.

## Superseding

A record whose meaning changed is superseded, never edited. Link two existing
records:

```bash
strauss-kb supersede decision.cursor-v1 decision.cursor-v2
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

`supersededIds` holds only the ids **actually** marked; an id naming a record
that does not exist yet is legal and left for `validate` to report. Both
directions are written, so `validate` drops to catching hand-edits:

```bash
strauss-kb validate || echo "errors above"   # warnings alone still exit 0
```

## "What breaks if I change this?"

Ask **before** superseding, contradicting, or narrowing a record. The answer is
the set of records whose claims were written assuming the current one holds. The
edges come from `strauss_links`, written on the record that makes the claim:

```bash
strauss-kb write fact <<'JSON'
{
  "slug": "region-key",
  "title": "The cache key is prefixed with the region",
  "why": "A region-less key serves another region's data.",
  "sections": { "Claim": "Every key is prefixed with the region." },
  "links": [{ "target": "requirement.tenant-isolation", "rel": "satisfies" }]
}
JSON
```

```bash
strauss-kb impact fact.region-key
```

```json
{
  "root": "fact.region-key",
  "impacted": [
    {
      "conceptId": "decision.single-cache-namespace",
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

Three things to read carefully: `via` shows the edge **as written, not as
walked**; `stopped` names where the walk halted, since a superseded or rejected
record is reported and not walked through; and `truncated` says whether
`--depth N` cut it, with `unexpanded` naming what was skipped.

Which direction each rel runs is the whole subtlety — see the
[direction table](./specification.md#typed-causal-links). Naming `related_to`,
or a rel that does not exist, in `--rels` is an **error** rather than an empty
result: "nothing breaks" is the one answer you must never receive from a typo.

For the flat question — who points at this, one hop, every rel — use
`backlinks`.

```bash
strauss-kb backlinks fact.region-key
```

## Moving a status, answering a question

`status` moves a record's status and nothing else, with a compare-and-swap.
`answer` resolves an `open-question`: it sets the status, stamps
`strauss_answered`, and appends an Answer section.

```bash
strauss-kb status requirement.export-csv accepted
strauss-kb answer open-question.retry-budget "Three retries with full jitter."
```

If the answer overturns an assumption or a decision, that is a supersession — do
it explicitly.

## Verification

`verify` appends one `verified[]` event. The `--note` is required and must say
what the check found — "verified" on its own is not an event worth appending.

```bash
STRAUSS_KB_ACTOR="human:assaf" strauss-kb verify decision.cas-not-lock \
  --note "Re-read KbStore.setStatus; the digest check is still before publish."
```

A record's own generator is **refused** unless the actor is `human:`-prefixed:
re-reading your own output is not an independent check. The refusal lands in the
log as `verify:refused`.

## Keeping anchors honest

An [anchor](./specification.md#anchors) names where a record attaches in the
code. Stamp it with a hash once the change has settled, and the base can tell
you later when the code moved out from under it.

```bash
strauss-kb anchor-resolve decision.cas-not-lock --repo-root /repo
```

```json
{
  "conceptId": "decision.cas-not-lock",
  "results": [
    {
      "file": "src/kb-store.ts",
      "state": "stamped",
      "currentHash": "sha256:9f2c…"
    }
  ]
}
```

Run it again later and the [states](./specification.md#drift) become the answer.
It works as a CI gate — a run that leaves drift unsettled **exits non-zero**
([the exact rule](./cli-reference.md#anchor-resolve)) — and a green run writes
**nothing at all**. You do not have
to run it to see drift: `load` and `query` re-resolve hash-carrying anchors as
they read and attach a `drifted` warning — or `unchecked`, for an anchor in
another repository whose remote was not in the cache.

## Repointing a record after a refactor

A refactor renames the anchored function and extracts a helper. The record's
claim still holds; its pointers do not. `doctor --drifted` names the record:

```text
# decision.export-retention — Exports are deleted thirty days after they are produced
type: decision   standing: current
why: Keeping an export longer holds customer data past what the contract allows.

## Anchors (1)
- src/cleanup.mjs:shouldDeleteExport — gone (symbol-not-found)

Default: rationale-may-survive — the reasoning may outlive the code that implemented it; check whether it does.
```

**Read the code first.** No tool can say that `isExportExpired` replaces
`shouldDeleteExport`; a name that looks like a rename is the thing to check, not
the evidence. Then send the anchors back with the rename applied — the same
objects you read, so each keeps the hash it was stamped with:

```bash
strauss-kb anchor-set decision.export-retention <<'JSON'
{
  "reason": "Reviewed the refactor: isExportExpired replaces shouldDeleteExport; retentionDays owns the shared setting.",
  "anchors": [
    { "file": "src/cleanup.mjs", "symbol": "isExportExpired",
      "hash": "sha256:5c7242b8…", "hash_kind": "ast", "lines": 3,
      "resolved_at": "2026-09-17T20:06:25.829Z", "resolver": "tree-sitter" },
    { "file": "src/download.mjs", "symbol": "canDownloadExport",
      "hash": "sha256:b4be493b…", "hash_kind": "ast", "lines": 3,
      "resolved_at": "2026-09-17T20:06:25.830Z", "resolver": "tree-sitter" },
    { "file": "src/retention.mjs", "symbol": "retentionDays" }
  ]
}
JSON
```

An agent calls `kb_anchor_set` with the same object as `input`. Only `symbol`
moved on the first anchor; the second is the one it read, back unchanged; the
third is new and unstamped. The command reports what that amounted to:

```json
{
  "changes": [
    {
      "op": "move",
      "from": { "file": "src/cleanup.mjs", "symbol": "shouldDeleteExport" },
      "to": { "file": "src/cleanup.mjs", "symbol": "isExportExpired" }
    },
    {
      "op": "add",
      "to": { "file": "src/retention.mjs", "symbol": "retentionDays" }
    }
  ],
  "baseline": "unchanged",
  "note": "pointers only: nothing was resolved, rebaselined or verified. Run anchor-resolve to check the new pointers, --rebaseline to accept the code, and verify separately."
}
```

Leave the hashes off and `anchor-resolve` stamps the rewritten body as the new
baseline — right if you read it, not if you did not. Carrying them keeps the
drift visible until you do.

The pointer moved; the baseline did not. So the next check reports the drift the
rename had been hiding — the body really did change — and the helper is stamped
for the first time:

```bash
strauss-kb anchor-resolve decision.export-retention
```

```json
{
  "results": [
    {
      "file": "src/cleanup.mjs",
      "symbol": "isExportExpired",
      "state": "drifted",
      "diffSize": 0
    },
    {
      "file": "src/download.mjs",
      "symbol": "canDownloadExport",
      "state": "match"
    },
    {
      "file": "src/retention.mjs",
      "symbol": "retentionDays",
      "state": "stamped"
    }
  ]
}
```

Hashes and `hashKind` elided. Read that body, and only then accept it:

```bash
strauss-kb anchor-resolve decision.export-retention --rebaseline
```

A re-run now reports `match` for all three and `reassess` has nothing to hand a
reader:

```text
decision.export-retention: nothing to reassess.
```

Three acts, three commands, on purpose: `anchor-set` says where the code is,
`--rebaseline` says the code is still right, and [`verify`](#verification) says
somebody read it. The move is in the log with the reason attached:

```json
{
  "at": "2026-09-17T20:07:11.204Z",
  "by": "agent:author",
  "operation": "anchor-set",
  "conceptId": "decision.export-retention",
  "reason": "Reviewed the refactor: isExportExpired replaces shouldDeleteExport; retentionDays owns the shared setting.",
  "anchors": [
    {
      "op": "move",
      "from": { "file": "src/cleanup.mjs", "symbol": "shouldDeleteExport" },
      "to": { "file": "src/cleanup.mjs", "symbol": "isExportExpired" }
    },
    {
      "op": "add",
      "to": { "file": "src/retention.mjs", "symbol": "retentionDays" }
    }
  ]
}
```

What this does not settle: a risk about `EXPORT_RETENTION_DAYS` overriding the
thirty days stays open once the anchors match, because an environment variable
changes no bytes. See
[what drift does and does not see](./specification.md#what-drift-does-and-does-not-see).

## Sweeping a base for decay

Decay is invisible from inside a single record: a stale one reads exactly like a
live one. `doctor` is the question no reader thinks to ask.

```bash
strauss-kb doctor
```

```text
# KB Doctor — /repo/.strauss/kb
records: 24
thresholds: expiring within 30d, unverified over 90d, aging over 90d

  expired                 1  past its stale_after date
  expiring                0  stale_after falls within the window
  unverified              3  nobody has ever confirmed it
  aging                   2  still open or proposed long after it was written
  orphaned                0  no other record links to it
  broken-supersession     0  the supersession pointers do not resolve
  superseded-but-cited    1  a live record's body links to one that no longer holds
  drifted                 0  the code an anchor points at moved
  unchecked               0  an anchor in another repository nothing could reach

## expired (1)
- fact.tls-cipher-list — The accepted cipher list: stale since 2026-06-01

7 findings across 4 of 9 checks.
```

Every group is reported even when empty, and it is **read-only**: every finding
is a judgment somebody has to make.

```bash
strauss-kb doctor --strict              # exit 1 if anything has expired
strauss-kb doctor --json | jq '.counts' # the object behind the table
strauss-kb doctor --unverified-days 30 --aging-days 45
```

The [flags and checks](./cli-reference.md#doctor) are on the CLI page.
`validate` is the narrower neighbour: it asks only whether pointers between
records agree.

## Tracing history

`trace` asks "why is this the way it is", and answers as a timeline ordered by
when each record was written, deliberately including rejected, draft, and
superseded records — in a history those are the content.

```bash
strauss-kb trace decision.cursor-v2
```

```json
[
  {
    "conceptId": "decision.cursor-v1",
    "at": "2026-07-04T14:20:00Z",
    "status": "superseded",
    "depth": 1,
    "via": ["supersession"]
  },
  {
    "conceptId": "decision.cursor-v2",
    "at": "2026-08-16T09:14:00Z",
    "status": "accepted",
    "depth": 0,
    "via": []
  }
]
```

Narrow the walk by naming edges — `typed-link`, `supersession`, `anchor`,
`source`:

```bash
strauss-kb trace decision.cursor-v2 supersession
```

Body links and `related_to` are excluded because they can reach most of a bundle
from anywhere, which suits a bounded pack but floods a timeline.

## Loading a base into agent context

Two tiers, because long sessions lose a base twice over: attention decays, and
compaction summarises away both the records and the instruction to consult
them.

### Tier 1 — a small index at every context birth

```bash
strauss-kb pin docs/kb                   # mark a base every session should see
strauss-kb context                       # emit the pinned index block
strauss-kb sync-instructions AGENTS.md   # or keep it in an instruction file
```

`context` emits concept ids, titles and standing — an index, not the content —
nothing at all when nothing is pinned, and a refusal listing the bases and their
sizes rather than a truncation past its budget.

Pins live in `.strauss/kb-pins.json`, committed with the repo, plus
`.strauss/kb-pins.local.json` (personal, gitignored) and `~/.strauss/kb-pins.json`
(every workspace). Nearest layer wins per base, `unpin` removes from all three,
and a malformed layer is skipped on read and refused on write. Per-pin flags are
on the [CLI page](./cli-reference.md#pin).

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
keeps the same block between sentinels in `AGENTS.md` or `CLAUDE.md`, for
runtimes without a reliable post-compaction hook.

### Tier 2 — bodies fetched when a question needs them

```bash
strauss-kb load                     # the whole base, each record with its standing
strauss-kb load decision            # one type
strauss-kb load --budget 40000      # a wider budget
strauss-kb load --all               # no ceiling at all
```

Call it **at the point of use**, not once per session: never conclude nothing
was decided from a context holding no records. Superseded records arrive as
stubs; `trace` reaches them by id.

Place the result in the **stable prefix** — the system prompt, or the first turn
— and reload only when the returned
[`digest`](./specification.md#the-load-digest) changes; query and pack results
belong at the tail, where they cannot invalidate the cached prefix. `--all` is
the deliberate-operator escape hatch, mutually exclusive with `--budget`.

### When the load refuses

A 25,000-token budget can stop it, and
[the refusal](./specification.md#budgets-and-refusals) names it. The move is
**not** to raise the budget. It is `catalog`:

```bash
strauss-kb catalog
```

One line per record — id, type, title, standing, stale flag — at roughly thirty
tokens each, and the only read path with no ceiling. A workspace can also block
raw reads, so a base is only ever read through the tools:

```json
{
  "permissions": { "deny": ["Read(.strauss/kb/**)", "Read(**/.strauss/kb/**)"] }
}
```

## Packing a subgraph

`pack` is the middle rung between `load` and `query`: when the work centres on a
record you can name, it hands over that record's bounded neighbourhood.

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

## Superseded (1)
- decision.cursor-v1 → decision.cursor-v2 (2026-08-31T22:54:18.430Z)

## Excluded (1)
- open-question.pagination
```

The header's record count includes the superseded stub; `Excluded` names what
`--max-nodes` cut before adjudication, named but not counted. Three properties
make it usable as an artifact: **every cut record is named**, so a gap is
knowable; **it refuses rather than truncating** past its token budget, reporting
the record count and every already-cut id; and **everything below the header is
byte-identical** across runs over an unchanged base, so two packs can be diffed.

The walk follows all five [edge kinds](./specification.md#edges) with the whole
rel vocabulary. With neither a size problem nor a root record in hand, the
question is a point lookup — [`query`](./cli-reference.md#query).

## Promoting review records to an ADR base at merge

A review base holds what a pull request settled, and most of it stops mattering
once the branch is gone. [`promote --list`](./cli-reference.md#promote) names
what does not — decisions off review, constraints still `proposed`, contracts,
requirements something satisfies, blocking risks — and `promote <ids> --to
<base> --source <pr-url>` copies those into the base that outlives the branch:
settled, review tags gone, the pull request recorded as a source, and both bases
logged. Links to records left behind are dropped and named, since a typed
edge cannot cross bases. For a repository that keeps ADRs in-tree,
[`export --format madr`](./cli-reference.md#export) renders the promoted
decisions into `docs/adr` afterwards.

## Writing from several worktrees at once

Nothing special is required. One record per file means parallel writers never
merge records — they only choose distinct names, and a collision is a 409 the
caller answers. The one shared file is `log.jsonl`, and the store handles it by
writing a
[`merge=union` driver](./specification.md#gitattributes-and-cross-worktree-writes)
into the base's `.gitattributes` on the first append. `log` sorts entries by
timestamp and drops exact duplicates, so a union merge's reordering is never
yours to handle.

## Catching a hand-edit

The store's guarantees hold because everything goes through one door, and a
hand-edit is the case that does not. The plugin's
[two hooks](./architecture.md#the-plugins-hooks) close it from the outside: a
`PreToolUse` deny on the generated files sitting directly in a bundle, and an
advisory `PostToolUse` `validate` that reports what a manual edit broke in the
same turn. Neither is wired by the plugin — a workspace opts in by copying the
script and adding the entry, per that page. To turn the validate hook off for a
session:

```bash
export STRAUSS_KB_NO_VALIDATE_HOOK=1
```
