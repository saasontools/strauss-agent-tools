---
type: decision
title: Failed deliveries retry three times, one second apart
tags:
  - reliability
  - notifications
generated:
  by: meridian-notify
  at: "2025-10-02"
strauss_status: superseded
strauss_superseded_by: decision.backoff-retry-policy
strauss_owner: meridian-notify
---

## Decision

A failed notification or webhook delivery is retried three times with a fixed one-second gap, then moved to the failure table.

## Rationale

Most failures observed in the first month were single-packet blips that a second attempt cleared.

## Rejected

Exponential backoff, which was judged unnecessary complexity for a three-attempt budget.

## Impact

A delivery either succeeds within four seconds or is on the failure table. Operators replay the failure table by hand.
