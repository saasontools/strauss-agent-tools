---
type: fact
title: The payment provider deduplicates on the idempotency key alone
description: >-
  A retry that sends a different key is a second charge, not a retry, and the
  refund is manual.
sources:
  - id: provider-guide
    resource: 'https://example.invalid/payments/idempotency'
    title: 'Provider idempotency guide, section 4.2'
generated:
  by: 'agent:impl'
  at: '2026-09-01T09:04:00.000Z'
verified: []
strauss_anchors:
  - file: src/checkout/pay.ts
    symbol: PaymentClient.charge
strauss_status: accepted
---
## Claim

The provider matches a submission against the last 24 hours by idempotency key; amount and cart contents are not part of the match.

## Evidence

Provider integration guide, section 4.2.[^provider-guide]

## Implication

Everything the key derives from must be fixed before the first attempt.

[^provider-guide]: Provider idempotency guide, section 4.2
