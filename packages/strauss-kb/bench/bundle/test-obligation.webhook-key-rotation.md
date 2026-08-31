---
type: test-obligation
title: Webhook signature verification survives a key rotation
tags:
  - webhooks
  - security
  - testing
generated:
  by: meridian-notify
  at: "2026-05-05"
strauss_status: open
strauss_materiality: important
strauss_owner: meridian-notify
---

## Obligation

A receiver holding the previous public key must keep verifying successfully throughout the overlap window, and must fail once the old key is withdrawn.

## Why it matters

Rotation without an overlap window silently breaks every receiver at once, and the failure surfaces as missing events rather than an error.

## How to verify

Sign with the new key while the old key is still published, verify with both, withdraw the old key, and assert verification then fails.
