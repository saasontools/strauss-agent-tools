---
type: risk
title: >-
  A reviewer's blocking risk reaches the human only through the PR body the
  author writes
description: mayBlock no longer has a mechanical effect after the write.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-19T06:11:24.512Z"
verified: []
strauss_anchors:
  - file: plugins/strauss-kb-review/hooks/scripts/lib/checks/owed.mjs
    symbol: verification
    hash: "sha256:e114147f7b73871720876ca80c1f980e33e53a5bf22cbdff9c7fd5fa7c724c0d"
    hash_kind: ast
    resolved_at: "2026-09-19T06:18:30.592Z"
    lines: 14
    resolver: tree-sitter
strauss_links:
  - target: decision.retire-test-obligation
    rel: related_to
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

owed.verification yields severity warn for blocking and important risks alike. After this range, the only place materiality blocking is checked is reviewer.mjs, which refuses the write without mayBlock. No check stops a Stop or a merge on an open blocking risk. The human hears about it through the PR body list that implement-review asks the author to write.

## Why it matters

A security reviewer's blocking finding is filtered through the party whose code it blocks. An author (or an author agent prompted by the diff) that leaves the risk out of the PR body, or answers it with a false 'fixed in <sha>', leaves only a gate warning a human may never read.

## Mitigation

The decision names it: the human closes risks, and SAA-819 (reviewer settles) and SAA-825 (durable channel) are pending. No merge-policy check exists in the repo yet.

## Verification

Open blocking risk -> gate report shows owed.verification severity warn (checks.spec.mjs 'warns on an open blocking risk'). Closed when a merge-time or CI check reads open blocking risks from the base, not from the PR body.

Relates to [decision.retire-test-obligation](decision.retire-test-obligation.md).
