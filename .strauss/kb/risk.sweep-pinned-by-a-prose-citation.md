---
type: risk
title: >-
  A prose citation from a permanent record pins a review record in the base for
  ever
description: The base grows without bound where sweep was the thing that kept it finite.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-17T18:53:27.389Z"
verified:
  - by: "agent:correctness"
    at: "2026-09-17T19:12:29.358Z"
    note: >-
      holderIndex holds on bodyLinkTargets, and survivorsHolding reports the
      citing ids under skipped; a body-cited record is kept both live and under
      --dry-run.
  - by: "agent:security"
    at: "2026-09-17T19:13:40.269Z"
    note: >-
      holderIndex holds on bodyLinkTargets for every record; survivorsHolding
      excludes doomed ids, so only a survivor pins. Held ids surface under
      skipped with heldBy. A cycle in replacementChain terminates (seen guard) —
      checked on an a<->b supersession cycle.
  - by: "agent:performance"
    at: "2026-09-17T19:14:30.905Z"
    note: >-
      Checked the cost of keeping more, not the judgment: holderIndex adds one
      bodyLinkTargets call per record and one Set insert per target, so the hold
      index stays linear (0.48 ms per full body scan at n=400, 1.36 ms at n=1600
      on dist). A base that grows because sweep keeps more costs linearly more
      in every pass over it, not quadratically.
strauss_anchors:
  - file: packages/strauss-kb/src/commands/sweep.ts
    symbol: holderIndex
    hash: "sha256:d2c24ba5da81eb30c820a41af845b5b13b35e77a7cd59a39114345dd175c4d8d"
    hash_kind: ast
    resolved_at: "2026-09-17T21:32:22.650Z"
    lines: 19
    resolver: tree-sitter
strauss_links:
  - target: decision.edge-consumers-read-body-and-frontmatter
    rel: informs
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: medium
---

## Risk

`holderIndex` now counts a body citation as a holder. A `decision` that stays in the base for ever and mentions `risk.x` in its prose holds `risk.x` against every future `sweep --tag review`, however long ago that risk was resolved. Before this change the same citation held nothing, which is why the deletions happened.

## Why it matters

`sweep` is the only deletion in the package and the only thing bounding a review base's size. A held record is reported under `skipped` with the ids holding it, so it is visible rather than silent — but nobody is prompted to act on it, and the remedy (edit the survivor's prose) is a judgment about someone else's record.

## Mitigation

None taken. The conservative direction was chosen deliberately: sweep keeps more, never fewer, and a base that grows is recoverable where a deleted record is not. If bases do grow, the repair is a `sweep` report a reader acts on, not a narrower holder index.

## Verification

On a base where `sweep --tag review --terminal --dry-run` reports `skipped` entries held only by body citations, count how many survive three review cycles.

Informs [decision.edge-consumers-read-body-and-frontmatter](decision.edge-consumers-read-body-and-frontmatter.md).
