---
type: risk
title: >-
  A failed git grep for class attributes turns the default path table back on,
  silently
description: "Lowered classes with nothing in the repository behind them, and no note."
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-15T15:46:23.273Z"
verified:
  - by: "agent:performance"
    at: "2026-09-15T16:12:49.945Z"
    note: >-
      At 8f85584 declaresClasses returns null on any runGit failure, its 10 s
      timeout included; readAttributes then sets repoDeclares true and
      probeFailed, and classifyFiles adds a note. attributes.spec -t
      repoDeclares passes.
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.ts
    symbol: declaresClasses
    hash: "sha256:bbb45d4fdc66deaf5533bb02bff348b0d0c9a28d114683c4f17e2f7d3a07b5ff"
    hash_kind: ast
    resolved_at: "2026-09-15T16:22:38.740Z"
    lines: 37
    resolver: tree-sitter
strauss_links:
  - target: decision.default-table-only-without-declared-classes
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

declaresClasses returns `result.ok`, and runGit reports git grep's no-match (exit 1) and a real failure (exit 128 on an unresolvable base, the 10 s timeout, output past the cap) as the same `failed`. Any failure reads as 'the repository declares nothing'. In the same run as the checkAttr case, a repo whose base .gitattributes declares `docs/**` classified `src/a.spec.ts` as `test (test-path)` with base=nosuchrev.

## Why it matters

decision.default-table-only-without-declared-classes rejects the table in a repo that declares classes, because it lowers paths the repo never declared. A failed probe does exactly that, and classifyFiles adds no note for it.

## Mitigation

None in the diff. Expose git's exit status from runGit, or treat any failure other than exit 1 as declared (the safe direction) and add a note.

## Verification

A spec where the grep fails expects repoDeclares true, or a note.

Informs [decision.default-table-only-without-declared-classes](decision.default-table-only-without-declared-classes.md).
