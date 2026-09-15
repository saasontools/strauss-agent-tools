---
type: decision
title: 'The checkout retry budget is held per tenant, not per process'
description: >-
  One tenant whose provider account is failing consumed the whole budget and
  stalled charges for every other tenant.
tags:
  - review
sources:
  - id: pr-7-review
    resource: >-
      https://github.com/saasontools/companion-repo/pull/7#discussion_r2100000001
    title: 'Review thread on PR #7: retry budget scope'
generated:
  by: 'agent:impl'
  at: '2026-09-01T09:19:00.000Z'
verified:
  - by: 'human:dana'
    at: '2026-09-01T09:22:00.000Z'
    note: >-
      Read the per-tenant counter in charge() against the thread; the
      process-wide counter is gone.
strauss_anchors:
  - file: src/checkout/pay.ts
    symbol: PaymentClient.charge
strauss_links:
  - target: fact.payment-provider-dedupes-on-key
    rel: depends_on
strauss_status: accepted
strauss_supersedes:
  - decision.checkout-retry-budget
---
## Decision

The checkout retry budget is held per tenant, not per process

## Rationale

One tenant whose provider account is failing consumed the whole budget and stalled charges for every other tenant.

## Rejected

Keep the global budget and add a circuit breaker per provider account. Rejected in review: the breaker still shares one counter, so the first tenant to trip it still blocks the rest until it half-opens.

## Impact

PaymentClient.charge takes the tenant id and reads its budget; the process-wide counter is gone.

Depends on [fact.payment-provider-dedupes-on-key](fact.payment-provider-dedupes-on-key.md).

[^pr-7-review]: Review thread on PR #7: retry budget scope
