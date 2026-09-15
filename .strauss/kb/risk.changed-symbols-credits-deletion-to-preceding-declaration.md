---
type: risk
title: >-
  changedSymbols credits a pure deletion to the declaration that ends on the
  line before it
description: "A deleted method is named after its untouched sibling, not the class it left."
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-15T16:36:16.701Z"
verified:
  - by: "agent:author"
    at: "2026-09-15T16:48:02.738Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:49:48.051Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/changed-symbols.ts
    symbol: changedSymbols
    hash: "sha256:3af8aa7350e92c6f8ee6346d244f4252da93f2f937bc9c887b1aa88e8fd5b772"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:31.508Z"
    lines: 22
    resolver: tree-sitter
strauss_links:
  - target: decision.changed-symbols-parse-stays-with-resolver
    rel: informs
  - target: test-obligation.changed-symbols-on-fixture
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

parseUnifiedDiff turns `@@ -5,4 +5,0 @@` into a new-side point hunk at line 5 (point()), the line before the removed ones, and changedSymbols takes the smallest declaration holding that one line. Reproduced through changedSymbolsIn: class C with methods a and b; deleting b gives `C.a` via parse, where git's own function context says `C`. A deletion at the top of a file (+0,0, clamped to line 1) goes to whatever declaration starts on line 1.

## Why it matters

decision.hook-checks-move-to-parse-in-saa-813 has uncovered.symbol and anchor.outside-diff consume changedSymbols. A deletion would then ask for coverage on an unchanged sibling rather than the class that changed, and a record anchored on C.a would count as backing for it.

## Mitigation

None in the diff; no changed-symbols spec has a deletion. For a zero-count new side, take the declaration holding both the point line and the next (span N..N+1): C here, null between two top-level functions.

## Verification

A changed-symbols.spec case deleting a method between two siblings expects the class; one deleting a top-level function between two others expects null.

Informs [decision.changed-symbols-parse-stays-with-resolver](decision.changed-symbols-parse-stays-with-resolver.md).

Informs [test-obligation.changed-symbols-on-fixture](test-obligation.changed-symbols-on-fixture.md).
