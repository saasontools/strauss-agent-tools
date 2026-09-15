---
type: risk
title: >-
  Raising the base retry count to five turns a throttled table into a retry
  storm
description: >-
  Five attempts per caller against a throttled table extends the outage instead
  of riding it out.
tags:
  - review
  - 'review:performance'
generated:
  by: 'agent:impl'
  at: '2026-09-01T09:14:00.000Z'
verified: []
strauss_anchors:
  - file: src/repositories/base.repository.ts
    symbol: BaseRepository.withRetry
strauss_links:
  - target: constraint.repository-retry-policy
    rel: depends_on
strauss_status: resolved
strauss_materiality: blocking
strauss_confidence: low
---
## Risk

withRetry now runs five attempts with linear backoff, so a throttled table sees more load the longer it is throttled.

## Why it matters

The store sheds load by throttling; retrying harder removes the only relief it has.

## Mitigation

Backoff stays linear on baseDelayMs, so the fifth attempt lands 250 ms out rather than 800 ms.

## Verification

None yet. The load shape is not covered by a test.

Depends on [constraint.repository-retry-policy](constraint.repository-retry-policy.md).
