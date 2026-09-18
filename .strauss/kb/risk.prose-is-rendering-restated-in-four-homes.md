---
type: risk
title: The "prose is the rendering" rule and its reason are restated in four files
description: >-
  One home per fact: the copies disagree the first time the rule is edited, and
  this rule was already rewritten once inside this change.
tags:
  - review
  - "review:docs"
generated:
  by: "agent:prose"
  at: "2026-09-17T21:44:48.636Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-edges.ts
    symbol: KB_EDGE_KINDS
    hash: "sha256:95950bbd40c908b0d60a2d9156b6a95cef48e6b384ca27d0b36b674fb5f893a6"
    hash_kind: raw
    resolved_at: "2026-09-17T21:48:43.599Z"
    lines: 6
    resolver: regex
  - file: packages/strauss-kb/ARCHITECTURE.md
    hash: "sha256:3d86d5feb596e74a012150b6c0aa05f54e8ae4c915407bf0f02d86585152a696"
    hash_kind: raw
    resolved_at: "2026-09-17T21:48:43.600Z"
    lines: 268
  - file: apps/strauss-kb-docs/docs/specification.md
    hash: "sha256:1e756ee19b831091fc43e90492dcc1f5ed2b329e778bf6d09de367bb449a59f2"
    hash_kind: raw
    resolved_at: "2026-09-18T15:40:38.458Z"
    lines: 714
strauss_links:
  - target: decision.strauss-links-is-the-one-representation
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

ARCHITECTURE.md:73-78, specification.md:710-713, kb-edges.ts:11-14 and kb-edges.spec.ts:78-80 each state the rule with the same reason, and the clause "disagree the moment the two drifted" appears in all four. test-obligation.the-edge-rule-is-stated-once-per-surface asked for two homes — ARCHITECTURE.md and the decision — with every other surface stating only what its reader needs.

## Why it matters

This is the failure the change itself just demonstrated: the previous rule, "every consumer reads both halves", had six homes, and the reversal left two behind (doctor.ts:364-366, references.spec.ts:405). Four homes will leave more.

## Mitigation

None taken. ARCHITECTURE.md:73-83 keeps the rule and its reason. specification.md's edge section states "prose is not walked" and links; kb-edges.ts states the invariant in <= 4 lines with no argument for it; kb-edges.spec.ts:78-80 needs no comment at all, its test name says it.

## Verification

grep -rn "disagree the moment" apps packages returns one hit.

Informs [decision.strauss-links-is-the-one-representation](decision.strauss-links-is-the-one-representation.md).
