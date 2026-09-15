---
type: test-obligation
title: A retried checkout charges exactly once
description: The double-charge risk has no guard other than this test.
tags:
  - review
generated:
  by: 'agent:impl'
  at: '2026-09-01T09:10:00.000Z'
verified: []
strauss_anchors:
  - file: src/checkout/checkout.spec.ts
strauss_status: open
---
## Obligation

Retry with the cart edited mid-flight; assert the provider recorded one charge.

## Why it matters

Production cannot detect a double charge before the customer does.

## How to verify

node --test --experimental-strip-types src/checkout/checkout.spec.ts
