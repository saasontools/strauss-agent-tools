---
type: risk
title: >-
  A replacement naming both symbol and span silently clears both and keeps the
  baseline
description: >-
  The one shape the docs say needs remove plus add is reachable by accident,
  with the hash carried along.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-17T18:10:47.107Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-update/patch.ts
    symbol: replacement
    hash: "sha256:2352ee8e3e543714f4e1f23599cbdf6bd81c50dbbf6037dc834cd8adbb41edc5"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:10.754Z"
    lines: 15
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-record.schema.ts
    symbol: kbAnchorLocatorSchema
    hash: "sha256:9e663a4632124042b2552f6c793c3f0e8fe692e9a67b46db8a47877bf14f9f8a"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:10.761Z"
    lines: 8
    resolver: regex
strauss_status: resolved
strauss_materiality: important
strauss_confidence: high
---

## Risk

kbAnchorLocatorSchema is a pick of kbAnchorSchema, and the 'a symbol or a span, not both' refinement lives on kbAnchorWriteSchema, so a locator carrying both parses. replacement() in patch.ts then runs both clears in sequence: 'if (wanted.symbol !== undefined) delete next.span;' followed by 'if (wanted.span !== undefined) delete next.symbol;'. With to = { file, symbol: 'New', span: { start: 1, end: 5 } } the new span is deleted first and the new symbol second, so the anchor ends with neither. Run against a stamped anchor the result is { file, hash, hash_kind, lines, resolved_at, resolver } and the change reads { op: 'replace', to: { file } }. No error, and the record is written.

## Why it matters

cli-reference.md states that clearing a locator field is a remove plus an add, 'the same as crossing a repo, ref or side' - precisely so a widening never carries a baseline it was not taken over. This path performs that widening silently and keeps the hash, so a whole-file anchor reports match against a symbol's old hash. The add path is safe (kbAnchorWriteSchema rejects symbol plus span at the store); only replace degrades.

## Mitigation

None in the diff, and no test covers a `to` naming both. Reject a locator with symbol and span in replacement() (or refine anchorPatchInputSchema), the way the write schema already rejects the anchor.

## Verification

applyAnchorPatch('decision.x', [{file:'a.ts',symbol:'Old',hash:'sha256:'+'a'.repeat(64)}], { reason:'r', replace:[{from:{file:'a.ts'}, to:{file:'a.ts', symbol:'New', span:{start:1,end:5}}}] }) throws instead of returning an anchor with neither symbol nor span.
