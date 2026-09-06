---
type: risk
title: Subscription state lives in a vendor we do not control
tags:
  - billing
  - vendors
generated:
  by: meridian-commerce
  at: "2026-03-16"
strauss_status: open
strauss_materiality: non-blocking
strauss_owner: meridian-commerce
---

## Risk

Plans, proration, and dunning history are authoritative in the billing provider; migrating away means reconstructing them.

## Why it matters

The cost of leaving grows with the subscription count, and pricing changes on the vendor's side are not ours to schedule.

## Mitigation

The local mirror keeps enough of the subscription history to reconstruct entitlement without the vendor.

## Verification

A periodic job replays the mirror and asserts entitlement matches what the provider reports.
