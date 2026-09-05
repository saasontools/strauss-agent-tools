---
type: risk
title: A partial refund leaves the order marked paid in full
description: >-
  Finance reconciles against the order, so a partial refund silently disappears
  from the ledger.
tags:
  - review
  - 'review:data'
generated:
  by: 'agent:impl'
  at: '2026-09-01T09:17:00.000Z'
verified: []
strauss_anchors:
  - file: src/checkout/pay.ts
    symbol: PaymentClient.charge
strauss_status: open
strauss_materiality: important
strauss_confidence: low
---
## Risk

charge() returns the provider id but nothing records how much of it was later refunded.

## Why it matters

The order total is the only figure reconciliation reads.

## Mitigation

None in this change. The refund path is unwritten.

## Verification

None.
