---
type: constraint
title: The platform never stores cardholder data
tags:
  - compliance
  - billing
generated:
  by: meridian-commerce
  at: "2025-11-27"
strauss_status: accepted
strauss_confidence: high
strauss_owner: meridian-commerce
---

## Claim

No system in the platform receives, stores, or transmits a primary account number. Card entry happens in the provider's hosted fields and the platform sees only a token.

## Evidence

The billing integration uses hosted payment elements, and the API rejects any request body carrying a field that matches a card-number shape.

## Implication

PCI scope stays at SAQ-A. Any feature that would put a card number in a platform request invalidates that and is out of bounds.
