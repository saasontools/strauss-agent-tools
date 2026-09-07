---
type: decision
title: Checkout retries a charge three times with exponential backoff
description: >-
  A shorter budget drops payments the provider would have accepted; a longer one
  holds the request open past the gateway timeout.
generated:
  by: 'agent:impl'
  at: '2026-09-01T09:00:00.000Z'
verified: []
strauss_anchors:
  - file: src/checkout/pay.ts
    symbol: PaymentClient.charge
strauss_links:
  - target: constraint.repository-retry-policy
    rel: depends_on
  - target: fact.payment-provider-dedupes-on-key
    rel: depends_on
strauss_status: superseded
strauss_superseded_by: decision.checkout-retry-budget-per-tenant
---
## Decision

Checkout retries a charge three times with exponential backoff

## Rationale

A shorter budget drops payments the provider would have accepted; a longer one holds the request open past the gateway timeout.

## Rejected

One attempt plus a retry button in the UI. Rejected: the customer's second press rebuilds the cart, so the provider sees a new idempotency key and charges again.

## Impact

PaymentClient owns the budget. No caller of charge() retries on its own.

Depends on [constraint.repository-retry-policy](constraint.repository-retry-policy.md).

Depends on [fact.payment-provider-dedupes-on-key](fact.payment-provider-dedupes-on-key.md).
