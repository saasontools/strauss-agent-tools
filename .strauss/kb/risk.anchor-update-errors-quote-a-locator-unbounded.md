---
type: risk
title: >-
  A selector error quotes the locator back whole, so record data sets the size
  of the error
description: An error returned to an agent is context it did not choose to spend.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-17T18:36:35.895Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-update/errors.ts
    symbol: locatorText
    hash: "sha256:8b57d0292f939cb02dcb07604b230f1eed2da2f06e9fe16e0ea74002d8a57877"
    hash_kind: ast
    resolved_at: "2026-09-17T18:45:22.790Z"
    lines: 7
    resolver: tree-sitter
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

locatorText concatenates repo, file, symbol, span and ref with no cap, and KbAnchorSelectorError puts the result in both the message and details.selector. file and symbol are z.string().min(1) with no maximum, so a 200 KB file in a patch produced a 200,045-character message and a 200,046-character details payload. The conflict error builds its text from stored anchors (locatorOf(current[at])), so a record file rather than the caller's own patch can set the size.

## Why it matters

Both surfaces hand the text straight back: the MCP tool result lands in the caller's context and the CLI writes it to stderr, so one record or one patch decides how much of a turn an error costs.

## Mitigation

None in the diff. Cap each field in locatorText, or cap the assembled string, the way summarise caps a description in cli.ts.

## Verification

applyAnchorPatch over one anchor with remove: [{ file: 'z'.repeat(200000) }] throws KbAnchorSelectorError with message.length 200045.
