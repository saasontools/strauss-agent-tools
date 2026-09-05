---
type: flow
title: Tenant lookup batches ids through the repository in chunks of a hundred
description: >-
  One round trip per hundred ids instead of one per id, and callers otherwise
  read a partial result as a total one.
generated:
  by: 'agent:impl'
  at: '2026-09-01T09:06:00.000Z'
verified: []
strauss_anchors:
  - file: src/services/tenant.service.ts
    symbol: TenantService.findMany
strauss_links:
  - target: constraint.repository-retry-policy
    rel: depends_on
strauss_status: accepted
---
## Flow

Chunk the ids, fetch each chunk, merge the hits, report the ids nothing came back for.

## Trigger

TenantService.findMany

## Steps

chunkIds -> batchGet per chunk -> merge -> missing[]

## Failure modes

A chunk that throws fails the whole call; there is no partial retry and no partial result.

Depends on [constraint.repository-retry-policy](constraint.repository-retry-policy.md).
