---
name: knowledge-base
description: Read and write a project's durable knowledge base — markdown records carrying standing, supersession, and history. Use when asking whether something was already decided or investigated, when recording a fact, constraint, risk, or open question that a later reader could not reconstruct from the code, or when asking why the code is shaped the way it is. Not for facts the diff already answers.
---

# Knowledge base

A knowledge base is a self-contained directory of markdown records. The default
is `.strauss/kb` under the working directory; `--bundle PATH` addresses another.

Two surfaces, one command set — use whichever the session already has:

- MCP tools `kb_*` from the `strauss-kb` server. Clients namespace MCP tool
  names, so in your session they may appear as `mcp__strauss-kb__kb_load` or
  similar — the `kb_*` suffix is the stable part; every mention of `kb_load`,
  `kb_catalog`, `kb_pack`, `kb_query`, `kb_trace` here means whatever your
  client calls that tool.
- The `strauss-kb` CLI (requires `npm install -g @saasontools/strauss-kb`).

Every example below is written for the CLI. The MCP tool of the same name takes
the same arguments as an object, plus `bundlePath`.

## The pinned block at the top of context

A "Knowledge bases (pinned)" block sits at the top of context, re-injected by
hooks at every context birth (including after compaction), so seeing it again
is a refresh, not a contradiction. Each base in it is labelled: **full
records** means that base's contents are already here — use them directly;
**index only** means concept ids, titles, and descriptions are here and the
bodies are not. Small or critical bases arrive whole (`mode: full` in
`.strauss/kb-pins.json`); the index form exists for bases too large to carry.

- **The index lines are the trigger.** When a question touches what any index
  line names and that base's records are not visible in the current context,
  `kb_load` it before answering — once per question, not per turn; records
  already in front of you need no reloading. The one conclusion never to
  draw: "nothing was decided", from a context whose KB content is an index
  line.
- **Only the tools read a base.** A raw file read bypasses supersession
  resolution — a superseded or rejected record file reads exactly like a
  current one. `kb_load`, `kb_catalog`, `kb_pack`, `kb_query`, and `kb_trace`
  are the door.

## Reading: load before you search

**`strauss-kb load` is the first call.** These bases run to a few thousand
tokens, and a reader holding all of it beats a ranker — it can say no record
answers the question, where a search returns its nearest hit whatever the
distance.

```bash
strauss-kb load               # everything, each record with its standing
strauss-kb load decision      # narrowed to one type
```

If `load` returns `loaded: false`, the base is past one of its two ceilings —
more than 40 whole records, or more than 25,000 estimated tokens — and its
`message` names which one and what to call next:

```bash
strauss-kb catalog                       # one line per record: id, type, title, standing
strauss-kb pack decision.cursor-v2       # the bounded neighbourhood around one record
strauss-kb query cursor pagination keyset  # a point lookup by wording
```

**The rule in one line:** under the gate, `load` whole; past it, `catalog` then
`pack`; for a lookup by wording, `query`. Reach for `catalog` when the question
is _what exists_ — it names every record, so "no record covers this" stays
supportable, which a `query`'s nearest-hit-regardless-of-distance cannot.

**Read the standing, not just the match.** Every result carries one:

| `standing`   | What it means for you                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `current`    | Holds. Use it.                                                                                                                  |
| `superseded` | Replaced. `supersededBy` names the replacement — read that instead.                                                             |
| `rejected`   | Someone decided explicitly _against_ this. It is the answer to "why didn't you just do X", never the answer to "what do we do". |
| `unsettled`  | A draft or proposal. Acting on it as though it were settled is a defect.                                                        |
| `open`       | An unresolved question. Valuable as a result, never as an answer.                                                               |

`warnings` carries the rest: `broken-chain` (the replacement is missing — the
one that looks most like success), `forked-chain` (two records claim to replace
it, so pick nothing), `stale`, `unverified`.

## "Why is this code like this?"

```bash
strauss-kb trace decision.cas-not-lock
```

A timeline, ordered by when each record was written, following supersession,
shared code anchors, and shared sources. It deliberately includes the rejected
alternatives and the superseded earlier understanding — in a history those are
the content, and a trace without them has kept the conclusion and thrown away
the answer.

## Writing

Search first. The same knowledge filed twice under different slugs is how a base
rots, and a duplicate concept id is rejected rather than overwritten.

```bash
strauss-kb types    # each type's purpose, body sections, initial status
strauss-kb schema   # JSON Schema for the write input — do not work from memory
```

```bash
strauss-kb write risk <<'JSON'
{
  "slug": "fake-clock-no-timers",
  "title": "The E2E fake clock does not advance timers",
  "why": "The suite would pass against behaviour production does not have.",
  "sections": {
    "Risk": "Nothing advances a pending timer.",
    "Mitigation": "Cover expiry against a real clock in staging."
  },
  "anchors": [{ "file": "test/support/clock.ts" }]
}
JSON
```

`slug` is kebab-case and becomes half the identity (`risk.fake-clock-no-timers`).
`title` is one line in the reader's terms; `why` is the consequence — what breaks
if this is wrong. A section the type does not define is rejected, so check
`types` rather than inventing headings.

## Judgment the tools cannot enforce

- **An unsourced claim is an `assumption` with `"assumption": true`**, never a
  `fact` with a vague source. That distinction is what lets a later reader
  separate what was established from what was guessed.
- **When two records conflict, say so** — in a `risk`, an `open-question`, or a
  superseding `decision`. Quietly picking a winner destroys the disagreement,
  which is usually the useful part.
- **Prefer a new record to overloading an existing one**, and keep each short. A
  record nobody finishes reading is not durable memory.
- **Never delete; supersede.** The earlier reasoning is what a trace needs.

## Changing a record

```bash
strauss-kb status open-question.retry-scope resolved
strauss-kb answer open-question.retry-scope Timeouts and 5xx only.
strauss-kb supersede decision.cursor-v1 decision.cursor-v2
```

`supersede` is the right move whenever a record's meaning changed — editing it
in place invalidates every reference to it and loses the earlier understanding.
It writes both directions itself.

Status moves use a compare-and-swap. A `KbWriteConflict` means someone else
changed the record: re-read and retry, do not force.

## Housekeeping

```bash
strauss-kb index      # the index, rebuilt if it disagrees with the records
strauss-kb log        # who touched what, and when
strauss-kb validate   # cross-record checks; exits 1 when it finds a problem
```

`validate` only catches what one record cannot see — supersession pointers that
disagree, an assumption citing sources. Since `supersede` writes both sides, a
pointer problem means someone hand-edited a file.

Do not edit `INDEX.md` or `log.jsonl` by hand. The index is regenerated from the
records; the log is append-only and is the one artifact nothing can rebuild.
