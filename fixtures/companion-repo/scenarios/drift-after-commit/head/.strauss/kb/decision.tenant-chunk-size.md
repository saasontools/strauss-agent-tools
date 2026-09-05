---
type: decision
title: 'Tenant lookups chunk at a hundred ids, the store''s batch ceiling'
description: >-
  A chunk over the ceiling is rejected whole, and a chunk far under it pays a
  round trip per handful.
tags:
  - review
generated:
  by: 'agent:impl'
  at: '2026-09-01T09:26:00.000Z'
verified: []
strauss_anchors:
  - file: src/services/tenant.service.ts
    symbol: TenantService.findMany
    hash: 'sha256:d670d793b0415ba7ae5972beb5d8c14e7a9e011a43ac12114fe6a74db564d42a'
    hash_kind: ast
    lines: 8
    resolved_at: '2026-09-01T09:28:00.000Z'
    resolver: tree-sitter
  - file: src/services/tenant.service.ts
    symbol: chunkIds
    hash: 'sha256:c135699b6e13d8d72275be7d335ec91fc926a2d61f5ae13268acefbb1cd5b8fc'
    hash_kind: ast
    lines: 7
    resolved_at: '2026-09-01T09:29:00.000Z'
    resolver: tree-sitter
strauss_links:
  - target: flow.tenant-batch-get
    rel: informs
strauss_status: accepted
---
## Decision

Tenant lookups chunk at a hundred ids, the store's batch ceiling

## Rationale

A chunk over the ceiling is rejected whole, and a chunk far under it pays a round trip per handful.

## Rejected

Chunk at 25 to keep each response under a megabyte. Rejected: tenant rows are under 2 KB, so a hundred rows is well inside the response limit and costs a quarter of the round trips.

## Impact

chunkIds is the only place the ceiling appears; a store change is a one-line edit there.

Informs [flow.tenant-batch-get](flow.tenant-batch-get.md).
