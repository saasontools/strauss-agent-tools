---
type: risk
title: >-
  An open important or blocking risk makes uncovered.signal block whenever a
  fresh decision.none stands
description: >-
  The retirement promises owed.verification never blocks; uncovered.signal turns
  it into a block the author cannot clear.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-19T06:13:44.681Z"
verified: []
strauss_anchors:
  - file: plugins/strauss-kb-review/hooks/scripts/lib/checks/uncovered.mjs
    symbol: signal
    hash: "sha256:6ed0795c629a5f1c745f014f702e9e58aa3e91b1a9b9f012cfadf4caf69075b7"
    hash_kind: ast
    resolved_at: "2026-09-19T06:18:30.778Z"
    lines: 14
    resolver: tree-sitter
  - file: plugins/strauss-kb-review/hooks/scripts/lib/checks/owed.mjs
    symbol: verification
    hash: "sha256:e114147f7b73871720876ca80c1f980e33e53a5bf22cbdff9c7fd5fa7c724c0d"
    hash_kind: ast
    resolved_at: "2026-09-19T06:18:30.785Z"
    lines: 14
    resolver: tree-sitter
strauss_links:
  - target: decision.retire-test-obligation
    rel: informs
strauss_status: open
strauss_materiality: blocking
strauss_confidence: high
---

## Risk

verification() in owed.mjs now yields a signal for every touched open blocking or important risk, with no verified_by or spec escape. uncovered.mjs signal() blocks when freshNoDecision(ctx) is set and signals(ctx) is non-empty, and signals() includes owed.verification. Reproduced: ctx with a fresh decision.none and one open important risk (even one carrying a verified_by link) returns uncovered.signal severity block, message 'decision.none stands while owed.verification fired on this diff.' At the base commit the verified_by link suppressed the signal.

## Why it matters

A reviewer's risk is touched on the branch; an author whose change is otherwise decision.none is blocked at Stop, and only a human can close the risk. This is the stuck-author case decision.retire-test-obligation rejects.

## Mitigation

None in the diff. Exclude owed.verification from the signals uncovered.signal counts (or have signals() skip warn-only signals there), and add a checks.spec case: fresh decision.none plus an open blocking risk yields no uncovered.signal.

## Verification

node --test plugins/strauss-kb-review/hooks/scripts/checks.spec.mjs with that case added.

Informs [decision.retire-test-obligation](decision.retire-test-obligation.md).
