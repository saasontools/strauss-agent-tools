---
name: knowledge-base
description: Read and write a project's knowledge base — markdown records with standing, supersession, and history. Use when checking whether something was decided, recording a fact, constraint, risk, or open question, or asking why the code is shaped this way. Not for facts the diff already answers.
---

# Knowledge base

A knowledge base is a directory of markdown records, default `.strauss/kb`;
`--bundle PATH` addresses another.

Two surfaces:

- MCP tools `kb_*` from the `strauss-kb` server, possibly namespaced (e.g.
  `mcp__strauss-kb__kb_load`).
- The `strauss-kb` CLI (`npm install -g @saasontools/strauss-kb`).

Examples use the CLI; the MCP tool takes the same args, plus `bundlePath`.

## The pinned block at the top of context

A "Knowledge bases (pinned)" block sits atop context, re-injected at every
context birth. Labels: **full records** — use directly; **index only** —
ids, titles, descriptions only. Small/critical bases arrive whole (`mode:
full` in `.strauss/kb-pins.json`).

- **Index lines are the trigger** — `kb_load` a base before answering from
  its index, once per question. Never conclude "nothing was decided" from
  one.
- **A hook says when a pinned base changed** under you — after a `git pull` or
  a sub-agent's write. Reload the base it names; `kb_stamp` asks the same
  question yourself.
- **Never read record files directly** — a raw read skips supersession
  resolution. `kb_load`, `kb_catalog`, `kb_pack`, `kb_query`, `kb_trace`,
  `kb_impact` and `kb_backlinks` are the door.

## Reading: load before you search

**Call `strauss-kb load` first** — bases run to a few thousand tokens; holding
it all beats a ranker.

```bash
strauss-kb load               # everything, with standing
strauss-kb load decision      # one type
```

`loaded: false`: past the token budget; `message` names what to call next.

```bash
strauss-kb catalog                       # one line per record: id, type, title, standing
strauss-kb pack decision.cursor-v2       # the bounded neighbourhood around one record
strauss-kb query cursor pagination keyset  # a point lookup by wording
```

**The rule in one line:** under the budget, `load` whole; past it, `catalog`
then `pack`; for a lookup by wording, `query`. Reach for `catalog` when the question
is _what exists_ — it names every record, so "no record covers this" stays
supportable, which a `query`'s nearest-hit-regardless-of-distance cannot.

**Read the standing, not just the match.** Every result carries one:

| `standing`   | Meaning                                                 |
| ------------ | ------------------------------------------------------- |
| `current`    | Holds.                                                  |
| `superseded` | See `supersededBy` instead.                             |
| `rejected`   | Answers "why not X", not "what to do".                  |
| `unsettled`  | Draft or proposal; acting on it as settled is a defect. |
| `open`       | An unresolved question — a result, never an answer.     |

`warnings`: `broken-chain` (replacement missing), `forked-chain` (two claim to
replace it, pick nothing), `stale`, `unverified`.

## "Why is this code like this?"

```bash
strauss-kb trace decision.cas-not-lock
```

A timeline via supersession, shared anchors, and sources — includes rejected
alternatives and superseded understanding.

## "What breaks if I change this?"

```bash
strauss-kb impact fact.region-key       # the transitive set of dependants
strauss-kb backlinks fact.region-key    # every inbound edge, one hop, any rel
```

Records can declare typed causal edges in `links`. An edge lives on the source
and reads source → target: `{ "target": "fact.region-key", "rel":
"depends_on" }` on a decision says the decision needs that fact. The vocabulary
is closed; there is no supersession rel. Run `impact` before superseding,
contradicting, or narrowing a record. Which end depends on which is per-rel:

| Rel                                              | Who breaks when the other changes |
| ------------------------------------------------ | --------------------------------- |
| `depends_on`, `verified_by`, `satisfies`         | **A** — so B's impact includes A  |
| `constrains`, `informs`, `blocks`, `invalidates` | **B** — so A's impact includes B  |
| `related_to`                                     | neither; `impact` does not follow |

## Writing

Search first — duplicate slugs rot a base; a duplicate concept id is
rejected, not overwritten.

```bash
strauss-kb types    # purpose, body sections, initial status per type
strauss-kb schema   # JSON Schema for the write input
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

`slug` is kebab-case, half the identity (`risk.fake-clock-no-timers`); `title`
is one line in the reader's terms; `why` is what breaks if this is wrong. An
undefined section is rejected — check `types`.

## Judgment the tools cannot enforce

- An unsourced claim is an `assumption` with `"assumption": true`, never a
  `fact` with a vague source.
- When two records conflict, say so — in a `risk`, `open-question`, or
  superseding `decision`. Don't quietly pick a winner.
- Prefer a new record to overloading an existing one; keep each short.
- Never delete; supersede.

## Changing a record

```bash
strauss-kb status open-question.retry-scope resolved
strauss-kb answer open-question.retry-scope Timeouts and 5xx only.
strauss-kb supersede decision.cursor-v1 decision.cursor-v2
```

Use `supersede`, not an in-place edit, when a record's meaning changed.

Status moves use compare-and-swap; on `KbWriteConflict`, re-read and retry.

## Housekeeping

```bash
strauss-kb index      # rebuilt if it disagrees with the records
strauss-kb log        # who touched what, and when
strauss-kb validate   # cross-record checks; exits 1 on a problem
strauss-kb doctor     # health sweep: expired, unconfirmed, orphaned records
```

`validate` catches disagreeing supersession pointers, an assumption citing
sources.

`doctor` never writes; groups: expired, expiring, unverified, aging, orphaned,
broken supersession, superseded-but-cited, drifted. `--json` for machine output,
`--strict` to exit 1 on any expiry.

`strauss-kb anchor-resolve <id>` — re-hash a record's code anchors;
`kb_load`/`kb_query` warn `drifted` when the code moved.

Do not edit `INDEX.md` or `log.jsonl` by hand.
