---
type: decision
title: Tenant lookups are cached for sixty seconds
description: >-
  Caching tenant lookups for sixty seconds means tenant lookups are served from
  the cache for sixty seconds, which is what a sixty-second cache does.
tags:
  - review
generated:
  by: 'agent:impl'
  at: '2026-09-01T09:24:00.000Z'
verified: []
strauss_anchors:
  - file: src/services/tenant.service.ts
    symbol: TenantService.findMany
strauss_status: accepted
---
## Decision

Tenant lookups are cached for sixty seconds

## Rationale

Caching tenant lookups for sixty seconds means tenant lookups are served from the cache for sixty seconds, which is what a sixty-second cache does.

## Impact

TenantService.findMany reads the cache before the repository.
