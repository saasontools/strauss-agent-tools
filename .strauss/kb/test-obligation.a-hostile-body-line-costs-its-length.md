---
type: test-obligation
title: >-
  A body line of tens of thousands of backtick runs costs its length, not its
  square
description: >-
  validate and doctor --strict run on every gate, and a record's body is text
  another actor chose.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-18T15:28:35.375Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/body-citations.ts
    symbol: bodyCitations
    hash: "sha256:bee7a9a3e82dd3b568f239f5d1e121202ff79b08a8158810cab3c054687927a6"
    hash_kind: ast
    resolved_at: "2026-09-18T15:53:06.965Z"
    lines: 36
    resolver: tree-sitter
strauss_links:
  - target: risk.inline-code-stripper-rescans-from-zero
    rel: satisfies
strauss_status: open
---

## Obligation

`bodyCitations` has no per-line pass over backtick runs: the hand-rolled `withoutCodeSpans` whose close search restarted from index 0 is deleted, and the body is parsed by micromark through `mdast-util-from-markdown`. Cost is linear in the body.

## Why it matters

The deleted pass was quadratic in backtick runs on one line — 2.4 s for `validate` on a single 125 KB line — and `validate` and `doctor --strict` gate every review.

## How to verify

Against the built CLI, a ten-record base with one record whose body is a single line of 64,000 `` `x `` runs: `strauss-kb validate` measured 361 ms, against 174 ms for the same base with a plain body and 2,395 ms before the parser swap. Doubling the runs roughly doubles the excess, never quadruples it.

Satisfies [risk.inline-code-stripper-rescans-from-zero](risk.inline-code-stripper-rescans-from-zero.md).
