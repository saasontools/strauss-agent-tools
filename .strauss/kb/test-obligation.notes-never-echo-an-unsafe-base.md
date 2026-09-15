---
type: test-obligation
title: A classify note names the base only in a shape git could take
description: >-
  The note echoed whatever base the caller passed into the output an agent
  reads.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T16:46:23.002Z"
verified:
  - by: "agent:author"
    at: "2026-09-15T16:47:43.765Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.spec.ts
    hash: "sha256:7b0d1db6566fb5656156b12ad687505422ba2b30fe282062b309392894c2297c"
    hash_kind: raw
    resolved_at: "2026-09-15T16:47:37.135Z"
    lines: 322
strauss_links:
  - target: risk.classify-note-echoes-unchecked-base
    rel: satisfies
strauss_status: open
---

## Obligation

classifyFiles with base `--output=/tmp/x` notes `the given base`, never the string.

## Why it matters

The note reaches an agent's context verbatim.

## How to verify

cd packages/code-diff && pnpm vitest run src/classify/attributes.spec.ts -t 'unsafe shape'

Satisfies [risk.classify-note-echoes-unchecked-base](risk.classify-note-echoes-unchecked-base.md).
