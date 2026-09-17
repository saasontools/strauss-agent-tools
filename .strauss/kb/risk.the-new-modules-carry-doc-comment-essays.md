---
type: risk
title: >-
  Six doc comments added or rewritten here run past four lines, arguing rather
  than stating
description: >-
  AGENTS.md caps a code comment at four lines and puts the why in
  ARCHITECTURE.md or a record; a PR may be rejected on prose length alone.
tags:
  - review
  - "review:docs"
generated:
  by: "agent:prose"
  at: "2026-09-17T21:45:13.649Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-references/outbound.ts
    symbol: outboundReferences
    hash: "sha256:dc489e146f4ee68b4b8827d5de6b4fa8d897028d3293ca9f758f1d9c60c996b5"
    hash_kind: ast
    resolved_at: "2026-09-17T21:48:44.011Z"
    lines: 13
    resolver: tree-sitter
  - file: packages/strauss-kb/src/body-citations.ts
    symbol: bodyCitations
    hash: "sha256:42158e6629ec8b9d5cc820f350337340a2e016d17e9df9ae67ff568fe234351b"
    hash_kind: ast
    resolved_at: "2026-09-17T21:48:44.014Z"
    lines: 8
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-edges.ts
    symbol: KB_EDGE_KINDS
    hash: "sha256:95950bbd40c908b0d60a2d9156b6a95cef48e6b384ca27d0b36b674fb5f893a6"
    hash_kind: raw
    resolved_at: "2026-09-17T21:48:44.016Z"
    lines: 6
    resolver: regex
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

kb-edges.ts:4-22 is 17 lines, outbound.ts:5-20 is 14 on a 12-line function, reassess.ts:172-180 is 9, and body-citations.ts:3-10, compose.ts:158-163, validate.ts:104-109 are 6 each. Each ends on a sentence that justifies the previous one, and each restates a record that already holds the reasoning: decision.strauss-links-is-the-one-representation, risk.impact-rereads-the-bundle-the-caller-holds, risk.a-fenced-example-link-is-a-citation.

## Why it matters

The reasoning now has two homes for every one of them, and the comment is the copy nobody updates. It is also the surface a reader of a small function pays for first.

## Mitigation

None taken. Each comment keeps its first paragraph — the invariant — and the argument moves to the record that already makes it. validate.ts:104-109 in particular restates its own error string, which already says "run mirror-links".

## Verification

No doc comment in kb-edges.ts, kb-references/, body-citations.ts, compose.ts, validate.ts or commands/reassess.ts runs past four content lines.
