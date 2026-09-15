---
type: risk
title: A retried checkout can charge twice if the idempotency key is rotated
description: A customer pays twice and the refund is manual.
tags:
  - review
  - 'review:business'
generated:
  by: 'agent:impl'
  at: '2026-09-01T09:12:00.000Z'
verified: []
strauss_anchors:
  - file: src/checkout/pay.ts
    symbol: PaymentClient.charge
strauss_links:
  - target: test-obligation.checkout-single-charge
    rel: verified_by
  - target: fact.payment-provider-dedupes-on-key
    rel: depends_on
strauss_status: open
strauss_materiality: blocking
strauss_confidence: medium
---
## Risk

The key used to derive from the cart hash, which changes when a line is edited mid-retry.

## Why it matters

The provider deduplicates on the key only, so a rotated key is a second charge.

## Mitigation

idempotencyKey now returns the order id, which PaymentClient.charge receives already assigned.

## Verification

`node --test --experimental-strip-types src/checkout/checkout.spec.ts` edits the cart
mid-retry and asserts the provider recorded one charge.

Verified by [test-obligation.checkout-single-charge](test-obligation.checkout-single-charge.md).

Depends on [fact.payment-provider-dedupes-on-key](fact.payment-provider-dedupes-on-key.md).
