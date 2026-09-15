---
type: test-obligation
title: A pure deletion is named by a declaration around both sides of the cut
description: >-
  A deletion after a closing brace was credited to the declaration the brace
  closes.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T16:46:27.298Z"
verified:
  - by: "agent:author"
    at: "2026-09-15T16:47:43.938Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
strauss_anchors:
  - file: packages/code-diff/src/changed-symbols.spec.ts
    hash: "sha256:8c010a7e55056b2e63197000e470c698212592b2a042bf4f6fd4384e15f253c7"
    hash_kind: raw
    resolved_at: "2026-09-15T16:47:36.010Z"
    lines: 136
strauss_links:
  - target: risk.changed-symbols-credits-deletion-to-preceding-declaration
    rel: satisfies
strauss_status: open
---

## Obligation

A deletion after findMany's closing brace is TenantService's; one after TenantService's closing brace is file scope.

## Why it matters

The hook's coverage check asks for a record on the named symbol.

## How to verify

cd packages/code-diff && pnpm vitest run src/changed-symbols.spec.ts -t 'pure deletion'

Satisfies [risk.changed-symbols-credits-deletion-to-preceding-declaration](risk.changed-symbols-credits-deletion-to-preceding-declaration.md).
