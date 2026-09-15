---
type: test-obligation
title: The banner read follows no symlink and never blocks on a FIFO
description: A committed symlink to a FIFO hung classify and kept the process alive.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T16:00:35.196Z"
verified:
  - by: unknown
    at: "2026-09-15T16:01:50.447Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.spec.ts
    hash: "sha256:020f86b7c41c5f5436c0a8f844eb3bf166930e6befb6d8ed9742b62456f6501c"
    hash_kind: raw
    resolved_at: "2026-09-15T16:01:31.068Z"
    lines: 269
strauss_links:
  - target: risk.classify-header-read-follows-symlink-to-fifo
    rel: satisfies
strauss_status: open
---

## Obligation

classifyFiles over a symlink to a FIFO and a symlink to a bannered file returns within five seconds and classifies both `source`.

## Why it matters

classify runs inside the Stop hook's wall-clock budget.

## How to verify

cd packages/code-diff && pnpm vitest run src/classify/attributes.spec.ts -t 'symlink'

Satisfies [risk.classify-header-read-follows-symlink-to-fifo](risk.classify-header-read-follows-symlink-to-fifo.md).
