---
type: constraint
title: 'Repositories retry transient store errors in the base class, never themselves'
description: >-
  Every repository invents its own count and backoff until one is written down,
  and the budgets multiply.
generated:
  by: 'agent:impl'
  at: '2026-09-01T09:02:00.000Z'
verified: []
strauss_anchors:
  - file: src/repositories/base.repository.ts
    symbol: BaseRepository.withRetry
strauss_links:
  - target: decision.checkout-retry-budget
    rel: informs
  - target: flow.tenant-batch-get
    rel: constrains
strauss_status: accepted
---
## Claim

BaseRepository.withRetry is the only place that names the transient error set and the backoff.

## Evidence

src/repositories/base.repository.ts holds the TRANSIENT set; no subclass catches those names.

## Implication

A repository that adds its own catch turns three attempts into nine.

Informs [decision.checkout-retry-budget](decision.checkout-retry-budget.md).

Constrains [flow.tenant-batch-get](flow.tenant-batch-get.md).
