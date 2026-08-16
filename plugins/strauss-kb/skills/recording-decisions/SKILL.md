---
name: recording-decisions
description: Decide what deserves a decision record and write it. Use after making a non-obvious implementation choice — one where a later reader would otherwise remove the constraint as an unnecessary complication — and use it to say explicitly when there was nothing to decide. Reads and writes through the strauss-kb knowledge base.
---

# Recording decisions

A decision is the one thing a later pass cannot recover. The diff shows what
changed. Nothing in it says which alternative was rejected, or which constraint
a future reader would otherwise "simplify" away.

Everything else a review needs — what moved, what was renamed, how it is
formatted — is derivable from the finished diff and does not belong in a record.

## Does this deserve a record?

Write one when **a later reader, looking only at the code, would reach the wrong
conclusion about why it is that way** — and would act on it.

| Write a record                                                                                   | Do not                                         |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| You chose the more awkward of two approaches for a reason the code does not show                 | You chose the obvious approach                 |
| A constraint from outside the diff shaped the design (a platform limit, a contract, an incident) | The constraint is stated in the code beside it |
| You rejected something a reader will propose again                                               | You rejected something nobody would propose    |
| Two records or two requirements conflicted and you resolved it                                   | Nothing conflicted                             |
| The change is reversible and you want the reasoning kept when it is reversed                     | The change is trivially re-derivable           |

Search first — the same decision filed twice under different slugs is how a base
rots:

```bash
strauss-kb load decision
strauss-kb query <the subject>
```

## Writing one

```bash
strauss-kb write-decision <<'JSON'
{
  "slug": "cas-not-lock",
  "title": "Compare-and-swap on read-modify-write, not a lock",
  "why": "A writer killed mid-hold blocks every later writer until someone reasons about timeouts.",
  "alternative": "A lock file. It closes the race window and adds a stale-hold failure mode that is worse than the residue it removes.",
  "impact": "A losing writer gets a retriable conflict and re-applies; callers must handle it.",
  "anchors": [{ "file": "src/kb-store.ts", "symbol": "KbStore.setStatus" }],
  "relatedConceptIds": ["risk.parallel-writers"]
}
JSON
```

Each field earns its place:

- **`title`** — the decision as one line, in the reader's terms. Not "changed
  setStatus" but what was decided.
- **`why`** — the consequence. What breaks if this is wrong, not a restatement
  of the title.
- **`alternative`** — what you turned down and why it lost. This is a field
  rather than a heading because it is the part a later reader cannot
  reconstruct, and a heading is too easy to leave empty. One real alternative,
  not a list of everything considered.
- **`impact`** — what a caller now has to do differently. Omit it when nothing
  outside the change is affected.
- **`anchors`** — `{ file, symbol? }`, where this attaches in the code. Name the
  symbol, not a line number: a line written mid-change is wrong by the end of
  it. This is what makes the decision findable from a diff later.

Where a reference goes:

| Reference                                        | Field               |
| ------------------------------------------------ | ------------------- |
| Material you read — a document, an issue, a spec | `sources`           |
| Code                                             | `anchors`           |
| Another record in this base                      | `relatedConceptIds` |

Keep it short. A record nobody finishes reading is not durable memory.

## When there was nothing to decide

Say so. Gating on "did you write a decision?" rewards writing a junk one; gating
on "did you answer?" does not, so silence has to be expressible as a claim:

```bash
strauss-kb no-decision Mechanical rename; no alternative was in play.
```

One record, one sentence, auditable afterwards. It is idempotent — restating it
overwrites rather than colliding — and it is excluded from "what was decided".

Work that genuinely needed no decision says this. Work that says nothing at all
is the case worth surfacing.

## When a decision changes

Supersede it. Never edit a record whose meaning changed:

```bash
strauss-kb write-decision < new-decision.json
strauss-kb supersede decision.cursor-v1 decision.cursor-v2
```

Editing in place invalidates every reference to the record and destroys the
earlier understanding, which is exactly what someone asking "why is this like
this" needs. `supersede` writes both directions itself, and `trace` reads the
arc back in the order it happened — including the version that no longer holds.

If the new decision overturns an assumption or resolves an open question, that
is also a supersession or an `answer`. Do it explicitly rather than leaving the
older record standing.
