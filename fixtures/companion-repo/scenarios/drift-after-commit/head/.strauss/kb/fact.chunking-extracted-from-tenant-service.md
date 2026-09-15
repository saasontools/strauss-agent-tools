---
type: fact
title: chunkIds moved from tenant.service.ts into chunker.ts unchanged
description: A reviewer diffing the new file sees seven lines that are not new.
tags:
  - review
  - 'review:extract'
generated:
  by: 'agent:impl'
  at: '2026-09-01T09:32:00.000Z'
verified: []
strauss_anchors:
  - file: src/services/chunker.ts
    symbol: chunkIds
strauss_verify:
  - >-
    git show main:src/services/tenant.service.ts | tail -n 7 | diff -
    src/services/chunker.ts
strauss_links:
  - target: decision.tenant-chunk-size
    rel: depends_on
strauss_status: accepted
---
## Claim

src/services/chunker.ts is the former src/services/tenant.service.ts lines 24-30, byte-identical.

## Evidence

git diff -M finds no rename: the function left a file that still exists.

Depends on [decision.tenant-chunk-size](decision.tenant-chunk-size.md).
