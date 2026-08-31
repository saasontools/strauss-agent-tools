---
type: decision
title: Failed deliveries retry five times with exponential backoff and full jitter
tags:
  - reliability
  - notifications
generated:
  by: meridian-notify
  at: "2026-02-24"
strauss_status: accepted
strauss_supersedes:
  - decision.delivery-retry-policy
strauss_confidence: high
strauss_owner: meridian-notify
---

## Decision

A failed notification or webhook delivery is retried five times. The delay is exponential from a one-second base with full jitter, capped at five minutes, after which the message goes to the dead-letter stream.

## Rationale

A receiver's brief outage lasts longer than a worker's patience, and workers retrying on a common schedule turn that outage into a synchronised stampede. Full jitter spreads the load, and a budget measured in minutes outlasts most receivers' own restart window.

## Rejected

Linear backoff, which spreads the stampede but does not outlast a restart. Unbounded retry with no dead-letter, which hides a permanently broken endpoint.

## Impact

Worst-case delivery latency is roughly eleven minutes. The dead-letter stream carries its own replay command, and its depth is alerted on.
