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

The fixed-gap policy turned a receiver's brief outage into a synchronised stampede from every worker, and the three-attempt budget expired inside most receivers' own restart window.

## Rejected

Linear backoff, which spreads the stampede but does not outlast a restart. Unbounded retry with no dead-letter, which hides a permanently broken endpoint.

## Impact

Worst-case delivery latency rises to roughly eleven minutes. The dead-letter stream replaces the failure table and has its own replay command.
