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
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/sweep.ts
    symbol: holderIndex
    hash: "sha256:c460bf5de2dcf824331c6de809cdd860e6fa8d054adaf7303d3174d7cb1de54f"
    hash_kind: ast
    resolved_at: "2026-09-17T18:53:58.371Z"
    lines: 21
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
