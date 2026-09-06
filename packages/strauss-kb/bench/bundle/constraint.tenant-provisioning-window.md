---
type: constraint
title: A tenant must be usable within five minutes of signup
tags:
  - multi-tenancy
  - product
generated:
  by: meridian-platform
  at: "2026-03-26"
strauss_status: accepted
strauss_confidence: medium
strauss_owner: meridian-platform
---

## Claim

Provisioning a new tenant -- storage, keys, seed data -- must complete within five minutes of signup, unattended.

## Evidence

Self-serve signup is the primary acquisition path and the onboarding funnel measurably drops off past that point.

## Implication

Any provisioning step that needs a human, or that queues behind a long-running migration, breaks self-serve signup.
