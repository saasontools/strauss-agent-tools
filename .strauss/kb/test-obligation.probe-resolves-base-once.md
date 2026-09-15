---
type: test-obligation
title: >-
  The declared-classes probe resolves the base's tree once and sends the tree id
  on every line
description: >-
  Resolving the base per line cost 1.1 s at 10k directories against 268 ms by
  tree id.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T16:21:30.541Z"
verified:
  - by: unknown
    at: "2026-09-15T16:22:40.513Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:55.972Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:41.630Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:correctness"
    at: "2026-09-15T16:34:55.310Z"
    note: >-
      Re-read declaresClasses: one rev-parse --verify <base>^{tree}, id checked
      as 40-64 hex, every cat-file --batch line is <tree>:<dir>/.gitattributes;
      attributes.spec passes. Not re-timed.
  - by: unknown
    at: "2026-09-15T16:35:51.821Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.ts
    symbol: declaresClasses
    hash: "sha256:bbb45d4fdc66deaf5533bb02bff348b0d0c9a28d114683c4f17e2f7d3a07b5ff"
    hash_kind: ast
    resolved_at: "2026-09-15T16:22:34.133Z"
    lines: 37
    resolver: tree-sitter
strauss_links:
  - target: risk.classify-probe-resolves-base-per-line
    rel: satisfies
strauss_status: open
---

## Obligation

declaresClasses runs one rev-parse --verify <base>^{tree}, then one cat-file --batch whose every line is <tree>:<dir>/.gitattributes.

## Why it matters

On a wide change the probe is the slowest of classifyFiles' parallel reads, inside the hook's 10 s classify budget.

## How to verify

Read declaresClasses in packages/code-diff/src/classify/attributes.ts; cd packages/code-diff && pnpm vitest run src/classify/attributes.spec.ts. Not re-timed on the 10k fixture.

Satisfies [risk.classify-probe-resolves-base-per-line](risk.classify-probe-resolves-base-per-line.md).
